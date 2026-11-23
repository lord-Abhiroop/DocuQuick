import * as pdfjsLib from "./lib/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "./lib/pdf.worker.min.mjs";
var pages = document.getElementById("pages");
var PAGE_WIDTH = pages.clientWidth || window.innerWidth;
var DPR_FALLBACK = Math.min(window.devicePixelRatio || 1, 2);
var BASE_HEADROOM = 2;
var MAX_SIDE = 8192;
var BASE_MAX_PIXELS = 8e6;
function baseScale() {
var w = vwPhysicalWidth();
return w ? Math.min((w / PAGE_WIDTH) * BASE_HEADROOM, DPR_FALLBACK) : DPR_FALLBACK;
}
function gateScale() {
var w = vwPhysicalWidth();
return w ? Math.min((w / PAGE_WIDTH) * 1.1, DPR_FALLBACK) : DPR_FALLBACK;
}
function liveScale() {
var vv = window.visualViewport;
if (!vv || !(vv.width > 0)) return DPR_FALLBACK;
var w = vwPhysicalWidth();
return w ? w / vv.width : DPR_FALLBACK * (PAGE_WIDTH / vv.width);
}
function within(w, h, maxPixels) {
var f = 1;
if (w > MAX_SIDE) f = Math.min(f, MAX_SIDE / w);
if (h > MAX_SIDE) f = Math.min(f, MAX_SIDE / h);
if (w * h > maxPixels) f = Math.min(f, Math.sqrt(maxPixels / (w * h)));
return f;
}
var MAX_IN_FLIGHT = 3;
var DRAW_PAGES = 3;
var KEEP_PAGES = 5;
var PAGE_PITCH = 0;
var doc = null;
var slots = [];
var queue = [];
var inFlight = 0;
var tileQueue = [];
var finding = {
query: "",
pages: null,
matches: [],
active: -1,
building: false,
built: 0
};
function shape(box, unscaled) {
box.style.aspectRatio = String(unscaled.width / unscaled.height);
}
function distance(slot) {
var r = slot.canvas.getBoundingClientRect();
return Math.abs(r.top + r.height / 2 - window.innerHeight / 2);
}
function want(slot) {
if (slot.state !== "blank") return;
slot.state = "queued";
queue.push(slot);
}
function unwant(slot) {
if (slot.state === "queued") {
var i = queue.indexOf(slot);
if (i >= 0) queue.splice(i, 1);
if (slot.held) blank(slot); else slot.state = "blank";
} else if (slot.state === "drawing" && slot.task) {
slot.task.cancel();
}
}
function release(slot) {
if (slot.state !== "drawn") return;
blank(slot);
}
function blank(slot) {
slot.canvas.width = 0;
slot.canvas.height = 0;
if (slot.fresh) {
slot.fresh.width = 0;
slot.fresh.height = 0;
slot.fresh = null;
}
slot.held = false;
slot.state = "blank";
slot.unscaled = null;
slot.mode = null;
slot.shrink = null;
slot.pictures = null;
dropTile(slot);
if (slot.layer) {
slot.layer.cancel();
slot.layer = null;
}
slot.text.replaceChildren();
if (slot.page) {
slot.page.cleanup();
slot.page = null;
}
}
function pump() {
while (inFlight < MAX_IN_FLIGHT) {
if (tileQueue.length) { drawTile(tileQueue.shift()); continue; }
if (!queue.length) return;
var next = 0;
var best = distance(queue[0]);
for (var i = 1; i < queue.length; i++) {
var d = distance(queue[i]);
if (d < best) { next = i; best = d; }
}
draw(queue.splice(next, 1)[0]);
}
}
var inverted = !!window.vwNight;
function imageQuads(page, sx, ox, sy, oy) {
var raw = page && page.imageCoordinates;
if (!raw || !raw.length) return [];
var out = [];
for (var i = 0; i + 5 < raw.length; i += 6) {
var ax = raw[i], ay = raw[i + 1];
var bx = raw[i + 2], by = raw[i + 3];
var cx = raw[i + 4], cy = raw[i + 5];
if (!(Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) > 0)) continue;
var pax = Math.round(ax * sx + ox), pay = Math.round(ay * sy + oy);
var pbx = Math.round(bx * sx + ox), pby = Math.round(by * sy + oy);
var pcx = Math.round(cx * sx + ox), pcy = Math.round(cy * sy + oy);
out.push([
pax, pay,
pbx, pby,
pbx + pcx - pax, pby + pcy - pay,
pcx, pcy
]);
}
return out;
}
var PROBE_WIDTH = 256;
var PROBE_SATURATION = 0.15;
var PROBE_PAPER = 0.25;
var PROBE_MIN_SAMPLES = 4;
var probeCanvas = null;
function pageSample(ctx) {
var w = Math.max(1, Math.min(PROBE_WIDTH, ctx.canvas.width));
var h = Math.max(1, Math.round(w * ctx.canvas.height / ctx.canvas.width));
if (!probeCanvas) probeCanvas = document.createElement("canvas");
if (probeCanvas.width !== w || probeCanvas.height !== h) {
probeCanvas.width = w;
probeCanvas.height = h;
}
var p = probeCanvas.getContext("2d", { willReadFrequently: true });
p.clearRect(0, 0, w, h);
p.drawImage(ctx.canvas, 0, 0, w, h);
return {
w: w, h: h,
data: p.getImageData(0, 0, w, h).data,
sx: w / ctx.canvas.width,
sy: h / ctx.canvas.height
};
}
function looksLikePaper(sample, q) {
if (!sample) return false;
var xs = [q[0], q[2], q[4], q[6]];
var ys = [q[1], q[3], q[5], q[7]];
var x0 = Math.max(0, Math.floor(Math.min.apply(null, xs) * sample.sx));
var y0 = Math.max(0, Math.floor(Math.min.apply(null, ys) * sample.sy));
var x1 = Math.min(sample.w, Math.ceil(Math.max.apply(null, xs) * sample.sx));
var y1 = Math.min(sample.h, Math.ceil(Math.max.apply(null, ys) * sample.sy));
var d = sample.data, pale = 0, sat = 0, n = 0;
for (var y = y0; y < y1; y++) {
for (var x = x0; x < x1; x++) {
var o = (y * sample.w + x) * 4;
var r = d[o], g = d[o + 1], b = d[o + 2];
var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
if (mn > 204) pale++;
if (mx > 0) sat += (mx - mn) / mx;
n++;
}
}
if (n < PROBE_MIN_SAMPLES) return false;
return (sat / n) < PROBE_SATURATION && (pale / n) > PROBE_PAPER;
}
function recolour(ctx, keep) {
ctx.save();
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.globalAlpha = 1;
ctx.globalCompositeOperation = "source-over";
for (var i = 0; i < keep.length; i++) {
var q = keep[i];
ctx.beginPath();
ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
ctx.moveTo(q[0], q[1]);
ctx.lineTo(q[2], q[3]);
ctx.lineTo(q[4], q[5]);
ctx.lineTo(q[6], q[7]);
ctx.closePath();
ctx.clip("evenodd");
}
ctx.filter = "url(#vw-invert)";
ctx.drawImage(ctx.canvas, 0, 0);
ctx.restore();
}
function setNight(on) {
if (on === inverted) return;
inverted = on;
document.documentElement.classList.toggle("vw-night", on);
for (var i = 0; i < slots.length; i++) {
var s = slots[i];
if (s.state === "drawn" && s.mode !== inverted) redraw(s, true);
}
pump();
}
function redraw(slot, ask) {
if (slot.state !== "drawn") return;
if (!onScreen(slot)) {
blank(slot);
if (ask) want(slot);
return;
}
dropTile(slot);
slot.held = true;
slot.state = "queued";
queue.push(slot);
}
function onScreen(slot) {
var vv = window.visualViewport;
var r = slot.box.getBoundingClientRect();
var top = vv ? vv.offsetTop : 0;
var bottom = vv ? top + vv.height : window.innerHeight;
return r.bottom > top && r.top < bottom;
}
function draw(slot) {
slot.state = "drawing";
inFlight++;
var mode = inverted;
var at = shrink;
return doc.getPage(slot.n).then(function (page) {
slot.page = page;
var unscaled = page.getViewport({ scale: 1 });
shape(slot.box, unscaled);
slot.unscaled = unscaled;
var cssScale = PAGE_WIDTH / unscaled.width;
var scale = cssScale * at * baseScale();
scale *= within(unscaled.width * scale, unscaled.height * scale, BASE_MAX_PIXELS);
var viewport = unscaled.clone({ scale: scale });
var canvas = document.createElement("canvas");
canvas.width = viewport.width;
canvas.height = viewport.height;
slot.fresh = canvas;
var ctx = canvas.getContext("2d");
slot.task = page.render({
canvasContext: ctx,
viewport: viewport,
recordImages: mode
});
return slot.task.promise.then(function () {
if (mode) {
var quads = imageQuads(page, canvas.width, 0, canvas.height, 0);
var sample = quads.length ? pageSample(ctx) : null;
slot.pictures = quads.map(function (q) { return !looksLikePaper(sample, q); });
recolour(ctx, quads.filter(function (q, i) { return slot.pictures[i]; }));
}
slot.mode = mode;
slot.shrink = at;
var old = slot.canvas;
slot.box.replaceChild(canvas, old);
old.width = 0;
old.height = 0;
slot.canvas = canvas;
slot.fresh = null;
var held = slot.held;
slot.held = false;
if (held && slot.layer) return;
return textLayerFor(slot, page, unscaled.clone({ scale: cssScale }));
});
}).then(function () {
slot.state = "drawn";
if (slot.mode !== inverted || !sizedForNow(slot)) {
redraw(slot, true);
return;
}
if (finding.query) { paint(); reveal(); }
scheduleRefine();
}, function () {
blank(slot);
}).then(function () {
slot.task = null;
inFlight--;
pump();
});
}
var TILE_GATE = 1.25;
var TILE_MARGIN = 0.2;
var TILE_MAX_PIXELS = 6e6;
var MAX_TILES = 2;
var TILE_SETTLE_MS = 150;
function shed(tile) {
if (!tile) return;
var task = tile.task;
tile.task = null;
if (task) task.cancel();
if (tile.canvas.parentNode) tile.canvas.parentNode.removeChild(tile.canvas);
tile.canvas.width = 0;
tile.canvas.height = 0;
}
function dropTile(slot) {
shed(slot.pending);
shed(slot.tile);
slot.pending = null;
slot.tile = null;
}
function drawTile(req) {
var slot = req.slot;
if (slot.state !== "drawn" || !slot.page || !slot.unscaled) return;
shed(slot.pending);
var mode = inverted;
var canvas = document.createElement("canvas");
canvas.className = "tile";
canvas.setAttribute("aria-hidden", "true");
canvas.width = req.cw;
canvas.height = req.ch;
var tile = {
canvas: canvas,
x: req.x, y: req.y, w: req.w, h: req.h, k: req.k, task: null
};
slot.pending = tile;
var cssScale = PAGE_WIDTH / slot.unscaled.width;
var ctx = canvas.getContext("2d");
tile.task = slot.page.render({
canvasContext: ctx,
recordImages: mode,
viewport: slot.unscaled.clone({ scale: cssScale * req.k }),
transform: [1, 0, 0, 1, -req.x * req.k, -req.y * req.k]
});
inFlight++;
tile.task.promise.then(function () {
tile.task = null;
if (slot.pending !== tile) { shed(tile); return; }
slot.pending = null;
if (mode !== inverted) { shed(tile); return; }
if (mode) {
var seen = slot.pictures;
recolour(ctx, imageQuads(
slot.page,
req.boxW * req.k, -req.x * req.k,
req.boxH * req.k, -req.y * req.k
).filter(function (q, i) {
return !seen || seen[i];
}));
}
canvas.style.left = String((req.x / req.boxW) * 100) + "%";
canvas.style.top = String((req.y / req.boxH) * 100) + "%";
canvas.style.width = String((req.w / req.boxW) * 100) + "%";
canvas.style.height = String((req.h / req.boxH) * 100) + "%";
slot.box.insertBefore(canvas, slot.text);
shed(slot.tile);
slot.tile = tile;
}, function () {
tile.task = null;
if (slot.pending === tile) slot.pending = null;
shed(tile);
}).then(function () {
inFlight--;
pump();
});
}
function refine() {
if (!doc || !slots.length) return;
var vv = window.visualViewport;
if (!vv || !(vv.width > 0) || !(vv.height > 0)) return;
tileQueue.length = 0;
var k = liveScale();
var i;
if (shrink < 1 || !(k > gateScale() * TILE_GATE)) {
for (i = 0; i < slots.length; i++) dropTile(slots[i]);
return;
}
var top = vv.offsetTop;
var bottom = top + vv.height;
var left = vv.offsetLeft;
var right = left + vv.width;
var middle = top + vv.height / 2;
var lo = 0, hi = slots.length - 1, from = slots.length;
while (lo <= hi) {
var mid = (lo + hi) >> 1;
if (slots[mid].box.getBoundingClientRect().bottom > top) {
from = mid; hi = mid - 1;
} else {
lo = mid + 1;
}
}
var showing = [];
for (i = from; i < slots.length; i++) {
var r = slots[i].box.getBoundingClientRect();
if (r.top >= bottom) break;
showing.push({
slot: slots[i], box: r,
away: Math.abs(r.top + r.height / 2 - middle)
});
}
showing.sort(function (a, b) { return a.away - b.away; });
var chosen = showing.slice(0, MAX_TILES);
for (i = 0; i < slots.length; i++) {
var keep = false;
for (var c = 0; c < chosen.length; c++) if (chosen[c].slot === slots[i]) keep = true;
if (!keep) dropTile(slots[i]);
}
for (i = 0; i < chosen.length; i++) {
var slot = chosen[i].slot;
var box = chosen[i].box;
if (slot.state !== "drawn" || !slot.unscaled) { dropTile(slot); continue; }
var vx = Math.max(box.left, left) - box.left;
var vy = Math.max(box.top, top) - box.top;
var vw = Math.min(box.right, right) - box.left - vx;
var vh = Math.min(box.bottom, bottom) - box.top - vy;
if (!(vw > 0) || !(vh > 0)) { dropTile(slot); continue; }
var room = Math.sqrt(TILE_MAX_PIXELS / (vw * k * vh * k));
var m = Math.max(0, Math.min(TILE_MARGIN, (room - 1) / 2));
var x = Math.max(0, vx - vw * m);
var y = Math.max(0, vy - vh * m);
var w = Math.min(box.width, vx + vw + vw * m) - x;
var h = Math.min(box.height, vy + vh + vh * m) - y;
var tk = k * within(w * k, h * k, TILE_MAX_PIXELS);
var px = Math.max(0, Math.floor(x * tk));
var py = Math.max(0, Math.floor(y * tk));
var cw = Math.min(Math.ceil((x + w) * tk), Math.floor(box.width * tk)) - px;
var ch = Math.min(Math.ceil((y + h) * tk), Math.floor(box.height * tk)) - py;
if (!(cw > 0) || !(ch > 0)) { dropTile(slot); continue; }
x = px / tk; y = py / tk; w = cw / tk; h = ch / tk;
if (covers(slot.tile, vx, vy, vw, vh, tk) ||
covers(slot.pending, vx, vy, vw, vh, tk)) continue;
tileQueue.push({
slot: slot, x: x, y: y, w: w, h: h, cw: cw, ch: ch, k: tk,
boxW: box.width, boxH: box.height
});
}
pump();
}
function covers(tile, vx, vy, vw, vh, k) {
if (!tile) return false;
if (Math.abs(tile.k - k) > tile.k * 0.15) return false;
return tile.x <= vx + 0.5 && tile.y <= vy + 0.5 &&
tile.x + tile.w >= vx + vw - 0.5 && tile.y + tile.h >= vy + vh - 0.5;
}
var tileTimer = 0;
function scheduleRefine() {
if (tileTimer) clearTimeout(tileTimer);
tileTimer = setTimeout(function () { tileTimer = 0; refine(); }, TILE_SETTLE_MS);
}
var SHRINK_LEAST = 0.25;
var shrink = 1;
function sizedForNow(slot) {
var r = slot.shrink / shrink;
return r < TILE_GATE && r > 1 / TILE_GATE;
}
function atFloor() {
var vv = window.visualViewport;
return !vv || !(vv.width > 0) || vv.width >= window.innerWidth - 0.5;
}
function columnTop() {
return (slots.length ? slots[0].box : pages).getBoundingClientRect().top;
}
function under(y) {
return (y - columnTop()) / shrink;
}
function perDp() {
var vv = window.visualViewport;
var across = vv && vv.scale > 0 ? vv.width * vv.scale : 0;
return across > 0 && window.innerWidth > 0 ? window.innerWidth / across : 1;
}
function setShrink(s) {
shrink = Math.min(1, Math.max(SHRINK_LEAST, s));
document.documentElement.style.setProperty("--vw-shrink", String(shrink));
document.documentElement.classList.toggle("vw-shrunk", shrink < 1);
}
function settle(s, at, y) {
pages.style.transform = "";
pages.style.transformOrigin = "";
pages.classList.remove("vw-moving");
var was = shrink;
setShrink(s);
window.scrollBy(0, columnTop() + at * shrink - y);
if (shrink === was) return;
var watched = slots.length > 1;
if (watched) observePages();
for (var i = 0; i < slots.length; i++) {
if (slots[i].state === "drawn" && !sizedForNow(slots[i])) redraw(slots[i], !watched);
}
pump();
schedulePageReport();
scheduleRefine();
if ((was < 1) !== (shrink < 1)) reportShrunk();
}
function reportShrunk() {
if (!searchPort) return;
if (shrink < 1) searchPort.postMessage("shrunk 1");
else if (reportedShrunk) searchPort.postMessage("shrunk 0");
reportedShrunk = shrink < 1;
}
var reportedShrunk = false;
var pinch = null;
function apart(e) {
var a = e.touches[0], b = e.touches[1];
return Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
}
function between(e) {
return (e.touches[0].clientY + e.touches[1].clientY) / 2;
}
function startPinch(e) {
finishAnimation();
pinch = {
apart: apart(e), from: shrink, to: shrink, taken: false,
at: 0, y0: between(e), y: between(e), sy: window.scrollY
};
}
function movePinch(e) {
var g = pinch;
var d = apart(e);
var y = between(e);
if (!g.taken) {
if (!atFloor() || (shrink >= 1 && d >= g.apart)) {
g.apart = d; g.y0 = y; g.sy = window.scrollY;
return;
}
g.taken = true;
g.at = under(y);
pages.style.transformOrigin = "50% " + (y - pages.getBoundingClientRect().top) + "px";
pages.classList.add("vw-moving");
}
g.y = y;
g.to = Math.min(1, Math.max(SHRINK_LEAST, g.from * d / g.apart));
var ty = y - g.y0 + window.scrollY - g.sy;
pages.style.transform = "translate(0px," + ty + "px) scale(" + (g.to / g.from) + ")";
}
function endPinch() {
var g = pinch;
pinch = null;
if (g.taken) settle(g.to, g.at, g.y);
}
var DOUBLE_TAP_MS = 250;
var DOUBLE_TAP_GAP_MS = 300;
var DOUBLE_TAP_SLOP_DP = 40;
var TAP_SLOP_DP = 12;
var tap = null;
var lastTap = null;
document.addEventListener("touchstart", function (e) {
if (!doc || !slots.length) return;
if (e.touches.length === 2) {
tap = lastTap = null;
startPinch(e);
} else if (e.touches.length === 1 && !pinch && shrink < 1 && pages.contains(e.target)) {
finishAnimation();
tap = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
} else {
tap = lastTap = null;
}
}, { passive: true });
document.addEventListener("touchmove", function (e) {
if (pinch && e.touches.length === 2) {
movePinch(e);
} else if (tap && e.touches.length === 1 &&
Math.abs(e.touches[0].clientX - tap.x) + Math.abs(e.touches[0].clientY - tap.y) >
TAP_SLOP_DP * perDp()) {
tap = null;
}
}, { passive: true });
function touchEnded(e) {
if (pinch && e.touches.length < 2) {
endPinch();
return;
}
if (!tap || e.touches.length) return;
var now = Date.now();
if (now - tap.t > DOUBLE_TAP_GAP_MS) { tap = null; return; }
if (lastTap && now - lastTap.t < DOUBLE_TAP_GAP_MS &&
Math.abs(tap.x - lastTap.x) + Math.abs(tap.y - lastTap.y) < DOUBLE_TAP_SLOP_DP * perDp()) {
lastTap = null;
zoomTo(1, tap.y, DOUBLE_TAP_MS);
} else {
lastTap = { x: tap.x, y: tap.y, t: now };
}
tap = null;
}
document.addEventListener("touchend", touchEnded, { passive: true });
document.addEventListener("touchcancel", function (e) {
tap = lastTap = null;
if (pinch && e.touches.length < 2) endPinch();
}, { passive: true });
var animation = null;
function finishAnimation() {
if (!animation) return;
var a = animation;
animation = null;
cancelAnimationFrame(a.frame);
settle(a.to, a.at, a.y);
}
function zoomTo(s, y, ms) {
finishAnimation();
if (!slots.length) return;
s = Math.min(1, Math.max(SHRINK_LEAST, s));
var at = under(y);
if (!ms) { settle(s, at, y); return; }
pages.style.transformOrigin = "50% " + (y - pages.getBoundingClientRect().top) + "px";
pages.classList.add("vw-moving");
var from = shrink, start = null;
animation = { to: s, at: at, y: y, frame: 0 };
function step(t) {
if (!animation) return;
if (start === null) start = t;
var f = Math.min(1, (t - start) / ms);
var eased = 1 - (1 - f) * (1 - f);
pages.style.transform = "scale(" + Math.pow(s / from, eased) + ")";
if (f >= 1) { finishAnimation(); return; }
animation.frame = requestAnimationFrame(step);
}
animation.frame = requestAnimationFrame(step);
}
window.vwPdfShrink = function (s, y) {
if (s === undefined) return shrink;
zoomTo(s, y === undefined ? window.innerHeight / 2 : y, 0);
return shrink;
};
function readTextZoom() {
var probe = document.createElement("div");
probe.style.cssText = "position:absolute;visibility:hidden;font-size:100px";
document.body.appendChild(probe);
var zoom = parseFloat(getComputedStyle(probe).fontSize) / 100;
probe.remove();
if (zoom > 0 && isFinite(zoom) && zoom !== 1) {
document.documentElement.style.setProperty("--vw-text-zoom", String(zoom));
}
}
readTextZoom();
function textLayerFor(slot, page, viewport) {
slot.text.style.setProperty(
"--total-scale-factor", String(viewport.scale * (viewport.userUnit || 1)));
var eols = [];
var layer = new pdfjsLib.TextLayer({
textContentSource: embedFonts(page.streamTextContent(), eols),
container: slot.text,
viewport: viewport
});
layer.vwEols = eols;
slot.layer = layer;
return layer.render().then(function () {
padRows(slot.text, layer.textDivs);
}, function () {
if (slot.layer === layer) slot.layer = null;
slot.text.replaceChildren();
});
}
function byTopThenLeft(a, b) { return a.top - b.top || a.left - b.left; }
function byLeft(a, b) { return a.left - b.left; }
function padRows(container, divs) {
var layer = container.getBoundingClientRect();
var mfs = parseFloat(container.style.getPropertyValue("--min-font-size")) || 1;
var drawnAt = layer.width / PAGE_WIDTH || 1;
function fitted(px) { return "calc(" + px.toFixed(2) + "px * var(--vw-shrink))"; }
var boxes = [];
for (var i = 0; i < divs.length; i++) {
var el = divs[i];
var rot = el.style.getPropertyValue("--rotate");
if (rot && parseFloat(rot)) continue;
var r = el.getBoundingClientRect();
if (!r.height) continue;
boxes.push({
el: el, top: r.top, bottom: r.bottom, left: r.left, right: r.right,
sx: (parseFloat(el.style.getPropertyValue("--scale-x")) || 1) / mfs
});
}
if (boxes.length < 2) return;
boxes.sort(byTopThenLeft);
var rows = [];
var row = null;
for (var j = 0; j < boxes.length; j++) {
var b = boxes[j];
if (!row || b.top - row.top > 2 * drawnAt) {
row = { top: b.top, bottom: b.bottom, items: [b] };
rows.push(row);
} else {
row.bottom = Math.max(row.bottom, b.bottom);
row.items.push(b);
}
}
for (var v = 0; v < rows.length; v++) {
var here = rows[v];
var up = (v ? (here.top - rows[v - 1].bottom) / 2 : here.top - layer.top) / drawnAt;
var floor = (v + 1 < rows.length)
? here.bottom + (rows[v + 1].top - here.bottom) / 2
: layer.bottom;
var across = here.items;
across.sort(byLeft);
for (var x = 0; x < across.length; x++) {
var it = across[x];
var style = it.el.style;
var down = (floor - it.bottom) / drawnAt;
if (down > 0.5) style.paddingBottom = fitted(down * mfs);
if (up > 0.5) {
style.paddingTop = fitted(up * mfs);
style.marginTop = fitted(-up);
}
var until = (x + 1 < across.length) ? across[x + 1].left : layer.right;
var reach = (until - it.right) / drawnAt;
if (reach > 1) style.paddingRight = fitted(reach / it.sx);
}
var first = across[0];
var leftNeed = (first.left - layer.left) / drawnAt;
if (leftNeed > 1) {
first.el.style.paddingLeft = fitted(leftNeed / first.sx);
first.el.style.marginLeft = fitted(-leftNeed);
}
}
}
var SELECT_EDGE_DP = 50;
var SELECT_EDGE_MIN = 10;
var SELECT_GAP_MS = 700;
var selectPrevY = null;
var selectPrevT = 0;
function extentRect(sel) {
try {
var r = document.createRange();
r.setStart(sel.focusNode, sel.focusOffset);
r.collapse(true);
var rects = r.getClientRects();
if (rects.length) return rects[0];
if (sel.focusNode.nodeType === 1) return sel.focusNode.getBoundingClientRect();
} catch (e) {}
return null;
}
function selectionEdgeScroll() {
var sel = window.getSelection();
if (!sel || !sel.rangeCount || sel.isCollapsed) { selectPrevY = null; return; }
var rect = extentRect(sel);
if (!rect) { selectPrevY = null; return; }
var vv = window.visualViewport;
if (!vv || !vv.height) return;
var y = rect.bottom + window.scrollY;
var now = performance.now();
var dragging = selectPrevY !== null && now - selectPrevT < SELECT_GAP_MS;
var travel = dragging ? y - selectPrevY : 0;
selectPrevY = y;
selectPrevT = now;
if (!dragging) return;
var band = SELECT_EDGE_DP / vv.scale;
var low = vv.offsetTop + vv.height - band;
var high = vv.offsetTop + band;
if (travel >= -2 && rect.bottom > low) {
window.scrollBy(0, Math.min(Math.max(rect.bottom - low, SELECT_EDGE_MIN), band));
} else if (travel <= 2 && rect.top < high) {
window.scrollBy(0, -Math.min(Math.max(high - rect.top, SELECT_EDGE_MIN), band));
}
}
document.addEventListener("selectionchange", selectionEdgeScroll);
function embedFonts(stream, eols) {
if (typeof TransformStream !== "function" || !stream.pipeThrough) return stream;
var families = null;
return stream.pipeThrough(new TransformStream({
transform: function (chunk, controller) {
var items = (chunk && chunk.items) || [];
for (var i = 0; i < items.length; i++) {
if (items[i].str !== undefined) eols.push(!!items[i].hasEOL);
}
var styles = chunk && chunk.styles;
for (var key in styles) {
var style = styles[key];
if (!style || !style.fontFamily) continue;
if (!families) families = loadedFamilies();
if (!families[key]) continue;
style.fontFamily = '"' + key + '", ' + style.fontFamily;
}
controller.enqueue(chunk);
}
}));
}
function loadedFamilies() {
var families = Object.create(null);
var set = document.fonts;
if (!set || typeof set.forEach !== "function") return families;
set.forEach(function (face) {
if (face.status !== "loaded") return;
var name = String(face.family || "").replace(/^(["'])([\s\S]*)\1$/, "$2");
if (name) families[name] = true;
});
return families;
}
function flatten(runs, eols) {
var text = "";
var map = [];
for (var i = 0; i < runs.length; i++) {
var run = String(runs[i] == null ? "" : runs[i]);
var cleaned = run.replace(/\s+/g, " ");
var spaced = !text || text.charAt(text.length - 1) === " ";
var lead = spaced && cleaned.charAt(0) === " " ? 1 : 0;
if (lead) cleaned = cleaned.slice(1);
if (cleaned) {
map.push({ at: text.length, len: cleaned.length, run: i, lead: lead });
text += cleaned;
} else {
map.push(null);
}
if ((!eols || eols[i]) && text && text.charAt(text.length - 1) !== " ") text += " ";
}
return { text: text, map: map };
}
var FOLD_PLAIN = /^[\x00-\x7f]*$/;
var FOLD_CLUSTER = /\P{M}\p{M}*|\p{M}+/gu;
function fold(s) {
if (FOLD_PLAIN.test(s)) return { text: s.toLowerCase(), from: null };
var text = "";
var from = null;
var m, k;
FOLD_CLUSTER.lastIndex = 0;
while ((m = FOLD_CLUSTER.exec(s))) {
var piece = m[0].toLowerCase().normalize("NFKC").replace(/\u03c2/g, "\u03c3");
if (!from && piece.length !== m[0].length) {
from = [];
for (k = 0; k < text.length; k++) from.push(k);
}
if (from) for (k = 0; k < piece.length; k++) from.push(m.index);
text += piece;
}
if (from) from.push(s.length);
return { text: text, from: from };
}
function unfolded(folded, at, len) {
if (!folded.from) return { at: at, len: len };
var from = folded.from;
var end = at + len;
while (end < from.length - 1 && from[end] === from[end - 1]) end++;
return { at: from[at], len: from[end] - from[at] };
}
function buildIndex() {
if (!doc) return;
if (finding.pages || finding.building) return;
finding.building = true;
finding.pages = new Array(doc.numPages);
finding.built = 0;
var next = 1;
function step() {
if (next > doc.numPages) {
finding.building = false;
report();
return;
}
var n = next++;
doc.getPage(n).then(function (page) {
return page.getTextContent().then(function (content) {
var runs = content.items.map(function (it) {
return typeof it.str === "string" ? it.str : "";
});
var eols = content.items.map(function (it) { return !!it.hasEOL; });
finding.pages[n - 1] = fold(flatten(runs, eols).text).text;
if (slots[n - 1].state === "blank") page.cleanup();
});
}).catch(function () {
finding.pages[n - 1] = "";
}).then(function () {
finding.built = n;
if (finding.query) {
var added = scanPage(n);
if (finding.active < 0 && finding.matches.length) {
stepTo(0);
} else {
if (added && slots[n - 1].state === "drawn") paint();
report();
}
}
step();
});
}
step();
}
function foldedQuery() { return fold(finding.query.replace(/\s+/g, " ")).text; }
function scanPage(n) {
var hay = finding.pages[n - 1];
if (!hay) return 0;
var q = foldedQuery();
if (!q) return 0;
var found = 0;
var at = hay.indexOf(q);
while (at !== -1) {
finding.matches.push({ page: n, at: at, len: q.length });
found++;
at = hay.indexOf(q, at + q.length);
}
return found;
}
function rerun() {
finding.matches = [];
if (finding.query && finding.pages) {
for (var n = 1; n <= finding.pages.length; n++) scanPage(n);
}
if (finding.active >= finding.matches.length) {
finding.active = finding.matches.length ? 0 : -1;
}
if (finding.active < 0 && finding.matches.length) finding.active = 0;
paint();
report();
}
var hitRanges = [];
var activeRanges = [];
function paint() {
if (!window.CSS || !CSS.highlights) return;
hitRanges = [];
activeRanges = [];
for (var i = 0; i < slots.length; i++) {
if (slots[i].state === "drawn") markSlot(slots[i]);
}
flush();
}
function flush() {
if (!window.CSS || !CSS.highlights) return;
if (hitRanges.length) CSS.highlights.set("vw-find", new Highlight(...hitRanges));
else CSS.highlights.delete("vw-find");
if (activeRanges.length) {
CSS.highlights.set("vw-find-active", new Highlight(activeRanges[0]));
} else {
CSS.highlights.delete("vw-find-active");
}
}
function markSlot(slot) {
if (!finding.query || !slot.layer) return;
var divs = slot.layer.textDivs;
var strs = slot.layer.textContentItemsStr;
if (!divs || !strs || !divs.length) return;
var eols = slot.layer.vwEols;
var flat = flatten(strs, eols && eols.length === strs.length ? eols : null);
var folded = fold(flat.text);
var hay = folded.text;
var q = foldedQuery();
if (!q) return;
var activeMatch = finding.matches[finding.active];
var nth = 0;
var at = hay.indexOf(q);
while (at !== -1) {
var found = unfolded(folded, at, q.length);
var r = rangeFor(divs, flat.map, found.at, found.len);
if (r) {
if (activeMatch && activeMatch.page === slot.n &&
nthOnPage(activeMatch) === nth) {
activeRanges.push(r);
} else {
hitRanges.push(r);
}
}
nth++;
at = hay.indexOf(q, at + q.length);
}
}
function nthOnPage(match) {
var n = 0;
for (var i = 0; i < finding.matches.length; i++) {
var m = finding.matches[i];
if (m.page !== match.page) continue;
if (m === match) return n;
n++;
}
return -1;
}
function rangeFor(divs, map, at, len) {
var end = at + len;
var range = document.createRange();
var started = false;
for (var i = 0; i < map.length; i++) {
var piece = map[i];
if (!piece) continue;
var pieceEnd = piece.at + piece.len;
if (pieceEnd <= at || piece.at >= end) continue;
var node = divs[piece.run] && divs[piece.run].firstChild;
if (!node) continue;
var max = node.length;
if (!started) {
range.setStart(node, Math.min(Math.max(at - piece.at, 0) + piece.lead, max));
started = true;
}
range.setEnd(node, Math.min(Math.max(end - piece.at, 0) + piece.lead, max));
}
return started ? range : null;
}
function stepTo(i) {
var n = finding.matches.length;
if (!n) { finding.active = -1; paint(); report(); return; }
finding.active = ((i % n) + n) % n;
var slot = slots[finding.matches[finding.active].page - 1];
slot.box.scrollIntoView({ block: "center" });
want(slot);
pump();
paint();
reveal();
report();
}
function reveal() {
if (!activeRanges.length) return;
var r = activeRanges[0].getBoundingClientRect();
if (!r.height && !r.width) return;
window.scrollBy(0, r.top - window.innerHeight / 2);
}
var searchPort = null;
function report() {
if (!searchPort) return;
var total = finding.matches.length;
var at = total && finding.active >= 0 ? finding.active + 1 : 0;
var done = finding.pages && !finding.building ? 1 : 0;
searchPort.postMessage(at + " " + total + " " + done);
}
var lastPageSent = 0;
var locked = false;
function reportLocked() {
if (searchPort && locked) searchPort.postMessage("locked");
}
function reportPage() {
if (!searchPort || !doc || doc.numPages < 2 || !slots.length || !PAGE_PITCH) return;
var vv = window.visualViewport;
if (!vv || !vv.height) return;
if (askedFor && Math.abs(vv.pageTop - askedFor.top) > 1) askedFor = null;
var n = askedFor ? askedFor.n : pageOnScreen(vv);
if (n === lastPageSent) return;
lastPageSent = n;
searchPort.postMessage("page " + n + " " + doc.numPages);
}
function pageOnScreen(vv) {
if (vv.pageTop <= 1) return 1;
if (vv.pageTop + vv.height >= document.documentElement.scrollHeight - 1) {
return slots.length;
}
var middle = vv.pageTop + vv.height / 2;
var lo = 0, hi = slots.length - 1, at = 0;
while (lo <= hi) {
var mid = (lo + hi) >> 1;
if (slots[mid].box.getBoundingClientRect().top + window.scrollY <= middle) {
at = mid; lo = mid + 1;
} else {
hi = mid - 1;
}
}
return at + 1;
}
var askedFor = null;
function bringIntoView(slot) {
var vv = window.visualViewport;
var shortPage = !!vv && slot.box.getBoundingClientRect().height <= vv.height / 2;
slot.box.scrollIntoView({ block: shortPage ? "center" : "start" });
askedFor = vv ? { n: slot.n, top: vv.pageTop } : null;
}
function place(slot) {
var unshaped = [slot.n - 1, slot.n].filter(function (n) {
return n >= 1 && !slots[n - 1].box.style.aspectRatio;
});
return Promise.all(unshaped.map(function (n) {
return doc.getPage(n).then(function (page) {
shape(slots[n - 1].box, page.getViewport({ scale: 1 }));
}, function () {
});
})).then(function () { bringIntoView(slot); });
}
var pageRaf = 0;
function schedulePageReport() {
if (pageRaf) return;
pageRaf = requestAnimationFrame(function () { pageRaf = 0; reportPage(); });
}
function moved() {
schedulePageReport();
scheduleRefine();
}
window.addEventListener("scroll", moved, { passive: true });
if (window.visualViewport) {
window.visualViewport.addEventListener("scroll", moved, { passive: true });
window.visualViewport.addEventListener("resize", moved, { passive: true });
}
window.addEventListener("message", function (e) {
if (!e.ports || !e.ports.length || searchPort) return;
searchPort = e.ports[0];
searchPort.onmessage = function (m) {
try { onCommand(String(m.data || "")); } catch (err) { report(); }
};
searchPort.start();
reportPage();
reportLocked();
reportShrunk();
});
function onCommand(msg) {
if (vwBarSaid(msg)) return;
var verb = msg.charAt(0);
if (verb === "q") {
var q = msg.slice(1);
if (q === finding.query) return;
finding.query = q;
finding.active = q ? 0 : -1;
if (!q) { finding.matches = []; paint(); report(); return; }
if (!finding.pages) { buildIndex(); report(); return; }
rerun();
stepTo(0);
} else if (verb === "n") {
stepTo(finding.active + 1);
} else if (verb === "p") {
stepTo(finding.active - 1);
} else if (verb === "i") {
setNight(msg.charAt(1) === "1");
} else if (verb === "c") {
finding.query = "";
finding.matches = [];
finding.active = -1;
paint();
report();
} else if (verb === "g") {
var n = Math.floor(Number(msg.slice(1)));
if (!doc || !slots.length || !(n >= 1 && n <= slots.length)) return;
var target = slots[n - 1];
place(target).then(function () {
want(target);
pump();
reportPage();
scheduleRefine();
});
}
}
function vwAskPassword(updatePassword, reason) {
locked = true;
reportLocked();
var el = document.getElementById("vw-status");
if (!el) {
el = document.createElement("div");
el.id = "vw-status";
document.body.insertBefore(el, document.body.firstChild);
}
el.className = "vw-status vw-ask";
el.style.display = "";
el.innerHTML = "";
var title = document.createElement("div");
title.className = "vw-ask-title";
title.textContent = "This PDF is password protected";
el.appendChild(title);
var retryNote = null;
if (reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD) {
retryNote = document.createElement("div");
retryNote.id = "vw-pw-alert";
retryNote.className = "vw-ask-alert";
retryNote.setAttribute("role", "alert");
retryNote.textContent = "That password did not work.";
el.appendChild(retryNote);
}
var label = document.createElement("label");
label.className = "vw-ask-label";
label.htmlFor = "vw-pw";
label.textContent = "Enter its password to open it.";
el.appendChild(label);
var row = document.createElement("form");
row.className = "vw-ask-row";
var input = document.createElement("input");
input.type = "password";
input.id = "vw-pw";
input.className = "vw-ask-input";
if (retryNote) input.setAttribute("aria-describedby", retryNote.id);
input.autocomplete = "off";
input.setAttribute("autocapitalize", "none");
input.setAttribute("autocorrect", "off");
input.spellcheck = false;
var btn = document.createElement("button");
btn.type = "submit";
btn.className = "vw-ask-btn";
btn.textContent = "Open";
row.appendChild(input);
row.appendChild(btn);
el.appendChild(row);
row.addEventListener("submit", function (e) {
e.preventDefault();
if (!input.value) {
input.focus();
return;
}
var pw = input.value;
input.value = "";
vwStatus("Opening document…");
updatePassword(pw);
});
input.focus();
}
function vwUnlockable(task) {
task.onPassword = vwAskPassword;
return task.promise;
}
function vwAssetUrl(path) {
return new URL(path, document.baseURI).href;
}
function vwWithAssets(opts) {
opts.cMapUrl = vwAssetUrl("./lib/cmaps/");
opts.cMapPacked = true;
opts.wasmUrl = vwAssetUrl("./lib/wasm/");
return opts;
}
function vwOpenDoc() {
return vwParams.get("ranged") !== "1"
? vwFetchDoc("buffer").then(function (buf) {
return vwUnlockable(pdfjsLib.getDocument(vwWithAssets({ data: buf })));
})
: vwUnlockable(pdfjsLib.getDocument(vwWithAssets({
url: vwDocUrl(),
rangeChunkSize: 65536,
disableAutoFetch: true,
disableStream: true
})));
}
function vwFailure(e) {
if (/encryption|crypto/i.test(String(e && e.message))) {
return [
"This PDF is protected in a way DocuQuick cannot open",
"It is encrypted, but not with the password scheme its renderer reads, so " +
"there is nothing you could type here that would open it. Every other " +
"format DocuQuick opens still works."
];
}
switch (e && e.name) {
case "PasswordException":
return [
"This PDF could not be unlocked",
"The password was not accepted. If the file opens elsewhere, its " +
"protection is of a kind DocuQuick cannot read yet."
];
case "InvalidPDFException":
return [
"This file is not a PDF that can be read",
"It is either damaged or not a PDF at all, whatever it happens to be " +
"named. Every other format DocuQuick opens still works."
];
case "ResponseException":
return [
"This PDF could not be read to the end",
"DocuQuick lost access to the file part way through loading it. Opening it " +
"again usually settles this."
];
default:
return ["Could not render this PDF", String(e)];
}
}
var draws = null;
var keeps = null;
function observePages() {
if (draws) draws.disconnect();
if (keeps) keeps.disconnect();
var pitch = PAGE_PITCH * shrink;
draws = new IntersectionObserver(function (entries) {
entries.forEach(function (e) {
if (e.isIntersecting) want(e.target._slot); else unwant(e.target._slot);
});
pump();
}, { rootMargin: Math.round(DRAW_PAGES * pitch) + "px 0px" });
keeps = new IntersectionObserver(function (entries) {
entries.forEach(function (e) {
if (!e.isIntersecting) release(e.target._slot);
});
}, { rootMargin: Math.round(KEEP_PAGES * pitch) + "px 0px" });
slots.forEach(function (slot) {
draws.observe(slot.box);
keeps.observe(slot.box);
});
}
if (!vwPdfBlocked) {
vwOpenDoc()
.then(function (opened) {
doc = opened;
var frag = document.createDocumentFragment();
for (var i = 1; i <= doc.numPages; i++) {
var box = document.createElement("div");
box.className = "pg";
var c = document.createElement("canvas");
box.appendChild(c);
var tl = document.createElement("div");
tl.className = "textLayer";
box.appendChild(tl);
var gap = document.createElement("div");
gap.className = "vw-gap";
box.appendChild(gap);
var slot = {
n: i, box: box, canvas: c, text: tl,
state: "blank", mode: null, shrink: null, pictures: null, task: null, page: null,
layer: null, unscaled: null, tile: null, pending: null,
fresh: null, held: false
};
box._slot = slot;
slots.push(slot);
frag.appendChild(box);
}
pages.appendChild(frag);
return doc.getPage(1);
})
.then(function (page) {
var unscaled = page.getViewport({ scale: 1 });
pages.style.setProperty(
"--pg-ratio", String(unscaled.width / unscaled.height));
PAGE_PITCH = PAGE_WIDTH * (unscaled.height / unscaled.width) +
(parseFloat(getComputedStyle(document.documentElement)
.getPropertyValue("--pg-gap")) || 8);
var first = slots[0];
var resumeAt = Math.floor(Number(vwParams.get("resume")));
if (resumeAt >= 2 && resumeAt <= slots.length) {
first = slots[resumeAt - 1];
return place(first).then(function () { return draw(first); });
}
return draw(first);
})
.then(function () {
vwStatusDone();
if (doc.numPages > 1) observePages();
reportPage();
if (finding.query) { buildIndex(); report(); }
})
.catch(function (e) {
var said = vwFailure(e);
vwError(said[0], said[1]);
});
}