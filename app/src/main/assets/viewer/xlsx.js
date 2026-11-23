function readWorkbook(bytes) {
var text = null;
try {
text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
} catch (e) {
}
return text === null
? XLSX.read(bytes, { type: "array", cellDates: true, dense: true, bookFiles: true })
: XLSX.read(text, { type: "string", cellDates: true, dense: true });
}
var PIECE_CELLS = 5000;
var PIECE_ROWS_MIN = 20;
var PIECE_ROWS_MAX = 500;
var HEAD_HEIGHT = 20;
var HEAD_WIDTH_MIN = 26;
var HEAD_DIGIT = 8;
var FIT_ROWS = 500;
var FIT_WIDEST = 400;
var FROZEN_MOST = 0.5;
var SPARE_ROWS_MOST = 200;
var CELL_MOST_CHARS = 32767;
var ROW_MOST_PX = 545;
var MERGE_REACH = 200;
var FIT_CELLS = 20000;
var ZOOM_LEAST = 0.25;
var ZOOM_MOST = 4;
var NUMBER_RUN_ON = 0.25;
var DOUBLE_TAP_ZOOM = 2;
var DOUBLE_TAP_MS = 250;
var DOUBLE_TAP_GAP_MS = 300;
var DOUBLE_TAP_SLOP = 40;
var TAP_SLOP = 12;
function columnName(c) {
var s = "";
for (c += 1; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + (c - 1) % 26) + s;
return s;
}
function escapeHtml(s) {
return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function generalNumber(v, places, power) {
if (v === 0) return "0";
var big = power || Math.abs(v) >= 1e11 || Math.abs(v) < 1e-9;
if (!big) {
var fixed = Number(v.toPrecision(places));
var text = String(fixed);
if (!/e/i.test(text)) return text;
}
var e = v.toExponential(Math.max(0, places - 1)).split("e");
var mantissa = e[0].indexOf(".") >= 0 ? e[0].replace(/0+$/, "").replace(/\.$/, "") : e[0];
var exp = +e[1];
return mantissa + "E" + (exp < 0 ? "-" : "+") + (Math.abs(exp) < 10 ? "0" : "") + Math.abs(exp);
}
function dateValue(date) {
if (isNaN(date.getTime())) return "";
var iso = date.toISOString();
var day = iso.slice(0, 10), time = iso.slice(11, 19);
if (day === "1899-12-30" || day === "1899-12-31") return time;
return time === "00:00:00" ? day : day + " " + time;
}
function firstAtLeast(list, v) {
var lo = 0, hi = list.length;
while (lo < hi) {
var mid = (lo + hi) >> 1;
if (list[mid] < v) lo = mid + 1; else hi = mid;
}
return lo;
}
var WIDEST_CHAR = 1.25;
var measure = (function () {
var context = null;
var font = "";
return function (text, cssFont) {
if (!context) context = document.createElement("canvas").getContext("2d");
if (cssFont !== font) context.font = font = cssFont;
return context.measureText(text).width;
};
})();
var FORMAT_COLOURS = {
black: "000000", blue: "0000FF", cyan: "00FFFF", green: "00FF00", magenta: "FF00FF",
red: "FF0000", white: "FFFFFF", yellow: "FFFF00"
};
function formatColour(z, v) {
if (typeof z !== "string" || z.indexOf("[") < 0 || typeof v !== "number") return null;
var sections = [], part = "", quoted = false;
for (var i = 0; i < z.length; i++) {
var ch = z.charAt(i);
if (ch === '"') quoted = !quoted;
if (ch === "\\" && !quoted) { part += ch + z.charAt(++i); continue; }
if (ch === ";" && !quoted) { sections.push(part); part = ""; continue; }
part += ch;
}
sections.push(part);
var section = v < 0 && sections.length > 1 ? sections[1] : v === 0 && sections.length > 2 ? sections[2] : sections[0];
var m = /\[(black|blue|cyan|green|magenta|red|white|yellow|colou?r\s*(\d+))\]/i.exec(section);
if (!m) return null;
if (m[2]) {
var n = +m[2];
return n >= 1 && n <= 56 ? VW_XL_PALETTE[7 + n] : null;
}
return FORMAT_COLOURS[m[1].toLowerCase()];
}
function Sheet(wb, index, styles) {
this.index = index;
this.name = wb.SheetNames[index];
this.ws = wb.Sheets[this.name];
this.data = this.ws["!data"] || [];
this.style = styles.sheet(index);
this.looks = styles.looks;
this.normal = styles.normal;
this.drawn = styles.art(index);
this.laid = false;
}
Sheet.prototype.cell = function (r, c) {
var row = this.data[r];
return row ? row[c] : undefined;
};
Sheet.prototype.empty = function (r, c) {
var cell = this.cell(r, c);
return !cell || cell.t === "z" || cell.v === undefined || cell.v === null || (cell.v === "" && !cell.f);
};
Sheet.prototype.text = function (cell) {
if (!cell || cell.t === "z") return "";
var text;
if (cell.w !== undefined) {
text = String(cell.w);
} else {
try {
text = String(XLSX.utils.format_cell(cell));
} catch (e) {
text = cell.v === undefined || cell.v === null ? "" : String(cell.v);
}
}
return text.length > CELL_MOST_CHARS ? text.slice(0, CELL_MOST_CHARS) : text;
};
Sheet.prototype.lay = function (room) {
if (this.laid) return;
this.laid = true;
var style = this.style, ws = this.ws;
var ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
var lastRow = ref ? ref.e.r : -1, lastCol = ref ? ref.e.c : -1;
var merges = (ws["!merges"] || []).filter(function (m) {
return m && m.s && m.e && m.e.r >= m.s.r && m.e.c >= m.s.c && (m.e.r > m.s.r || m.e.c > m.s.c);
});
var cellRow = lastRow, cellCol = lastCol;
merges.forEach(function (m) {
if (m.e.r > lastRow) lastRow = Math.min(m.e.r, Math.max(cellRow, m.s.r) + MERGE_REACH);
if (m.e.c > lastCol) lastCol = Math.min(m.e.c, Math.max(cellCol, m.s.c) + MERGE_REACH);
});
this.merges = merges;
var fitted = style.widths ? null : this.fit(lastCol);
this.width = [];
this.cols = [];
var across = 0, c;
for (c = 0; c <= lastCol + VW_SPARE_COLUMNS; c++) {
var info = style.cols[c];
if (info && info.hidden) continue;
var w = fitted && fitted[c] ? fitted[c] : info && info.w > 0 ? info.w : style.width;
if (c > lastCol && across + w > room.width) break;
this.width[c] = w;
this.cols.push(c);
across += w;
}
this.height = [];
this.rows = [];
var down = 0, r;
var spare = Math.min(SPARE_ROWS_MOST, Math.floor(PIECE_CELLS / Math.max(1, this.cols.length)));
for (r = 0; r <= lastRow + spare; r++) {
var row = style.rows[r];
if (row && row.hidden) continue;
var h = row ? row.h : style.height;
if (r > lastRow && down + h > room.height - style.height) break;
this.height[r] = h;
this.rows.push(r);
down += h;
}
this.lastRow = this.rows.length ? this.rows[this.rows.length - 1] : -1;
this.lastCol = this.cols.length ? this.cols[this.cols.length - 1] : -1;
this.after = [];
for (var n = 0; n < this.cols.length; n++) this.after[this.cols[n]] = n + 1 < this.cols.length ? this.cols[n + 1] : -1;
var frozen = style.frozen, self = this;
var frozenRows = this.rows.filter(function (r) { return r < frozen.rows; });
var frozenCols = this.cols.filter(function (c) { return c < frozen.columns; });
var tall = frozenRows.reduce(function (sum, r) { return sum + self.height[r]; }, 0);
var wide = frozenCols.reduce(function (sum, c) { return sum + self.width[c]; }, 0);
if (tall > room.height * FROZEN_MOST) frozenRows = [];
if (wide > room.width * FROZEN_MOST) frozenCols = [];
this.heads = frozenRows;
this.body = this.rows.slice(frozenRows.length);
this.lefts = frozenCols;
this.rights = this.cols.slice(frozenCols.length);
this.showHeads = style.heads;
this.headWidth = style.heads
? Math.max(HEAD_WIDTH_MIN, String(this.lastRow + 1).length * HEAD_DIGIT + 10) : 0;
this.rowMerges = {};
for (var k = 0; k < merges.length; k++) {
var m = merges[k];
var i = firstAtLeast(this.rows, m.s.r), j = firstAtLeast(this.cols, m.s.c);
m.top = this.rows[i] !== undefined && this.rows[i] <= m.e.r ? this.rows[i] : -1;
m.left = this.cols[j] !== undefined && this.cols[j] <= m.e.c ? this.cols[j] : -1;
if (m.top < 0 || m.left < 0) continue;
for (r = m.s.r; r <= Math.min(m.e.r, this.lastRow); r++) (this.rowMerges[r] || (this.rowMerges[r] = [])).push(m);
}
this.pieces = this.cut();
this.fullWidth = this.headWidth + this.cols.reduce(function (sum, c) { return sum + self.width[c]; }, 0);
this.cf = null;
try {
if (typeof vwConditional === "function") this.cf = vwConditional(this);
} catch (e) {
this.cf = null;
}
};
Sheet.prototype.ruled = function (r, c) {
var row = this.cf && this.cf[r];
return row ? row[c] : undefined;
};
Sheet.prototype.fit = function (lastCol) {
var widths = [], font = this.normal.px + "px " + this.normal.stack;
var rows = Math.min(this.data.length, FIT_ROWS, Math.ceil(FIT_CELLS / Math.max(1, lastCol + 1)));
for (var r = 0; r < rows; r++) {
var row = this.data[r];
if (!row) continue;
for (var c = 0; c <= lastCol && c < row.length; c++) {
var text = this.text(row[c]);
if (!text) continue;
var w = Math.ceil(measure(text.replace(/\n.*/g, ""), font)) + 2 * VW_CELL_PAD + 3;
if (!(widths[c] >= w)) widths[c] = w;
}
}
for (var k = 0; k < widths.length; k++) {
if (widths[k]) widths[k] = Math.min(FIT_WIDEST, Math.max(this.style.width, widths[k]));
}
return widths;
};
Sheet.prototype.cut = function () {
var body = this.body, n = body.length;
if (!n) return [];
var step = Math.max(PIECE_ROWS_MIN, Math.min(PIECE_ROWS_MAX, Math.floor(PIECE_CELLS / Math.max(1, this.cols.length))));
var pieces = [];
for (var i = 0; i < n;) {
var end = Math.min(i + step, n) - 1;
for (var grew = true; grew;) {
grew = false;
for (var k = i; k <= end; k++) {
var list = this.rowMerges[body[k]];
if (!list) continue;
for (var q = 0; q < list.length; q++) {
if (list[q].e.r > body[end] && end < n - 1) {
end = Math.min(firstAtLeast(body, list[q].e.r + 1), n) - 1;
grew = true;
}
}
}
}
pieces.push({ from: i, to: end, rows: body.slice(i, end + 1) });
i = end + 1;
}
return pieces;
};
Sheet.prototype.nextCol = function (c) {
if (this.after[c] !== undefined) return this.after[c];
var i = firstAtLeast(this.cols, c + 1);
return i < this.cols.length ? this.cols[i] : -1;
};
Sheet.prototype.nextRow = function (r) {
var i = firstAtLeast(this.rows, r + 1);
return i < this.rows.length ? this.rows[i] : -1;
};
Sheet.prototype.lookAt = function (r, c) {
var look = this.style.at(r, c);
var table = this.style.tables.length ? this.style.tableAt(r, c) : null;
if (table) look = this.looks.under(look, table);
var ruled = this.ruled(r, c);
return ruled ? this.looks.mix(look, ruled) : look;
};
Sheet.prototype.borders = function (r, c) {
if (r < 0 || c < 0) return null;
var look = this.looks.list[this.lookAt(r, c)];
return look ? look.borders : null;
};
Sheet.prototype.filled = function (r, c) {
if (r < 0 || c < 0) return false;
var look = this.looks.list[this.lookAt(r, c)];
return !!(look && look.fill);
};
Sheet.prototype.cellsOf = function (r, cols, rows) {
var out = [], list = this.rowMerges[r];
for (var i = 0; i < cols.length; i++) {
var c = cols[i], merge = null;
if (list) {
for (var q = 0; q < list.length; q++) {
if (c >= list[q].s.c && c <= list[q].e.c) { merge = list[q]; break; }
}
}
if (!merge) {
out.push([c, 1, 1, null]);
continue;
}
var top = rows[firstAtLeast(rows, merge.s.r)];
if (top !== r) continue;
if (i > 0 && cols[i - 1] >= merge.s.c) continue;
var across = 0, down = 0;
for (var j = i; j < cols.length && cols[j] <= merge.e.c; j++) across++;
for (var k = firstAtLeast(rows, r); k < rows.length && rows[k] <= merge.e.r; k++) down++;
out.push([c, across, down, merge]);
}
return out;
};
Sheet.prototype.sectionHtml = function (rows, letters) {
var left = [], right = [], style = this.style;
this.growing = false;
if (letters) {
left.push(this.lettersHtml(this.lefts, true));
right.push(this.lettersHtml(this.rights, false));
}
for (var i = 0; i < rows.length; i++) {
var r = rows[i], h = this.height[r];
var info = style.rows[r];
var open = '<tr data-r="' + r + '"' + (h !== style.height ? ' style="height:' + h + 'px"' : "") + ">";
left.push(open);
right.push(open);
if (this.showHeads) {
var before = this.rows[firstAtLeast(this.rows, r) - 1];
left.push('<th class="vw-rh' + ((before === undefined ? r > 0 : before !== r - 1) ? " vw-gap" : "") +
'" data-n="' + (r + 1) + '"></th>');
}
var self = this;
var below = i + 1 < rows.length ? rows[i + 1] : this.nextRow(r);
var lefts = this.cellsOf(r, this.lefts, rows).map(function (spec) { return self.describe(r, spec, info, below); });
var rights = this.cellsOf(r, this.rights, rows).map(function (spec) { return self.describe(r, spec, info, below); });
var all = lefts.concat(rights);
if (!this.growing) {
for (var g = 0; g < all.length; g++) if (this.grows(all[g])) { this.growing = true; break; }
}
this.spill(all, lefts.length);
for (var j = 0; j < all.length; j++) (j < lefts.length ? left : right).push(this.cellHtml(all[j]));
left.push("</tr>");
right.push("</tr>");
}
this.looks.flush();
return [left.join(""), right.join("")];
};
Sheet.prototype.grows = function (d) {
if (!d.text) return false;
var lookOf = d.lookOf;
if (lookOf.wrap || lookOf.rot) return true;
if (d.cell && d.cell.h && /<span|<b>|<i>|<u>|<s>/.test(d.cell.h)) return true;
return (lookOf.px || this.normal.px) * 1.2 + 1 > d.height + 0.5;
};
Sheet.prototype.describe = function (r, spec, rowInfo, nextBelow) {
var c = spec[0], merge = spec[3];
var looks = this.looks, style = this.style;
var look = this.lookAt(r, c), ruled = this.ruled(r, c);
var lookOf = looks.list[look] || {};
var lastC = c, lastR = r, k;
if (merge) {
lastC = merge.e.c;
lastR = merge.e.r;
}
var holdsText = !merge || (r === merge.top && c === merge.left);
var cell = holdsText ? (merge ? this.cell(merge.s.r, merge.s.c) : this.cell(r, c)) : undefined;
var text = this.text(cell);
var width = this.width[c], height = this.height[r];
if (spec[1] > 1) {
width = 0;
for (k = 0; k < spec[1]; k++) width += this.width[this.cols[firstAtLeast(this.cols, c) + k]];
}
if (spec[2] > 1) {
height = 0;
for (k = 0; k < spec[2]; k++) height += this.height[this.rows[firstAtLeast(this.rows, r) + k]];
}
var own = lookOf.borders, right = this.nextCol(lastC), below = merge ? this.nextRow(lastR) : nextBelow;
var ownRight = merge ? this.borders(r, lastC) : own, ownBottom = merge ? this.borders(lastR, c) : own;
var beyondRight = right >= 0 ? this.borders(r, right) : null;
var beyondBelow = below >= 0 ? this.borders(below, c) : null;
var edge = looks.edge(
vwHeavier(ownRight && ownRight.r, beyondRight && beyondRight.l),
vwHeavier(ownBottom && ownBottom.b, beyondBelow && beyondBelow.t),
c === this.cols[0] && own ? own.l : null,
r === this.rows[0] && own ? own.t : null
);
var type = cell ? cell.t : "z";
var align = lookOf.h || (type === "n" || type === "d" ? "right" : type === "b" || type === "e" ? "center" : "left");
return {
r: r, c: c, across: spec[1], down: spec[2], merge: merge, cell: cell, text: text,
look: look, lookOf: lookOf, edge: edge, type: type, align: align, width: width, height: height,
custom: !!(rowInfo && rowInfo.custom),
noRight: !!lookOf.fill || (right >= 0 && this.filled(r, right)),
noBottom: !!lookOf.fill || (below >= 0 && this.filled(below, c)),
bar: ruled && ruled.bar,
spill: null
};
};
Sheet.prototype.fontOf = function (lookOf) {
return (lookOf.i ? "italic " : "") + (lookOf.b ? "700 " : "") + (lookOf.px || this.normal.px) + "px " +
(lookOf.font || this.normal.stack);
};
Sheet.prototype.spill = function (cells, boundary) {
for (var i = 0; i < cells.length; i++) {
var d = cells[i];
if (!d.text) continue;
var lookOf = d.lookOf, px = lookOf.px || this.normal.px;
if (d.custom && px * 1.2 + 1 > d.height + 0.5) d.clip = true;
if (lookOf.rot) {
if (d.custom) d.clip = true;
continue;
}
if (lookOf.wrap || d.align === "fill" || d.align === "justify") continue;
var room = d.width - 2 * VW_CELL_PAD - (lookOf.indent || 0) * VW_INDENT_PX;
var text = d.text.replace(/\s*\n\s*/g, " ");
if (text.length * px * WIDEST_CHAR <= room) continue;
var font = this.fontOf(lookOf);
var wide = measure(text, font);
var need = wide - room;
if (need <= 0.5) continue;
if (d.merge) {
d.clip = true;
continue;
}
d.over = true;
var number = d.type === "n" || d.type === "d";
var toLeft = d.align === "right" ? need : d.align === "center" || d.align === "centerContinuous" ? need / 2 : 0;
var toRight = d.align === "left" ? need : d.align === "right" ? 0 : need / 2;
var leftmost = i >= boundary ? boundary : 0;
var gotRight = 0, gotLeft = 0, j;
for (j = i + 1; toRight > gotRight && j < cells.length && this.free(cells[j]); j++) gotRight += cells[j].width;
for (j = i - 1; toLeft > gotLeft && j >= leftmost && this.free(cells[j]); j--) gotLeft += cells[j].width;
if (number && (gotLeft < toLeft || gotRight < toRight || need > room * NUMBER_RUN_ON)) {
d.text = this.shorter(d.cell, d.lookOf, room, font) || "#".repeat(Math.max(1, Math.floor(room / measure("#", font))));
d.cut = true;
continue;
}
var still = toRight, across = d.width;
for (j = i + 1; still > 0 && j < cells.length && this.free(cells[j]); j++) {
cells[j - 1].noRight = true;
if (j === boundary) {
var start = d.align === "left" ? VW_CELL_PAD + (d.lookOf.indent || 0) * VW_INDENT_PX : (d.width - wide) / 2;
cells[j].carry = { html: this.contentHtml(d, false), before: across - start, after: Math.min(still, this.freeAfter(cells, j)) };
}
across += cells[j].width;
still -= cells[j].width;
}
still = toLeft;
for (j = i - 1; still > 0 && j >= leftmost && this.free(cells[j]); j--) {
cells[j].noRight = true;
still -= cells[j].width;
}
gotRight = Math.min(toRight, gotRight);
gotLeft = Math.min(toLeft, gotLeft);
if (d.align === "left" && !gotRight) {
d.clip = true;
continue;
}
if (d.align === "center" || d.align === "centerContinuous") {
d.spill = { left: gotLeft, right: gotRight, centre: need / 2 };
} else {
d.spill = { left: gotLeft, right: gotRight };
}
}
};
Sheet.prototype.freeAfter = function (cells, j) {
var room = 0;
for (var k = j; k < cells.length && this.free(cells[k]); k++) room += cells[k].width;
return room;
};
Sheet.prototype.shorter = function (cell, lookOf, room, font) {
if (!cell || cell.t !== "n" || typeof cell.v !== "number" || lookOf.nf) return null;
for (var places = 10; places >= 1; places--) {
var text = generalNumber(cell.v, places);
if (measure(text, font) <= room + 0.5) return text;
}
for (places = 6; places >= 1; places--) {
text = generalNumber(cell.v, places, true);
if (measure(text, font) <= room + 0.5) return text;
}
return null;
};
Sheet.prototype.free = function (d) {
return !d.merge && !d.text && this.empty(d.r, d.c);
};
Sheet.prototype.cellHtml = function (d) {
var looks = this.looks, lookOf = d.lookOf;
var classes = looks.classes[d.look] || "";
if (!lookOf.h && d.align !== "left") classes += d.align === "right" ? " vw-n" : " vw-m";
if (d.edge) classes += " " + d.edge;
if (d.noRight) classes += " vw-nr";
if (d.noBottom) classes += " vw-nb";
if (d.cell && d.cell.c && d.cell.c.length) classes += " vw-cm";
var colour = d.cell && d.cell.t === "n" ? formatColour(lookOf.nf, d.cell.v) : null;
if (colour) classes += " " + looks.inkClass(colour);
if (d.bar) classes += " " + looks.barClass(d.bar.colour);
var wrap = !!lookOf.wrap;
var content = this.contentHtml(d, wrap);
if (d.clip) classes += " vw-cut";
if (d.carry) {
classes += " vw-sx";
content = '<div class="vw-sp" style="width:' + (d.carry.before + d.carry.after) + "px;margin-left:" +
-d.carry.before + 'px;justify-content:flex-start">' + d.carry.html + "</div>";
} else if (d.spill || (d.over && !d.cut && d.align !== "left")) {
classes += " vw-sx";
content = this.spillHtml(d, content);
} else if (lookOf.rot) {
content = '<div class="' + (lookOf.rot === 90 ? "vw-up" : lookOf.rot === -90 ? "vw-down" : lookOf.rot === 255 ? "vw-stack" : "vw-turn") + '"' +
(lookOf.rot !== 90 && lookOf.rot !== -90 && lookOf.rot !== 255 ? ' style="transform:rotate(' + (-lookOf.rot) + 'deg)"' : "") + ">" + content + "</div>";
} else if (wrap && d.custom) {
content = '<div class="vw-clip" style="max-height:' + Math.max(1, d.height - 1) + 'px">' + content + "</div>";
} else if (wrap && d.text.length > 200) {
content = '<div class="vw-clip" style="max-height:' + ROW_MOST_PX + 'px">' + content + "</div>";
}
if (d.clip && d.custom && !(wrap && !lookOf.rot && !d.carry && !d.spill)) {
content = '<div class="vw-cap" style="max-height:' + Math.max(1, d.height - 1) + 'px">' + content + "</div>";
}
var attrs = classes ? ' class="' + classes.replace(/^ /, "") + '"' : "";
if (d.bar) attrs += ' style="--vw-bar:' + d.bar.width + '%"';
if (d.across > 1) attrs += ' colspan="' + d.across + '"';
if (d.down > 1) attrs += ' rowspan="' + d.down + '"';
return "<td" + attrs + ">" + content + "</td>";
};
Sheet.prototype.contentHtml = function (d, wrap) {
var cell = d.cell;
if (!cell || !d.text) return "";
var rich = !d.cut && cell.h && cell.h.length <= CELL_MOST_CHARS * 2 && /<span|<b>|<i>|<u>|<s>/.test(cell.h);
var html = rich ? String(cell.h) : escapeHtml(d.text);
html = wrap ? html.replace(/\n/g, "<br>") : html.replace(/<br\s*\/?>/gi, " ").replace(/\s*\n\s*/g, " ");
var target = cell.l && cell.l.Target;
if (target && String(target).charAt(0) !== "#") html = '<a href="' + escapeHtml(target) + '">' + html + "</a>";
return html;
};
Sheet.prototype.spillHtml = function (d, content) {
var s = d.spill || { left: 0, right: 0 };
var pad = VW_CELL_PAD + (d.lookOf.indent || 0) * VW_INDENT_PX;
var style = "width:" + Math.max(0, d.width - 1 + s.left + s.right) + "px";
if (s.left) style += ";margin-left:" + -s.left + "px";
var justify = d.align === "right" ? "flex-end" : d.align === "left" ? "flex-start" : "center";
style += ";justify-content:" + justify + (justify === "center" ? ";padding:0 " + pad + "px"
: ";padding-" + (d.align === "right" ? "right" : "left") + ":" + pad + "px");
if (s.centre !== undefined && s.left !== s.right) {
var reach = s.centre;
var inner = "width:" + (d.width - 1 + 2 * reach) + "px;margin-left:" + (s.left - reach) + "px";
return '<div class="vw-sp" style="' + style + ';justify-content:flex-start;padding:0">' +
'<div class="vw-sp" style="' + inner + ';justify-content:center">' + content + "</div></div>";
}
return '<div class="vw-sp" style="' + style + '">' + content + "</div>";
};
Sheet.prototype.colgroup = function (cols, left) {
var html = "<colgroup>", total = 0;
if (left && this.showHeads) {
html += '<col style="width:' + this.headWidth + 'px">';
total += this.headWidth;
}
for (var i = 0; i < cols.length; i++) {
html += '<col style="width:' + this.width[cols[i]] + 'px">';
total += this.width[cols[i]];
}
return { html: html + "</colgroup>", width: total };
};
Sheet.prototype.lettersHtml = function (cols, left) {
var html = '<tr class="vw-letters">';
if (left && this.showHeads) html += '<th class="vw-corner"></th>';
for (var i = 0; i < cols.length; i++) {
var c = cols[i], before = i > 0 ? cols[i - 1] : left ? -1 : this.lefts.length ? this.lefts[this.lefts.length - 1] : -1;
html += '<th class="vw-ch' + (c !== before + 1 ? " vw-gap" : "") + '" data-n="' + columnName(c) + '"></th>';
}
return html + "</tr>";
};
Sheet.prototype.table = function (cols, left, rowsHtml) {
if (!cols.length && !(left && this.showHeads)) return null;
var group = this.colgroup(cols, left);
var t = document.createElement("table");
t.className = "vw-t" + (left ? " vw-tl" + (this.lefts.length ? " vw-freeze" : "") : " vw-tr");
t.style.width = group.width + "px";
t.innerHTML = group.html + rowsHtml;
vwDisarmLinks(t);
return t;
};
Sheet.prototype.blockOf = function (rows, letters, className) {
var html = this.sectionHtml(rows, letters);
var block = document.createElement("div");
block.className = className;
var left = this.table(this.lefts, true, html[0]);
var right = this.table(this.rights, false, html[1]);
if (left) block.appendChild(left);
if (right) block.appendChild(right);
block.vwLeft = left;
block.vwRight = right;
block.vwGrows = this.growing;
return block;
};
Sheet.prototype.headBlock = function () {
if (this.head !== undefined) return this.head;
if (!this.heads.length && !this.showHeads) return (this.head = null);
return (this.head = this.blockOf(this.heads, this.showHeads, "vw-head" + (this.heads.length ? " vw-freeze" : "")));
};
Sheet.prototype.block = function (k) {
var piece = this.pieces[k];
if (piece.block) return piece.block;
var block = this.blockOf(piece.rows, false, "vw-p");
block.vwPiece = k;
block.style.containIntrinsicSize = this.fullWidth + "px " + this.piecePx(piece) + "px";
piece.block = block;
return block;
};
Sheet.prototype.piecePx = function (piece) {
var sum = 0;
for (var i = 0; i < piece.rows.length; i++) sum += this.height[piece.rows[i]];
return sum;
};
Sheet.prototype.xOf = function (c) {
if (!this.colLefts) {
this.colLefts = [0];
for (var i = 0; i < this.cols.length; i++) this.colLefts.push(this.colLefts[i] + this.width[this.cols[i]]);
}
var k = firstAtLeast(this.cols, c);
var past = c > this.lastCol ? (c - this.lastCol - 1) * this.style.width : 0;
return this.headWidth + this.colLefts[k] + past;
};
Sheet.prototype.yOf = function (r) {
if (!this.rowTops) {
this.rowTops = [0];
for (var i = 0; i < this.rows.length; i++) this.rowTops.push(this.rowTops[i] + this.height[this.rows[i]]);
}
var k = firstAtLeast(this.rows, r);
var past = r > this.lastRow ? (r - this.lastRow - 1) * this.style.height : 0;
return (this.showHeads ? HEAD_HEIGHT : 0) + this.rowTops[k] + past;
};
Sheet.prototype.artBlock = function () {
if (this.art !== undefined) return this.art;
if (!this.drawn.length) return (this.art = null);
var layer = document.createElement("div");
layer.className = "vw-art";
var self = this;
this.drawn.forEach(function (item) {
var left, top, width, height;
if (item.at) {
left = self.headWidth + item.at.x;
top = (self.showHeads ? HEAD_HEIGHT : 0) + item.at.y;
} else {
left = self.xOf(item.from.c) + item.from.x;
top = self.yOf(item.from.r) + item.from.y;
}
if (item.to) {
width = self.xOf(item.to.c) + item.to.x - left;
height = self.yOf(item.to.r) + item.to.y - top;
} else {
width = item.size.w;
height = item.size.h;
}
if (!(width >= 2 && height >= 2)) return;
var el;
if (item.kind === "picture") {
el = document.createElement("img");
el.src = URL.createObjectURL(new Blob([item.bytes], { type: item.type }));
el.alt = item.title || "";
} else if (item.kind === "text") {
el = document.createElement("div");
el.className = "vw-art-text";
el.textContent = item.title;
} else {
el = document.createElement("div");
el.className = "vw-art-missing";
var name = document.createElement("b");
name.textContent = item.kind === "chart" ? (item.title || "Chart") : "Picture";
var why = document.createElement("span");
why.textContent = item.kind === "chart" ? "A chart Gander can't draw yet" : "A picture in a format Gander can't show";
el.appendChild(name);
el.appendChild(why);
}
el.style.insetInlineStart = left + "px";
el.style.top = top + "px";
el.style.width = width + "px";
el.style.height = height + "px";
layer.appendChild(el);
});
return (this.art = layer.childNodes.length ? layer : null);
};
Sheet.prototype.columnAt = function (r, cols, rows, index) {
var cells = this.cellsOf(r, cols, rows);
return cells[index] ? cells[index][0] : -1;
};
Sheet.prototype.mergeAt = function (r, c) {
var list = this.rowMerges[r];
if (!list) return null;
for (var q = 0; q < list.length; q++) if (c >= list[q].s.c && c <= list[q].e.c) return list[q];
return null;
};
VwLooks.prototype.under = function (base, table) {
var key = base + "|" + table.key;
this.unders = this.unders || {};
if (this.unders[key] !== undefined) return this.unders[key];
var own = this.list[base] || {}, look = {};
for (var field in own) if (own.hasOwnProperty(field)) look[field] = own[field];
["fill", "ink"].forEach(function (field) { if (!own[field] && table[field]) look[field] = table[field]; });
["b", "i"].forEach(function (field) { if (!own[field] && table[field]) look[field] = true; });
var mine = own.borders || {}, theirs = table.borders;
look.borders = { l: mine.l || theirs.l, r: mine.r || theirs.r, t: mine.t || theirs.t, b: mine.b || theirs.b };
return (this.unders[key] = this.add(look));
};
VwLooks.prototype.mix = function (base, ruled) {
var key = base + "|" + [ruled.fill, ruled.ink, ruled.b, ruled.i, ruled.u, ruled.s].join(",");
this.mixes = this.mixes || {};
if (this.mixes[key] !== undefined) return this.mixes[key];
var look = {}, own = this.list[base] || {};
for (var field in own) if (own.hasOwnProperty(field)) look[field] = own[field];
["fill", "ink", "b", "i", "u", "s"].forEach(function (field) {
if (ruled[field] !== undefined && ruled[field] !== null) look[field] = ruled[field];
});
return (this.mixes[key] = this.add(look));
};
VwLooks.prototype.barClass = function (hex) {
this.bars = this.bars || {};
if (!this.bars[hex]) {
var name = this.bars[hex] = "vw-b" + hex;
var rule = function (from) {
return "background-image: linear-gradient(90deg, #" + from + ", #" + vwBlend(from, "FFFFFF", 0.8) + "); " +
"background-size: var(--vw-bar) calc(100% - 4px); background-repeat: no-repeat; background-position: 1px center";
};
var night = vwSheetNight(hex);
this.rules.push("#grid td." + name + " { " + rule(hex) + " }\n@media (prefers-color-scheme: dark) { #grid td." +
name + " { background-image: linear-gradient(90deg, #" + night + ", #" + vwBlend(night, VW_SHEET_NIGHT_GROUND, 0.8) + ") } }");
}
return this.bars[hex];
};
VwLooks.prototype.inkClass = function (hex) {
this.inks = this.inks || {};
if (!this.inks[hex]) {
var name = this.inks[hex] = "vw-k" + hex;
this.rules.push("#grid td." + name + "." + name + " { color: #" + hex + " }\n" +
"@media (prefers-color-scheme: dark) { #grid td." + name + "." + name + " { color: #" + vwSheetNight(hex) + " } }");
}
return this.inks[hex];
};
vwFetchDoc("buffer")
.then(function (buf) {
var wb = readWorkbook(new Uint8Array(buf));
if (!wb.SheetNames.length) throw new Error("The workbook has no sheets");
var root = document.documentElement;
var tabs = document.getElementById("tabs");
var sheetDiv = document.getElementById("sheet");
var grid = document.getElementById("grid");
var bar = document.getElementById("cellbar");
var styles = vwWorkbookStyles(wb);
var probe = document.createElement("div");
probe.className = "vw-probe";
grid.appendChild(probe);
var sheets = wb.SheetNames.map(function (sn, i) { return new Sheet(wb, i, styles); });
var csv = !wb.Workbook || vwExt === "csv";
var hiddenSheets = (wb.Workbook && wb.Workbook.Sheets) || [];
var shown = sheets.filter(function (s, i) { return !(hiddenSheets[i] && hiddenSheets[i].Hidden); });
if (!shown.length) shown = sheets;
var opening = shown[0];
if (styles.active !== null && sheets[styles.active] && shown.indexOf(sheets[styles.active]) >= 0) {
opening = sheets[styles.active];
}
grid.style.fontFamily = styles.normal.stack;
grid.style.fontSize = styles.normal.px + "px";
if (styles.normal.ink && styles.normal.ink !== "000000") {
styles.looks.rules.push(".vw-t td { color: #" + styles.normal.ink + " }\n" +
"@media (prefers-color-scheme: dark) { .vw-t td { color: #" + vwSheetNight(styles.normal.ink) + " } }");
styles.looks.flush();
}
var phone = Math.min(2, Math.max(0.85, (Number(vwParams.get("type")) || 100) / 100));
root.style.setProperty("--vw-type", phone);
var zoom = phone;
var current = null;
var selected = null;
function setZoom(z) {
zoom = Math.min(ZOOM_MOST, Math.max(ZOOM_LEAST, z));
grid.style.zoom = zoom;
root.style.setProperty("--vw-z", zoom);
held();
}
function bottomRoom() {
var under = tabs.hidden ? 0 : tabs.getBoundingClientRect().height;
bar.style.bottom = under + "px";
var room = under + (bar.hidden ? 0 : bar.getBoundingClientRect().height);
document.body.style.paddingBottom = room + "px";
root.style.scrollPaddingBottom = room + "px";
return room;
}
function held() {
if (!current) return;
var top = vwTopPx || 0, left = 0;
if (current.head) top += seen(current.head).height;
var piece = current.pieces.length && current.pieces[0].block;
if (piece && piece.vwLeft) left = seen(piece.vwLeft).width;
root.style.scrollPaddingTop = top + "px";
root.style.scrollPaddingInlineStart = left + "px";
bottomRoom();
}
function seen(el) {
var unit = probe.getBoundingClientRect().height / 100 || 1;
var box = el.getBoundingClientRect();
return { width: box.width / unit * zoom, height: box.height / unit * zoom };
}
function room() {
var top = vwTopPx || 0;
return {
width: Math.max(1, innerWidth / phone),
height: Math.max(1, (innerHeight - top - bottomRoom()) / phone - (HEAD_HEIGHT + 2))
};
}
function level(block) {
var left = block.vwLeft, right = block.vwRight;
if (!left || !right || !block.parentNode) return;
var unit = probe.getBoundingClientRect().height / 100;
if (!(unit > 0)) return;
var lr = left.rows, rr = right.rows, n = Math.min(lr.length, rr.length);
var heights = [];
for (var i = 0; i < n; i++) {
var a = lr[i].getBoundingClientRect().height, b = rr[i].getBoundingClientRect().height;
heights.push(Math.abs(a - b) > 0.5 ? Math.max(a, b) / unit : 0);
}
for (var j = 0; j < n; j++) {
if (!heights[j]) continue;
lr[j].style.height = rr[j].style.height = heights[j] + "px";
}
if (block.vwPiece !== undefined) {
block.vwPx = block.getBoundingClientRect().height / unit;
block.style.containIntrinsicSize = current.fullWidth + "px " + block.vwPx + "px";
}
}
var uneven = [], evening = false;
var levelled = window.ResizeObserver ? new ResizeObserver(function (entries) {
for (var i = 0; i < entries.length; i++) {
var block = entries[i].target.parentNode;
if (block && uneven.indexOf(block) < 0) uneven.push(block);
}
if (evening) return;
evening = true;
requestAnimationFrame(function () {
evening = false;
var blocks = uneven;
uneven = [];
for (var k = 0; k < blocks.length; k++) level(blocks[k]);
});
}) : null;
function watchLevel(block) {
if (!block.vwGrows) return;
level(block);
if (levelled && block.vwRight && block.vwLeft) levelled.observe(block.vwRight);
}
function place(k) {
var sheet = current;
var piece = sheet.pieces[k];
var block = sheet.block(k);
if (block.parentNode === grid) return block;
if (piece.stand && piece.stand.parentNode === grid) {
if (watcher) watcher.unobserve(piece.stand);
grid.replaceChild(block, piece.stand);
watchLevel(block);
if (selected && selected.sheet === sheet) mark(true);
}
return block;
}
var fillAll = !(window.CSS && CSS.highlights);
var shows = 0;
function fill(sheet, run) {
var pieces = sheet.pieces;
var k = 1;
(function next() {
if (run !== shows) return;
while (k < pieces.length && pieces[k].block && pieces[k].block.parentNode === grid) k++;
if (k >= pieces.length) return;
place(k++);
setTimeout(next, 0);
})();
}
var watcher = window.IntersectionObserver
? new IntersectionObserver(function (entries) {
for (var i = 0; i < entries.length; i++) {
if (entries[i].isIntersecting) place(entries[i].target.vwPiece);
}
}, { rootMargin: "100% 0px" })
: null;
function show(sheet) {
if (current === sheet) return;
clearSelection();
current = sheet;
shows++;
sheet.lay(room());
if (watcher) watcher.disconnect();
if (levelled) levelled.disconnect();
while (grid.lastChild && grid.lastChild !== probe) grid.removeChild(grid.lastChild);
grid.className = sheet.style.grid ? "" : "vw-nogrid";
grid.style.setProperty("--vw-rh", sheet.style.height + "px");
root.dir = sheet.style.rtl ? "rtl" : "";
var head = sheet.headBlock();
if (head) {
grid.appendChild(head);
watchLevel(head);
}
sheet.pieces.forEach(function (piece, k) {
if (k === 0) {
grid.appendChild(sheet.block(0));
watchLevel(piece.block);
return;
}
var stand = document.createElement("div");
stand.className = "vw-later";
stand.style.height = (piece.block && piece.block.vwPx || sheet.piecePx(piece)) + "px";
stand.style.width = sheet.fullWidth + "px";
stand.vwPiece = k;
piece.stand = stand;
grid.appendChild(stand);
if (watcher) watcher.observe(stand);
else place(k);
});
var art = sheet.artBlock();
if (art) grid.appendChild(art);
if (fillAll && sheet.pieces.length > 1) fill(sheet, shows);
var buttons = tabs.querySelectorAll("button");
for (var i = 0; i < buttons.length; i++) {
var on = buttons[i].vwSheet === sheet;
buttons[i].classList.toggle("active", on);
buttons[i].setAttribute("aria-selected", on ? "true" : "false");
if (on && buttons[i].scrollIntoView) buttons[i].scrollIntoView({ block: "nearest", inline: "nearest" });
}
window.scrollTo(0, 0);
held();
}
shown.forEach(function (sheet) {
var b = document.createElement("button");
b.textContent = sheet.name;
b.setAttribute("role", "tab");
b.vwSheet = sheet;
if (sheet.style.tab) {
b.style.setProperty("--vw-tab", "#" + sheet.style.tab);
b.classList.add("vw-coloured");
}
b.onclick = function () { show(sheet); };
tabs.appendChild(b);
});
tabs.hidden = csv && shown.length < 2;
setZoom(zoom);
show(opening);
function cellOf(target) {
var td = target && target.closest ? target.closest("td") : null;
if (!td || !grid.contains(td)) return null;
var tr = td.parentNode, table = tr.parentNode.closest ? tr.parentNode.closest("table") : null;
var block = table && table.parentNode;
if (!block || !current) return null;
var r = +tr.getAttribute("data-r");
var left = table.classList.contains("vw-tl");
var rows = block.vwPiece !== undefined ? current.pieces[block.vwPiece].rows : current.heads;
var index = td.cellIndex - (left && current.showHeads ? 1 : 0);
var c = current.columnAt(r, left ? current.lefts : current.rights, rows, index);
if (c < 0) return null;
var merge = current.mergeAt(r, c);
return merge ? { r: merge.top, c: merge.left, merge: merge } : { r: r, c: c, merge: null };
}
window.vwCellOf = function (td) {
var at = cellOf(td);
return at ? columnName(at.c) + (at.r + 1) : null;
};
function blockOf(r) {
if (current.head && current.heads.indexOf(r) >= 0) return [current.head, current.heads];
var i = firstAtLeast(current.body, r);
if (current.body[i] !== r) return null;
for (var k = 0; k < current.pieces.length; k++) {
var p = current.pieces[k];
if (i >= p.from && i <= p.to) return p.block && p.block.parentNode === grid ? [p.block, p.rows] : null;
}
return null;
}
function tdOf(r, c) {
var found = blockOf(r);
if (!found) return null;
var left = current.lefts.indexOf(c) >= 0;
var table = left ? found[0].vwLeft : found[0].vwRight;
var tr = table && table.querySelector('tr[data-r="' + r + '"]');
if (!tr) return null;
var cells = current.cellsOf(r, left ? current.lefts : current.rights, found[1]);
for (var k = 0; k < cells.length; k++) {
if (cells[k][0] === c) return tr.cells[k + (left && current.showHeads ? 1 : 0)] || null;
}
return null;
}
window.vwCellAt = function (address) {
var a = XLSX.utils.decode_cell(address);
return tdOf(a.r, a.c);
};
var marked = [];
function mark(on) {
for (var i = 0; i < marked.length; i++) marked[i].classList.remove("vw-sel", "vw-lit");
marked = [];
if (!on || !selected) return;
var td = tdOf(selected.r, selected.c);
if (td) marked.push(td);
var lastC = selected.merge ? selected.merge.e.c : selected.c;
var lastR = selected.merge ? selected.merge.e.r : selected.r;
if (current.head) {
var letters = current.head.querySelectorAll(".vw-ch");
for (var k = 0; k < letters.length; k++) {
var c = XLSX.utils.decode_col(letters[k].getAttribute("data-n"));
if (c >= selected.c && c <= lastC) marked.push(letters[k]);
}
}
for (var r = selected.r; r <= lastR && r <= current.lastRow; r++) {
var th = rowHeadOf(r);
if (th) marked.push(th);
}
for (var j = 0; j < marked.length; j++) marked[j].classList.add(j === 0 && td ? "vw-sel" : "vw-lit");
}
function rowHeadOf(r) {
var found = blockOf(r);
var table = found && found[0].vwLeft;
var tr = table && table.querySelector('tr[data-r="' + r + '"]');
return tr && tr.cells[0] && tr.cells[0].classList.contains("vw-rh") ? tr.cells[0] : null;
}
function select(at) {
if (selected) mark(false);
selected = { sheet: current, r: at.r, c: at.c, merge: at.merge };
mark(true);
fillBar();
vwFind.post("cover 1");
}
function clearSelection() {
if (!selected) return;
mark(false);
selected = null;
bar.hidden = true;
bottomRoom();
vwFind.post("cover 0");
}
window.vwPageCommand = function (msg) {
if (msg === "x") clearSelection();
};
var addressEl = bar.querySelector(".vw-cb-address");
var valueEl = bar.querySelector(".vw-cb-value");
var moreEl = bar.querySelector(".vw-cb-more");
function line(cls, label, text) {
var div = document.createElement("div");
div.className = cls;
if (label) {
var b = document.createElement("span");
b.className = "vw-cb-label";
b.textContent = label;
div.appendChild(b);
}
div.appendChild(document.createTextNode(text));
return div;
}
function home(at) {
return at.merge ? { r: at.merge.s.r, c: at.merge.s.c } : at;
}
function fillBar() {
var sheet = current, at = selected, first = home(at);
var cell = sheet.cell(first.r, first.c);
var address = columnName(first.c) + (first.r + 1);
if (at.merge) address += ":" + columnName(at.merge.e.c) + (at.merge.e.r + 1);
addressEl.textContent = address;
var text = sheet.text(cell);
valueEl.textContent = text;
valueEl.classList.toggle("vw-cb-none", !text);
if (!text) valueEl.textContent = "Empty";
moreEl.textContent = "";
if (cell && cell.f) moreEl.appendChild(line("vw-cb-formula", "", "=" + cell.f));
else if (cell && (cell.t === "n" || cell.t === "d") && cell.v !== undefined) {
var raw = cell.t === "d" && cell.v instanceof Date ? dateValue(cell.v) : String(cell.v);
if (raw !== text) moreEl.appendChild(line("vw-cb-raw", "", raw));
}
if (cell && cell.l && cell.l.Target) moreEl.appendChild(line("vw-cb-link", "Link ", String(cell.l.Target)));
if (cell && cell.c) {
cell.c.forEach(function (note) {
var who = note.a && note.a !== "sheetjsghost" ? note.a + ": " : "";
moreEl.appendChild(line("vw-cb-note", note.T ? "Comment " : "Note ", who + (note.t || "")));
});
}
if (cell && (cell.t === "n" || (!isNaN(Number(cell.v)) && cell.v !== "" && cell.v !== null))) {
var cIdx = first.c;
var sum = 0, count = 0, min = Infinity, max = -Infinity;
var allRows = sheet.rows || [];
for (var ri = 0; ri < allRows.length; ri++) {
var rVal = allRows[ri];
var cItem = sheet.cell(rVal, cIdx);
if (cItem && cItem.v !== undefined && cItem.v !== "" && cItem.v !== null && !isNaN(Number(cItem.v))) {
var num = Number(cItem.v);
sum += num;
count++;
if (num < min) min = num;
if (num > max) max = num;
}
}
if (count > 1) {
function fmtStat(n) {
if (!isFinite(n)) return "0";
return Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : (Math.round(n * 100) / 100);
}
var avg = sum / count;
var statsDiv = document.createElement("div");
statsDiv.className = "vw-cb-stats";
statsDiv.innerHTML = "<span class='vw-stat-item'><b>Col " + columnName(cIdx) + " Stats:</b></span>" +
"<span class='vw-stat-item'><b>SUM:</b> " + fmtStat(sum) + "</span>" +
"<span class='vw-stat-item'><b>AVG:</b> " + fmtStat(avg) + "</span>" +
"<span class='vw-stat-item'><b>COUNT:</b> " + count + "</span>" +
"<span class='vw-stat-item'><b>MIN:</b> " + fmtStat(min) + "</span>" +
"<span class='vw-stat-item'><b>MAX:</b> " + fmtStat(max) + "</span>";
moreEl.appendChild(statsDiv);
}
}
bar.hidden = false;
bottomRoom();
}
function showColumnStats(colIdx, colName) {
var sheet = current;
var sum = 0, count = 0, numCount = 0, min = Infinity, max = -Infinity;
var allRows = sheet.rows || [];
for (var ri = 0; ri < allRows.length; ri++) {
var rVal = allRows[ri];
var cItem = sheet.cell(rVal, colIdx);
if (cItem && cItem.v !== undefined && cItem.v !== "" && cItem.v !== null) {
count++;
if (!isNaN(Number(cItem.v))) {
var num = Number(cItem.v);
sum += num;
numCount++;
if (num < min) min = num;
if (num > max) max = num;
}
}
}
addressEl.textContent = "Col " + colName;
valueEl.classList.remove("vw-cb-none");
valueEl.textContent = count + " populated cells (" + numCount + " numeric)";
moreEl.textContent = "";
if (numCount > 0) {
function fmtStat2(n) {
if (!isFinite(n)) return "0";
return Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : (Math.round(n * 100) / 100);
}
var avg = sum / numCount;
var statsDiv = document.createElement("div");
statsDiv.className = "vw-cb-stats";
statsDiv.innerHTML = "<span class='vw-stat-item'><b>Column " + colName + " Quick Stats:</b></span>" +
"<span class='vw-stat-item'><b>SUM:</b> " + fmtStat2(sum) + "</span>" +
"<span class='vw-stat-item'><b>AVG:</b> " + fmtStat2(avg) + "</span>" +
"<span class='vw-stat-item'><b>COUNT:</b> " + numCount + "</span>" +
"<span class='vw-stat-item'><b>MIN:</b> " + fmtStat2(min) + "</span>" +
"<span class='vw-stat-item'><b>MAX:</b> " + fmtStat2(max) + "</span>";
moreEl.appendChild(statsDiv);
}
bar.hidden = false;
bottomRoom();
}
bar.querySelector(".vw-cb-close").onclick = clearSelection;
bar.querySelector(".vw-cb-copy").onclick = function () {
if (!selected) return;
var text = current.text(current.cell(home(selected).r, home(selected).c));
var area = document.createElement("textarea");
area.value = text;
area.setAttribute("readonly", "");
area.className = "vw-copy";
document.body.appendChild(area);
area.select();
var ok = false;
try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
document.body.removeChild(area);
if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
var button = this;
button.classList.add("vw-done");
setTimeout(function () { button.classList.remove("vw-done"); }, 1200);
};
grid.addEventListener("click", function (e) {
var link = e.target.closest && e.target.closest("a");
if (link) e.preventDefault();
if (Date.now() - zoomedAt < DOUBLE_TAP_GAP_MS) return;
var thCol = e.target.closest && e.target.closest("th.vw-ch");
if (thCol && current) {
var colName = thCol.getAttribute("data-n");
if (colName) {
var colIdx = XLSX.utils.decode_col(colName);
showColumnStats(colIdx, colName);
return;
}
}
var at = cellOf(e.target);
if (!at) return;
if (selected && selected.r === at.r && selected.c === at.c) return;
select(at);
});
document.addEventListener("keydown", function (e) {
if (!selected || e.altKey || e.ctrlKey || e.metaKey) return;
if (e.key === "Escape") { clearSelection(); return; }
var step = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
if (!step) return;
if (current.style.rtl) step[1] = -step[1];
var r = selected.r, c = selected.c;
if (step[0]) {
var ri = firstAtLeast(current.rows, (step[0] > 0 && selected.merge ? selected.merge.e.r : r)) + step[0];
if (ri < 0 || ri >= current.rows.length) return;
r = current.rows[ri];
} else {
var ci = firstAtLeast(current.cols, (step[1] > 0 && selected.merge ? selected.merge.e.c : c)) + step[1];
if (ci < 0 || ci >= current.cols.length) return;
c = current.cols[ci];
}
e.preventDefault();
var merge = current.mergeAt(r, c);
var at = merge ? { r: merge.top, c: merge.left, merge: merge } : { r: r, c: c, merge: null };
var body = current.body, i = firstAtLeast(body, at.r);
for (var k = 0; k < current.pieces.length; k++) {
if (i >= current.pieces[k].from && i <= current.pieces[k].to) place(k);
}
select(at);
var td = tdOf(at.r, at.c);
if (td) td.scrollIntoView({ block: "nearest", inline: "nearest" });
});
function under(x, y) {
var box = sheetDiv.getBoundingClientRect(), left = gridLeft(box);
return { x: (x - left) / zoom, y: (y - box.top) / zoom, box: box };
}
function gridLeft(box) {
return box.left + (current && current.style.rtl ? Math.max(0, box.width - current.fullWidth * zoom) : 0);
}
function settle(z, at, x, y) {
sheetDiv.style.transform = "";
sheetDiv.style.transformOrigin = "";
sheetDiv.classList.remove("vw-moving");
setZoom(z);
var box = sheetDiv.getBoundingClientRect();
window.scrollBy(gridLeft(box) + at.x * zoom - x, box.top + at.y * zoom - y);
}
var gesture = null;
function distance(a, b) {
return Math.sqrt((a.clientX - b.clientX) * (a.clientX - b.clientX) + (a.clientY - b.clientY) * (a.clientY - b.clientY));
}
function startPinch(e) {
finishAnimation();
var a = e.touches[0], b = e.touches[1];
var x = (a.clientX + b.clientX) / 2, y = (a.clientY + b.clientY) / 2;
var at = under(x, y);
gesture = {
apart: Math.max(1, distance(a, b)), from: zoom, to: zoom, at: at, x0: x, y0: y, x: x, y: y,
sx: window.scrollX, sy: window.scrollY
};
sheetDiv.style.transformOrigin = (x - at.box.left) + "px " + (y - at.box.top) + "px";
sheetDiv.classList.add("vw-moving");
}
function movePinch(e) {
var a = e.touches[0], b = e.touches[1], g = gesture;
g.x = (a.clientX + b.clientX) / 2;
g.y = (a.clientY + b.clientY) / 2;
g.to = Math.min(ZOOM_MOST, Math.max(ZOOM_LEAST, g.from * distance(a, b) / g.apart));
var tx = g.x - g.x0 + window.scrollX - g.sx, ty = g.y - g.y0 + window.scrollY - g.sy;
sheetDiv.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + g.to / g.from + ")";
}
function endPinch() {
var g = gesture;
gesture = null;
settle(g.to, g.at, g.x, g.y);
}
var tap = null, lastTap = null, zoomedAt = 0;
function putBack(was) {
if (!was || was.sheet !== current) clearSelection();
else if (!selected || selected.r !== was.r || selected.c !== was.c) select(was);
}
document.addEventListener("touchstart", function (e) {
if (e.touches.length === 2) {
tap = lastTap = null;
startPinch(e);
} else if (e.touches.length === 1 && !gesture && sheetDiv.contains(e.target)) {
finishAnimation();
tap = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
} else {
tap = lastTap = null;
}
}, { passive: true });
document.addEventListener("touchmove", function (e) {
if (gesture && e.touches.length === 2) movePinch(e);
else if (tap && e.touches.length === 1 &&
Math.abs(e.touches[0].clientX - tap.x) + Math.abs(e.touches[0].clientY - tap.y) > TAP_SLOP) tap = null;
}, { passive: true });
function touchEnded(e) {
if (gesture && e.touches.length < 2) {
endPinch();
return;
}
if (!tap || e.touches.length) return;
var now = Date.now();
if (now - tap.t > DOUBLE_TAP_GAP_MS) { tap = null; return; }
if (lastTap && now - lastTap.t < DOUBLE_TAP_GAP_MS &&
Math.abs(tap.x - lastTap.x) + Math.abs(tap.y - lastTap.y) < DOUBLE_TAP_SLOP) {
putBack(lastTap.was);
lastTap = null;
zoomedAt = now;
doubleTap(tap.x, tap.y);
} else {
lastTap = { x: tap.x, y: tap.y, t: now, was: selected };
}
tap = null;
}
document.addEventListener("touchend", touchEnded, { passive: true });
document.addEventListener("touchcancel", function (e) {
tap = lastTap = null;
if (gesture && e.touches.length < 2) endPinch();
}, { passive: true });
var animation = null;
function finishAnimation() {
if (!animation) return;
var a = animation;
animation = null;
cancelAnimationFrame(a.frame);
settle(a.to, a.at, a.x, a.y);
}
function zoomTo(z, x, y, ms) {
finishAnimation();
z = Math.min(ZOOM_MOST, Math.max(ZOOM_LEAST, z));
var at = under(x, y);
if (!ms) { settle(z, at, x, y); return; }
sheetDiv.style.transformOrigin = (x - at.box.left) + "px " + (y - at.box.top) + "px";
sheetDiv.classList.add("vw-moving");
var from = zoom, start = null;
animation = { to: z, at: at, x: x, y: y, frame: 0 };
function step(t) {
if (!animation) return;
if (start === null) start = t;
var f = Math.min(1, (t - start) / ms);
var eased = 1 - (1 - f) * (1 - f);
sheetDiv.style.transform = "scale(" + Math.pow(z / from, eased) + ")";
if (f >= 1) { finishAnimation(); return; }
animation.frame = requestAnimationFrame(step);
}
animation.frame = requestAnimationFrame(step);
}
function doubleTap(x, y) {
zoomTo(zoom < phone * Math.SQRT2 ? phone * DOUBLE_TAP_ZOOM : phone, x, y, DOUBLE_TAP_MS);
}
document.addEventListener("wheel", function (e) {
if (!e.ctrlKey) return;
e.preventDefault();
zoomTo(zoom * Math.exp(-e.deltaY / 300), e.clientX, e.clientY, 0);
}, { passive: false });
window.vwSheetZoom = function (z, x, y) {
if (z === undefined) return zoom;
zoomTo(z, x === undefined ? innerWidth / 2 : x, y === undefined ? innerHeight / 2 : y, 0);
return zoom;
};
window.vwSheetPlace = function (x, y) {
var at = under(x, y);
return [at.x, at.y];
};
addEventListener("resize", held);
var parts = null;
function partsOf() {
if (parts) return parts;
parts = [];
shown.forEach(function (sheet) {
sheet.lay(room());
sheet.firstPart = parts.length;
if (sheet.heads.length) parts.push({ sheet: sheet, piece: -1 });
sheet.pieces.forEach(function (piece, k) { parts.push({ sheet: sheet, piece: k }); });
});
return parts;
}
window.vwFindParts = {
count: function () { return partsOf().length; },
root: function (i) {
var p = partsOf()[i];
return p.piece < 0 ? p.sheet.headBlock() : p.sheet.block(p.piece);
},
show: function (i) {
var p = partsOf()[i];
if (p.sheet !== current) show(p.sheet);
return p.piece < 0 ? current.headBlock() : place(p.piece);
},
shown: function () { partsOf(); return current.firstPart; },
drawn: function (i) {
var p = partsOf()[i];
if (p.sheet !== current) return false;
var block = p.piece < 0 ? p.sheet.head : p.sheet.pieces[p.piece].block;
return !!block && block.parentNode === grid;
}
};
vwStatusDone();
held();
})
.catch(function (e) { vwError("Could not open this spreadsheet", String(e)); });