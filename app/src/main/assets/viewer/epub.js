"use strict";
var VW_EPUB_PAGE_BYTES = 2048;
var vwEpub = (function () {
var XLINK = "http://www.w3.org/1999/xlink";
var SVGNS = "http://www.w3.org/2000/svg";
var OPS = "http://www.idpf.org/2007/ops";
var MATHML = "http://www.w3.org/1998/Math/MathML";
var SCRAMBLES = Object.assign(bag(), {
"http://www.idpf.org/2008/embedding": { key: "idpf", length: 1040 },
"http://ns.adobe.com/pdf/enc#RC": { key: "adobe", length: 1024 }
});
var FONT_START = /^(\x00\x01\x00\x00|OTTO|true|typ1|ttcf|wOFF|wOF2)$/;
var UUID = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;
var VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
var PURIFY = {
RETURN_DOM_FRAGMENT: true,
SANITIZE_DOM: false,
FORBID_TAGS: ["style", "link", "meta", "base", "form", "input", "button", "select",
"option", "textarea", "iframe", "frame", "object", "embed", "dialog"],
FORBID_ATTR: ["srcset", "sizes", "background", "autoplay", "ping", "action", "formaction"],
ADD_ATTR: ["epub:type", "xml:lang"]
};
var TYPES = Object.assign(bag(), {
png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", bmp: "image/bmp",
mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav",
mp4: "video/mp4", webm: "video/webm",
ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2"
});
var BOOK_CSS = [
":host { display: block; }",
".vw-page { contain: layout; box-sizing: border-box; max-width: 42em; margin: 0 auto;",
"  font-family: serif; font-size: 17px; line-height: 1.55;",
"  overflow-wrap: break-word; word-wrap: break-word; }",
"img, video { height: auto; }",
"svg { max-height: 100vh; }",
"pre { white-space: pre-wrap; }",
"table { max-width: 100%; }",
".vw-fixed > html { background-color: #ffffff; color: #000000; }",
"::highlight(vw-find) { background-color: rgba(255, 213, 79, 0.45); }",
"::highlight(vw-find-active) { background-color: rgba(255, 145, 0, 0.62); }"
].join("\n");
var GUARD_CSS = [
".vw-flow > html, .vw-flow > html > body { display: block !important; float: none !important;",
"  position: static !important; margin: 0 !important; columns: auto !important;",
"  width: auto !important; min-width: 0 !important; max-width: none !important;",
"  height: auto !important; min-height: 0 !important; max-height: none !important;",
"  overflow: visible !important; }",
".vw-flow > html { padding: 0 !important; }",
".vw-flow > html > body { padding: 8px 20px 24px !important; }",
".vw-flow html, .vw-flow body, .vw-flow body * { writing-mode: horizontal-tb !important; }",
".vw-flow img, .vw-flow svg, .vw-flow video { max-width: 100% !important; }",
".vw-fixed > html { display: block !important; position: relative !important;",
"  margin: 0 !important; padding: 0 !important; overflow: hidden !important;",
"  transform-origin: 0 0 !important; }",
"@media (prefers-color-scheme: dark) {",
"  .vw-flow html, .vw-flow body, .vw-flow body * { color: #E7E2D9 !important; }",
"  .vw-flow html, .vw-flow body, .vw-flow body *:not(img):not(svg):not(video) {",
"    background-color: transparent !important; }",
"  .vw-flow a, .vw-flow a * { color: #FFB39E !important; }",
"  .vw-flow svg text, .vw-flow svg tspan { fill: #E7E2D9 !important; }",
"  .vw-flow img[data-vw-ground=\"ink\"] { filter: invert(0.9) !important; }",
"  .vw-flow img[data-vw-ground=\"paper\"] { background-color: #E7E2D9 !important; }",
"}"
].join("\n");
var COUNTED = /^(img|svg|video)$/;
var CLEAR_KINDS = /^image\/(png|gif|webp|avif|svg\+xml)$/;
var WEIGH_PX = 32;
var TOO_DARK = 70;
var EDGES = ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"];
var LINK = /^(a|area)$/;
var CONTROLS = /^(button|fieldset|input|output|select|textarea)$/;
var OUTSIDE = /^(https?|mailto|tel):/i;
var FLOAT_ROOM_EMS = 8;
function bag() {
return Object.create(null);
}
var zip = null;
var names = bag();
var types = bag();
var stead = bag();
var locked = bag();
var scrambled = bag();
var bookId = "";
var bookUuid = "";
var keys = bag();
var spine = [];
var index = bag();
var contents = [];
var bookTitle = null;
var total = 0;
var shown = -1;
var onPage = null;
var drawn = null;
var turn = 0;
var sent = 0;
var above = 0;
var told = "";
var toldFlow = "";
var settling = 0;
var heldAt = -1;
var toldOver = false;
var before = null;
var setToFit = [];
var across = window.innerWidth;
var gauge = null;
var gaugeTall = 0;
var phoneType = Number(vwParams.get("type")) || 0;
var opened = false;
var moved = false;
var wholeBook = false;
var reading = false;
var watching = null;
var scales = null;
var darkness = bag();
var darkPhone = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
var held = bag();
var shared = bag();
var sheets = bag();
var readSheets = bag();
var host = document.getElementById("book");
var shadow = host.attachShadow({ mode: "open" });
var bookSheets = document.createElement("div");
var page = document.createElement("div");
var faces = document.createElement("style");
var EMPTY = document.createElement("div");
var bar = document.getElementById("epub-bar");
var where = document.getElementById("epub-where");
var turnBar = document.getElementById("epub-turn");
var prev = document.getElementById("epub-prev");
var next = document.getElementById("epub-next");
var panel = document.getElementById("epub-contents");
var list = document.getElementById("epub-contents-list");
var openContents = document.getElementById("epub-contents-open");
var closeContents = document.getElementById("epub-contents-close");
var linkBox = document.getElementById("epub-link");
var linkAddress = document.getElementById("epub-link-address");
var linkCopy = document.getElementById("epub-link-copy");
var linkClose = document.getElementById("epub-link-close");
function widens() {
var outer = document.createElement("div");
var box = document.createElement("div");
var inFlow = document.createElement("div");
var placed = document.createElement("div");
outer.style.cssText = "position:absolute;top:0;left:0;width:10px;height:10px;" +
"overflow:hidden;visibility:hidden";
box.style.cssText = "contain:layout;width:10px;height:10px";
inFlow.style.cssText = "width:50px;height:1px";
placed.style.cssText = "position:absolute;left:50px;width:10px;height:1px";
box.appendChild(inFlow);
box.appendChild(placed);
outer.appendChild(box);
document.body.appendChild(outer);
var is = outer.scrollWidth > outer.clientWidth;
document.body.removeChild(outer);
return is;
}
(function () {
var base = document.createElement("style");
var guard = document.createElement("style");
base.textContent = BOOK_CSS;
guard.textContent = GUARD_CSS;
page.className = "vw-page vw-flow";
if (widens()) {
host.style.overflowX = "hidden";
page.style.position = "relative";
}
shadow.appendChild(base);
shadow.appendChild(bookSheets);
shadow.appendChild(guard);
shadow.appendChild(page);
document.head.appendChild(faces);
})();
function problem(title, detail) {
var e = new Error(detail);
e.vwTitle = title;
return e;
}
function local(el) {
return (el.localName || "").toLowerCase();
}
function clean(s) {
return String(s || "").replace(/\s+/g, " ").trim();
}
var inBook = { resolve: resolve, entry: entry };
function entry(path) {
var file = zip.file(path);
if (file) return file;
var real = names[path.toLowerCase()];
return real ? zip.file(real) : null;
}
function bytes(path) {
var file = entry(path);
return file ? file.async("uint8array") : Promise.reject(new Error("The book has no " + path));
}
function decode(b) {
var as = "utf-8";
if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) as = "utf-16le";
else if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) as = "utf-16be";
else {
var head = "";
for (var i = 0; i < b.length && i < 200; i++) head += String.fromCharCode(b[i]);
var said = /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w.-]+)["']/i.exec(head) ||
/^\s*@charset\s+["']([\w.-]+)["']/i.exec(head);
if (said) as = said[1];
}
try {
return new TextDecoder(as).decode(b);
} catch (e) {
return new TextDecoder("utf-8").decode(b);
}
}
function text(path) {
return bytes(path).then(decode);
}
function sizeOf(path) {
var file = entry(path);
var data = file && file._data;
return data && data.uncompressedSize > 0 ? data.uncompressedSize : 0;
}
function resolve(base, href) {
href = String(href == null ? "" : href).trim();
if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.indexOf("//") === 0) return null;
var hash = href.indexOf("#");
var frag = hash < 0 ? "" : href.slice(hash + 1);
var path = hash < 0 ? href : href.slice(0, hash);
var query = path.indexOf("?");
if (query >= 0) path = path.slice(0, query);
try { path = decodeURIComponent(path); } catch (e) {  }
try { frag = decodeURIComponent(frag); } catch (e) {  }
if (!path) return { path: base, frag: frag };
var from = path.charAt(0) === "/" ? "" : base.slice(0, base.lastIndexOf("/") + 1);
var steps = (from + path).split("/");
var out = [];
for (var i = 0; i < steps.length; i++) {
if (steps[i] === "" || steps[i] === ".") continue;
if (steps[i] === "..") out.pop();
else out.push(steps[i]);
}
return { path: out.join("/"), frag: frag };
}
function xml(source) {
var doc = new DOMParser().parseFromString(source, "application/xml");
if (!doc.documentElement || doc.getElementsByTagName("parsererror").length) {
throw new Error("One of the book's own files is not sound XML.");
}
return doc;
}
function all(node, name) {
return node.getElementsByTagNameNS("*", name);
}
function readLocks() {
if (!entry("META-INF/encryption.xml")) return Promise.resolve();
return text("META-INF/encryption.xml").then(function (source) {
var data = all(xml(source), "EncryptedData");
for (var i = 0; i < data.length; i++) {
var method = all(data[i], "EncryptionMethod")[0];
var ref = all(data[i], "CipherReference")[0];
var at = ref && resolve("", ref.getAttribute("URI"));
if (!at) continue;
var how = SCRAMBLES[method ? method.getAttribute("Algorithm") || "" : ""];
if (how) scrambled[at.path] = how;
else locked[at.path] = true;
}
}).catch(function () {  });
}
function kindOf(path) {
var type = (types[path] || "").split(";")[0].trim();
if (isPage(path) || !type || /^text\/|[/+]xml$/.test(type)) return "page";
return isPicture(path) ? "picture" : "other";
}
function isPicture(path) {
return /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test((types[path] || "").split(";")[0].trim());
}
function drawnFrom(path) {
if (!stead[path] || !/^image\//.test(types[path] || "") || isPicture(path) || isPage(path)) return path;
var seen = bag();
for (var at = path; at && !seen[at]; at = stead[at]) {
seen[at] = true;
if ((isPicture(at) || isPage(at)) && entry(at)) return at;
}
return path;
}
function isPage(path) {
var type = (types[path] || "").split(";")[0].trim();
return type === "application/xhtml+xml" || type === "image/svg+xml";
}
function writtenRightToLeft(tag) {
var m = /^([a-z]{2,3})(?:[-_]([a-z]{4}))?(?:[-_]|$)/i.exec(tag || "");
if (!m) return false;
if (m[2]) return /^(adlm|arab|hebr|nkoo|rohg|syrc|thaa)$/i.test(m[2]);
return /^(ar|ckb|dv|fa|he|ks|ps|sd|ug|ur|yi)$/i.test(m[1]);
}
function readPackage(doc, path) {
var byId = bag();
var insteadOf = bag();
var nav = null;
var ncx = null;
var items = all(doc, "item");
for (var i = 0; i < items.length; i++) {
var at = resolve(path, items[i].getAttribute("href"));
if (!at) continue;
var type = (items[i].getAttribute("media-type") || "").toLowerCase();
types[at.path] = type;
byId[items[i].getAttribute("id")] = at.path;
insteadOf[items[i].getAttribute("id")] = items[i].getAttribute("fallback");
if (/(^|\s)nav(\s|$)/.test(items[i].getAttribute("properties") || "")) nav = at.path;
if (type === "application/x-dtbncx+xml" && !ncx) ncx = at.path;
}
for (var id in insteadOf) {
if (byId[insteadOf[id]]) stead[byId[id]] = byId[insteadOf[id]];
}
var fixedBook = false;
var metas = all(doc, "meta");
for (var m = 0; m < metas.length; m++) {
if (metas[m].getAttribute("property") === "rendition:layout") {
fixedBook = clean(metas[m].textContent) === "pre-paginated";
}
}
function readFrom(id) {
var seen = bag();
for (var at = id; at && byId[at] && !seen[at]; at = insteadOf[at]) {
seen[at] = true;
if ((isPage(byId[at]) || isPicture(byId[at])) && entry(byId[at])) return byId[at];
}
return byId[id];
}
var refs = all(doc, "itemref");
for (var r = 0; r < refs.length; r++) {
var file = readFrom(refs[r].getAttribute("idref"));
if (!file || !entry(file) || index[file] !== undefined) continue;
if (locked[file]) {
throw problem("This book is locked",
"It is protected against copying (DRM), so only the app of the shop or library " +
"it came from can open it.");
}
var kind = kindOf(file);
var pages = kind === "page" ? Math.max(1, Math.ceil(sizeOf(file) / VW_EPUB_PAGE_BYTES)) : 1;
index[file] = spine.length;
var says = " " + (refs[r].getAttribute("properties") || "") + " ";
var fixed = says.indexOf(" rendition:layout-pre-paginated ") >= 0 ||
(fixedBook && says.indexOf(" rendition:layout-reflowable ") < 0);
spine.push({ path: file, kind: kind, pages: pages, start: total, fixed: fixed, wait: null, ready: null });
total += pages;
}
if (!spine.length) throw new Error("The book lists no chapters.");
var own = doc.documentElement.getAttribute("unique-identifier");
var ids = all(doc, "identifier");
for (var n = ids.length - 1; n >= 0; n--) {
if (n === 0 || ids[n].getAttribute("id") === own) {
bookId = ids[n].textContent;
break;
}
}
for (var u = -1; u < ids.length && !bookUuid; u++) {
bookUuid = (UUID.exec(u < 0 ? bookId : ids[u].textContent) || [""])[0];
}
var tongue = all(doc, "language")[0];
if (tongue && clean(tongue.textContent)) host.lang = clean(tongue.textContent);
bookTitle = captionOf(all(doc, "title")[0]);
var spineEl = all(doc, "spine")[0];
var goes = spineEl ? clean(spineEl.getAttribute("page-progression-direction")).toLowerCase() : "";
turnBar.dir = goes === "rtl" || (goes !== "ltr" && writtenRightToLeft(host.lang)) ? "rtl" : "ltr";
var declared = spineEl && byId[spineEl.getAttribute("toc")];
return { nav: nav, ncx: declared || ncx };
}
function captionOf(el) {
var out = { text: el ? clean(el.textContent) : "", dir: "", lang: null };
for (; el; el = el.parentElement) {
var dir = (el.getAttribute("dir") || "").trim().toLowerCase();
if (!out.dir && /^(ltr|rtl|auto)$/.test(dir)) out.dir = el.vwDir || dir;
if (out.dir === "auto") {
var source = el.cloneNode(true);
var skip = source.querySelectorAll("bdi, script, style, textarea, [dir=ltr i], [dir=rtl i], [dir=auto i]");
for (var i = 0; i < skip.length; i++) skip[i].remove();
var probe = document.createElement("bdi");
probe.hidden = true;
probe.textContent = source.textContent;
document.body.appendChild(probe);
el.vwDir = out.dir = getComputedStyle(probe).direction;
probe.remove();
}
if (out.lang === null) out.lang = el.hasAttribute("lang") ? el.getAttribute("lang") : el.getAttribute("xml:lang");
}
return { text: out.text, dir: out.dir || "auto", lang: out.lang === null ? host.lang : out.lang };
}
function putCaption(el, c) {
el.textContent = c ? c.text : "";
el.dir = c ? c.dir : "auto";
el.lang = c ? c.lang : "";
}
function listed(el, depth, base, href, out) {
var label = captionOf(el);
if (!label.text && /^(a|span)$/.test(local(el))) label.text = calledBy(el);
if (!label.text) return;
var at = href ? resolve(base, href) : null;
var place = at && index[at.path] !== undefined ? index[at.path] : -1;
out.push({ label: label, depth: depth, at: place, frag: at && place >= 0 ? at.frag : "" });
}
function navList(ol, depth, base, out) {
for (var li = ol.firstElementChild; li; li = li.nextElementSibling) {
if (local(li) !== "li") continue;
var named = null;
var under = null;
for (var c = li.firstElementChild; c; c = c.nextElementSibling) {
var name = local(c);
if (name === "ol") under = c;
else if (!named && (name === "a" || name === "span")) named = c;
}
if (named) listed(named, depth, base, named.getAttribute("href"), out);
if (under) navList(under, depth + 1, base, out);
}
}
function calledBy(el) {
var img = el.querySelector("img");
return clean(el.getAttribute("title") || (img && (img.getAttribute("alt") || img.getAttribute("title"))) || "");
}
function readNav(path) {
return text(path).then(function (source) {
var navs = all(markup(source), "nav");
var toc = null;
for (var i = 0; i < navs.length && !toc; i++) {
if (/(^|\s)toc(\s|$)/.test(navs[i].getAttribute("epub:type") || "")) toc = navs[i];
}
toc = toc || navs[0];
var out = [];
for (var c = toc ? toc.firstElementChild : null; c; c = c.nextElementSibling) {
if (local(c) === "ol") navList(c, 0, path, out);
}
return out;
});
}
function ncxPoints(parent, depth, base, out) {
for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
if (local(c) !== "navpoint") continue;
var label = null;
var src = null;
for (var k = c.firstElementChild; k; k = k.nextElementSibling) {
if (local(k) === "navlabel") label = all(k, "text")[0] || k;
else if (local(k) === "content") src = k.getAttribute("src");
}
if (label) listed(label, depth, base, src, out);
ncxPoints(c, depth + 1, base, out);
}
}
function readNcx(path) {
return text(path).then(function (source) {
var map = all(xml(source), "navMap")[0];
var out = [];
if (map) ncxPoints(map, 0, path, out);
return out;
});
}
function readContents(from) {
function attempt(read, path) {
return path ? read(path).catch(function () { return []; }) : Promise.resolve([]);
}
return attempt(readNav, from.nav).then(function (found) {
return found.length ? found : attempt(readNcx, from.ncx);
}).then(function (found) {
contents = found;
if (contents.length) return;
for (var i = 0; i < spine.length; i++) {
contents.push({ label: { text: "Part " + (i + 1), dir: "auto", lang: "" }, depth: 0, at: i, frag: "" });
}
});
}
function open(buffer) {
return JSZip.loadAsync(buffer).then(function (z) {
zip = z;
for (var name in z.files) names[name.toLowerCase()] = name;
if (!entry("META-INF/container.xml")) throw new Error("not a book");
return readLocks();
}, function () {
throw new Error("not a book");
}).catch(function () {
throw problem("Could not open this book", "It is not an EPUB, or the file is damaged.");
}).then(function () {
return text("META-INF/container.xml");
}).then(function (source) {
var roots = all(xml(source), "rootfile");
var path = null;
for (var i = 0; i < roots.length && !path; i++) path = roots[i].getAttribute("full-path");
if (!path || !entry(path)) throw new Error("The book does not say where its chapters are listed.");
return text(path).then(function (pkg) { return readPackage(xml(pkg), path); });
}).then(readContents);
}
function markup(source) {
var doc = new DOMParser().parseFromString(source, "application/xhtml+xml");
if (doc.documentElement && !doc.getElementsByTagName("parsererror").length) return doc;
var spelled = source.replace(/<([A-Za-z][\w:.-]*)((?:\s[^<>]*?)?)\/>/g, function (m, tag, attrs) {
return VOID.test(tag) ? m : "<" + tag + attrs + "></" + tag + ">";
});
return new DOMParser().parseFromString(spelled, "text/html");
}
function addressed(style) {
return !!style && style.indexOf("(") >= 0 && vwBookCss.inStyle(style, "", false, inBook).found.all > 0;
}
function setAside(el, name) {
var value = el.getAttribute(name);
if (value === null) return;
el.removeAttribute(name);
el.setAttribute("data-vw-" + name, value);
}
function disarm(doc) {
var every = doc.getElementsByTagName("*");
for (var n = 0; n < every.length; n++) {
var named = every[n].attributes;
for (var k = named.length - 1; k >= 0; k--) {
var lower = named[k].name.toLowerCase();
if (lower === named[k].name || !/^(src|poster|style)$/.test(lower)) continue;
var was = named[k].value;
every[n].removeAttribute(named[k].name);
every[n].setAttribute(lower, was);
}
}
var els = doc.querySelectorAll("[src], [poster], [style], image, use, feImage, feimage");
for (var i = 0; i < els.length; i++) {
var el = els[i];
setAside(el, "src");
setAside(el, "poster");
if (addressed(el.getAttribute("style"))) setAside(el, "style");
var name = local(el);
if (name !== "image" && name !== "use" && name !== "feimage") continue;
var href = el.getAttributeNS(XLINK, "href") || el.getAttribute("href") || "";
if (name === "use" && href.charAt(0) === "#") continue;
el.removeAttributeNS(XLINK, "href");
el.removeAttribute("href");
if (name === "image" && href) el.setAttribute("data-vw-href", href);
}
var shapes = doc.getElementsByTagNameNS(SVGNS, "*");
for (var s = 0; s < shapes.length; s++) {
var attrs = shapes[s].attributes;
for (var a = attrs.length - 1; a >= 0; a--) {
if (/^(data-vw-)?style$/.test(attrs[a].name) || attrs[a].value.indexOf("(") < 0) continue;
if (vwBookCss.inStyle(attrs[a].value, "", false, inBook).found.far) shapes[s].removeAttribute(attrs[a].name);
}
}
}
function unswitch(doc) {
var found = [].slice.call(doc.getElementsByTagNameNS(OPS, "switch"))
.concat([].slice.call(doc.getElementsByTagName("epub:switch")));
found.forEach(function (sw) {
if (!sw.parentNode) return;
var keep = null;
for (var c = sw.firstElementChild; c && !keep; c = c.nextElementSibling) {
if (/(^|:)default$/.test(local(c))) keep = c;
}
while (keep && keep.firstChild) sw.parentNode.insertBefore(keep.firstChild, sw);
sw.parentNode.removeChild(sw);
});
}
function kept(el) {
var out = {};
if (!el) return out;
["class", "id", "dir", "lang"].forEach(function (name) {
var value = el.getAttribute(name);
if (value) out[name] = value;
});
if (!out.lang && el.getAttribute("xml:lang")) out.lang = el.getAttribute("xml:lang");
var style = el.getAttribute("style");
if (style) {
var read = vwBookCss.inStyle(style, "", false, inBook);
if (!read.found.all) out.style = read.parts.join("");
}
return out;
}
function drawnAt(doc) {
var meta = doc.querySelector('meta[name="viewport"]');
var said = meta ? meta.getAttribute("content") || "" : "";
var w = /(?:^|[\s,;])width\s*=\s*([\d.]+)/i.exec(said);
var h = /(?:^|[\s,;])height\s*=\s*([\d.]+)/i.exec(said);
return w && h && w[1] > 0 && h[1] > 0 ? { w: Number(w[1]), h: Number(h[1]) } : null;
}
function chapter(source, path, fixed) {
var doc = markup(source);
var body = doc.body;
if (!body) {
var around = document.implementation.createHTMLDocument("");
around.body.appendChild(around.importNode(doc.documentElement, true));
doc = around;
body = around.body;
}
var rows = doc.querySelector('link[rel~="stylesheet"][class~="horizontal"]') !== null;
var styles = [];
var marks = doc.querySelectorAll("link, style");
for (var i = 0; i < marks.length; i++) {
if (local(marks[i]) === "style") {
styles.push({ css: marks[i].textContent });
continue;
}
var rel = marks[i].getAttribute("rel") || "";
var made = " " + (marks[i].getAttribute("class") || "") + " ";
if (!/(^|\s)stylesheet(\s|$)/i.test(rel)) continue;
if (rows && made.indexOf(" vertical ") >= 0) continue;
if (/(^|\s)alternate(\s|$)/i.test(rel) && !(rows && made.indexOf(" horizontal ") >= 0)) continue;
var at = resolve(path, marks[i].getAttribute("href"));
if (at && entry(at.path)) styles.push({ path: at.path });
}
unswitch(doc);
disarm(doc);
var holder = document.createElement("body");
holder.appendChild(DOMPurify.sanitize(body, PURIFY));
return {
body: holder, html: kept(doc.documentElement), own: kept(body), styles: styles,
drawn: fixed ? drawnAt(doc) : null
};
}
function pictured(path) {
var name = encodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
return '<html xmlns="http://www.w3.org/1999/xhtml"><head><title></title></head>' +
'<body><img src="' + name + '" alt=""/></body></html>';
}
function load(i) {
var ch = spine[i];
if (ch.wait) return ch.wait;
var read = ch.kind === "picture" ? Promise.resolve(pictured(ch.path))
: ch.kind === "other" ? Promise.reject(new Error("Not a page."))
: text(ch.path);
ch.wait = read.then(function (source) {
return chapter(source, ch.path, ch.fixed);
}).catch(function () {
var holder = document.createElement("body");
var said = document.createElement("p");
said.textContent = "This part of the book could not be read.";
holder.appendChild(said);
return { body: holder, html: {}, own: {}, styles: [], drawn: null };
}).then(function (made) {
ch.ready = made;
return made;
});
return ch.wait;
}
function trim() {
if (wholeBook) return;
for (var i = 0; i < spine.length; i++) {
if (Math.abs(i - shown) > 1) {
spine[i].wait = null;
spine[i].ready = null;
}
}
}
function typeOf(path) {
var said = types[path] || "";
if (/^(image|audio|video|font)\//.test(said)) return said;
if (/font|opentype|truetype/.test(said)) return "application/octet-stream";
return TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] || null;
}
function key(kind) {
if (keys[kind]) return keys[kind];
if (kind === "adobe") {
var hex = bookUuid.replace(/-/g, "");
var made = hex ? new Uint8Array(16) : null;
for (var i = 0; made && i < 16; i++) made[i] = parseInt(hex.substr(i * 2, 2), 16);
keys[kind] = Promise.resolve(made);
} else if (window.crypto && crypto.subtle && window.TextEncoder) {
var name = new TextEncoder().encode(bookId.replace(/[\u0020\u0009\u000D\u000A]/g, ""));
keys[kind] = crypto.subtle.digest("SHA-1", name).then(function (digest) {
return new Uint8Array(digest);
}, function () {
return null;
});
} else {
keys[kind] = Promise.resolve(null);
}
return keys[kind];
}
function unscrambled(b, how) {
return key(how.key).then(function (k) {
if (!k) return null;
var out = new Uint8Array(b);
var n = Math.min(out.length, how.length);
for (var i = 0; i < n; i++) out[i] ^= k[i % k.length];
return FONT_START.test(String.fromCharCode(out[0], out[1], out[2], out[3])) ? out : null;
});
}
function objectUrl(path, store) {
if (store[path]) return store[path];
var type = typeOf(path);
if (!type || locked[path] || !entry(path)) return Promise.resolve(null);
store[path] = bytes(path).then(function (b) {
return scrambled[path] ? unscrambled(b, scrambled[path]) : b;
}).then(function (b) {
return b ? URL.createObjectURL(new Blob([b], { type: type })) : null;
}, function () {
return null;
});
return store[path];
}
function release() {
for (var path in held) {
held[path].then(function (url) { if (url) URL.revokeObjectURL(url); });
}
held = bag();
}
function partsOf(name) {
if (!readSheets[name]) {
readSheets[name] = text(name).then(function (css) {
return vwBookCss.parsed(css, name, inBook);
}, function () {
return [];
});
}
return readSheets[name];
}
function answered(parts, store) {
var wanted = [];
(function want(list) {
list.forEach(function (part) {
if (part.face) want(part.face);
else if (part.path !== undefined) wanted.push(part.path);
});
})(parts);
return Promise.all(wanted.map(function (path) { return objectUrl(path, store); })).then(function (made) {
var urlOf = bag();
for (var i = 0; i < wanted.length; i++) urlOf[wanted[i]] = made[i];
function written(part) {
return typeof part === "string" ? part : 'url("' + (urlOf[part.path] || "data:,") + '")';
}
var css = "";
var fonts = "";
parts.forEach(function (part) {
if (!part.face) {
css += written(part);
return;
}
var rule = part.face.map(written).join("");
if (/url\("(blob:|data:[^,])/i.test(rule)) fonts += rule + "\n";
});
return { css: css, faces: fonts };
});
}
function fitted(source, base, name) {
var known = bag();
function reach(found, deep) {
var wanted = [];
found.forEach(function (parts) {
parts.forEach(function (part) {
if (part.imp !== undefined && !(part.imp in known) && deep < 8) {
known[part.imp] = null;
wanted.push(part.imp);
}
});
});
if (!wanted.length) return null;
return Promise.all(wanted.map(partsOf)).then(function (got) {
for (var i = 0; i < wanted.length; i++) known[wanted[i]] = got[i];
return reach(got, deep + 1);
});
}
var root;
return new Promise(function (done) {
done(name ? partsOf(name) : vwBookCss.parsed(source, base, inBook));
}).then(function (parts) {
root = parts;
if (name) known[name] = root;
return reach([root], 0);
}).then(function () {
var placed = bag();
var out = [];
(function visit(parts, at) {
if (at) placed[at] = true;
for (var i = parts.length - 1; i >= 0; i--) {
var part = parts[i];
var to = part.imp;
if (to === undefined) out.push(part);
else if (known[to] && !placed[to]) visit(known[to], to);
}
})(root, name);
return answered(out.reverse(), shared);
}).catch(function () {
return { css: "", faces: "" };
});
}
function sheet(path) {
if (!sheets[path]) {
var file = entry(path);
sheets[path] = file ? fitted(null, null, file.name) : Promise.resolve({ css: "", faces: "" });
}
return sheets[path];
}
function fetched(body, base) {
var jobs = [];
var clear = [];
function one(el, name, put) {
var value = el.getAttribute("data-vw-" + name);
if (value === null) return;
el.removeAttribute("data-vw-" + name);
if (/^data:(image|audio|video)\//i.test(value)) {
jobs.push(Promise.resolve(function () { put(el, value); }));
return;
}
var at = resolve(base, value);
var from = at ? drawnFrom(at.path) : "";
if (from && name === "src" && local(el) === "img" && CLEAR_KINDS.test(typeOf(from))) clear.push(el);
jobs.push((from ? objectUrl(from, held) : Promise.resolve(null)).then(function (url) {
return function () { if (url) put(el, url); };
}));
}
var els = body.querySelectorAll("[data-vw-src], [data-vw-poster], [data-vw-href], [data-vw-style]");
for (var i = 0; i < els.length; i++) {
one(els[i], "src", function (el, url) { el.setAttribute("src", url); });
one(els[i], "poster", function (el, url) { el.setAttribute("poster", url); });
one(els[i], "href", function (el, url) { el.setAttributeNS(XLINK, "xlink:href", url); });
(function (el) {
var style = el.getAttribute("data-vw-style");
if (style === null) return;
el.removeAttribute("data-vw-style");
jobs.push(answered(vwBookCss.inStyle(style, base, true, inBook).parts, held).then(function (got) {
return function () { el.setAttribute("style", got.css); };
}));
})(els[i]);
}
return Promise.all(jobs).then(function (puts) {
var dress = function () { puts.forEach(function (put) { put(); }); };
dress.clear = clear;
return dress;
});
}
function watch(pictures) {
if (watching) watching.disconnect();
watching = null;
if (!pictures.length || !window.IntersectionObserver) return;
watching = new IntersectionObserver(function (seen) {
for (var i = 0; i < seen.length; i++) {
if (!seen[i].isIntersecting) continue;
watching.unobserve(seen[i].target);
weigh(seen[i].target);
}
}, { rootMargin: "100% 0px" });
pictures.forEach(function (img) { watching.observe(img); });
}
function weigh(img) {
if (!img.complete) {
img.addEventListener("load", function () { weigh(img); });
return;
}
if (!img.naturalWidth || img.hasAttribute("data-vw-ground")) return;
var style = getComputedStyle(img);
if (style.filter !== "none" || style.backgroundImage !== "none" ||
!/^(transparent|rgba\(0, 0, 0, 0\))$/.test(style.backgroundColor)) return;
var data;
try {
scales2d().clearRect(0, 0, WEIGH_PX, WEIGH_PX);
scales.drawImage(img, 0, 0, WEIGH_PX, WEIGH_PX);
data = scales.getImageData(0, 0, WEIGH_PX, WEIGH_PX).data;
} catch (e) {
return;
}
var clear = 0;
var inked = 0;
var dark = 0;
var black = 0;
for (var k = 0; k < data.length; k += 4) {
if (data[k + 3] < 64) clear++;
if (data[k + 3] < 128) continue;
inked++;
var light = 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
var hue = Math.max(data[k], data[k + 1], data[k + 2]) - Math.min(data[k], data[k + 1], data[k + 2]);
if (light < 90) dark++;
if (light < TOO_DARK && hue < 32) black++;
}
if (!inked || clear * 10 < WEIGH_PX * WEIGH_PX) return;
if (black * 100 >= inked * 85) img.setAttribute("data-vw-ground", "ink");
else if (dark * 100 >= inked * 60) img.setAttribute("data-vw-ground", "paper");
}
function scales2d() {
if (!scales) {
var canvas = document.createElement("canvas");
canvas.width = canvas.height = WEIGH_PX;
scales = canvas.getContext("2d");
}
return scales;
}
function tooDark(colour) {
if (darkness[colour] !== undefined) return darkness[colour];
var is = false;
try {
scales2d().fillStyle = "#ffffff";
scales.fillStyle = colour;
var read = String(scales.fillStyle);
var hex = /^#(..)(..)(..)$/.exec(read);
var parts = hex ? [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)]
: (read.match(/[\d.]+/g) || []).map(Number);
is = parts.length >= 3 && !(parts.length > 3 && parts[3] < 0.5) &&
0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2] < TOO_DARK;
} catch (e) {  }
darkness[colour] = is;
return is;
}
function inkEdges(style) {
for (var k = 0; k < EDGES.length; k++) {
var colour = style.getPropertyValue(EDGES[k]);
if (colour && tooDark(colour)) {
style.setProperty(EDGES[k], "currentColor", style.getPropertyPriority(EDGES[k]));
}
}
}
function inkRules(rules) {
for (var i = 0; i < rules.length; i++) {
if (rules[i].cssRules) inkRules(rules[i].cssRules);
if (rules[i].selectorText && rules[i].style) inkEdges(rules[i].style);
}
}
function settled(body) {
return new Promise(function (resolve) {
var imgs = body.querySelectorAll("img");
var waiting = 0;
var done = false;
function finish() {
if (done) return;
done = true;
resolve();
}
function one() {
if (--waiting <= 0) finish();
}
for (var i = 0; i < imgs.length; i++) {
if (imgs[i].complete) continue;
waiting++;
imgs[i].addEventListener("load", one);
imgs[i].addEventListener("error", one);
}
if (!waiting) finish();
else setTimeout(finish, 1500);
});
}
function scale() {
var by = page.clientWidth / drawn.w;
onPage.parentNode.style.transform = "scale(" + by + ")";
page.style.height = Math.ceil(drawn.h * by) + "px";
}
function setFor(el, name, value) {
setToFit.push({
el: el, name: name, value: el.style.getPropertyValue(name), priority: el.style.getPropertyPriority(name)
});
el.style.setProperty(name, value, "important");
}
function floaters(rules, into) {
for (var i = 0; i < rules.length; i++) {
var rule = rules[i];
if (rule.cssRules) floaters(rule.cssRules, into);
if (rule.selectorText && rule.style && rule.style.cssFloat && rule.style.cssFloat !== "none") {
into.push(rule.selectorText);
}
}
}
function unfloat() {
var found = ["[style*=float]", "img[align]", "table[align]"];
for (var s = bookSheets.firstChild; s; s = s.nextSibling) {
try { floaters(s.sheet.cssRules, found); } catch (e) {  }
}
var narrow = FLOAT_ROOM_EMS * (parseFloat(getComputedStyle(onPage).fontSize) || 17);
var loose = [];
found.forEach(function (selector) {
var els;
try { els = onPage.querySelectorAll(selector); } catch (e) { return; }
for (var i = 0; i < els.length; i++) {
var style = getComputedStyle(els[i]);
if (style.cssFloat === "none") continue;
var within = els[i].parentNode;
var around = getComputedStyle(within);
while (within !== onPage && /^(inline|contents)$/.test(around.display)) {
within = within.parentNode;
around = getComputedStyle(within);
}
var room = within.clientWidth - (parseFloat(around.paddingLeft) || 0) - (parseFloat(around.paddingRight) || 0);
var taken = els[i].getBoundingClientRect().width +
Math.max(0, parseFloat(style.marginLeft) || 0) + Math.max(0, parseFloat(style.marginRight) || 0);
var left = room - taken;
if (taken * 2 > room && left >= 1 && left < narrow) loose.push({ el: els[i], block: style.display === "block" });
}
});
loose.forEach(function (b) {
setFor(b.el, "float", "none");
if (!b.block) return;
setFor(b.el, "display", "block");
setFor(b.el, "margin-left", "auto");
setFor(b.el, "margin-right", "auto");
});
}
function fit() {
if (drawn) return scale();
if (!onPage) return;
unfloat();
if (onPage.scrollWidth <= onPage.clientWidth + 1) return;
if (getComputedStyle(onPage).overflowX !== "visible") return;
var edge = document.documentElement.clientWidth;
var wide = [];
function hold(box, style) {
while (box !== onPage && (box.namespaceURI === MATHML || /^(inline|contents)/.test(style.display))) {
box = box.parentNode;
style = getComputedStyle(box);
}
if (wide.length && wide[wide.length - 1].el === box) return;
wide.push({
el: box,
table: /^table/.test(style.display),
scrolls: style.overflowX !== "visible",
margins: Math.max(0, parseFloat(style.marginLeft) || 0) + Math.max(0, parseFloat(style.marginRight) || 0)
});
}
function seek(parent) {
var rtl = getComputedStyle(parent).direction === "rtl";
var found = false;
for (var el = parent.firstElementChild; el; el = el.nextElementSibling) {
var rect = el.getBoundingClientRect();
if (!rect.width) continue;
var over = el.scrollWidth - el.clientWidth;
var out = rtl ? rect.left < -1 : rect.right > edge + 1;
var spills = !out && over > 1 &&
(rtl ? rect.left + el.clientLeft - over < -1 : rect.left + el.clientLeft + el.scrollWidth > edge + 1);
if (!out && !spills) continue;
var style = getComputedStyle(el);
if (style.position === "absolute" || style.position === "fixed") continue;
found = true;
if (spills) {
if (style.overflowX !== "visible") continue;
if (seek(el)) continue;
}
hold(el, style);
}
return found;
}
if (!seek(onPage)) hold(onPage, getComputedStyle(onPage));
wide.forEach(function (b) {
if (b.table) setFor(b.el, "display", "block");
setFor(b.el, "box-sizing", "border-box");
setFor(b.el, "max-width", "calc(100% - " + b.margins + "px)");
if (!b.scrolls) setFor(b.el, "overflow-x", "auto");
});
}
function refit() {
for (var i = setToFit.length - 1; i >= 0; i--) {
var was = setToFit[i];
if (was.value) was.el.style.setProperty(was.name, was.value, was.priority);
else was.el.style.removeProperty(was.name);
}
setToFit = [];
fit();
}
function fraction() {
var box = page.getBoundingClientRect();
var root = document.documentElement;
if (window.pageYOffset > 0 && window.pageYOffset + window.innerHeight >= root.scrollHeight - 2) {
return 0.999999;
}
return Math.max(0, Math.min(0.999999, (vwTopPx - box.top) / (box.height || 1)));
}
function pageNow() {
var ch = spine[shown];
return ch.start + Math.min(ch.pages - 1, Math.floor(fraction() * ch.pages + 1e-6)) + 1;
}
function report() {
if (shown < 0 || !onPage) return;
var n = pageNow();
if (n !== sent && vwFind.post("page " + n + " " + total)) sent = n;
}
function flow() {
var say = drawn ? "reflow 0" : "reflow 1";
if (say !== toldFlow && vwFind.post(say)) toldFlow = say;
}
function topEdge() {
return Math.max(0, vwTopPx - vwBarGonePx);
}
function counted() {
return document.createTreeWalker(onPage, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
acceptNode: function (n) {
return n.nodeType === 3 || COUNTED.test(local(n))
? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
}
});
}
function showing(box, top) {
return !!box && box.height > 0 && box.bottom - top >= Math.min(box.height / 2, 24);
}
function lineOf(text, k, last) {
var range = document.createRange();
range.setStart(text, k);
range.setEnd(text, text.data.length);
var boxes = range.getClientRects();
for (var i = 0; i < boxes.length; i++) {
var box = boxes[last ? boxes.length - 1 - i : i];
if (box.height > 0) return box;
}
return null;
}
function firstShowing(el, top) {
for (var n = el.firstChild; n; n = n.nextSibling) {
if (n.nodeType === 3) {
if (!/\S/.test(n.data)) continue;
var end = lineOf(n, 0, true);
if (!showing(end, top)) continue;
var lo = 0;
var hi = n.data.length - 1;
while (lo < hi) {
var mid = (lo + hi) >> 1;
if (showing(lineOf(n, mid) || end, top)) hi = mid;
else lo = mid + 1;
}
return { node: n, at: lo };
}
if (n.nodeType !== 1) continue;
var box = n.getBoundingClientRect();
if (COUNTED.test(local(n))) {
if (showing(box, top)) return { node: n, at: 0 };
continue;
}
if (box.height > 0 && box.bottom <= top) continue;
var found = firstShowing(n, top);
if (found) return found;
}
return null;
}
function countBefore(node, at) {
var walk = counted();
var sum = 0;
for (var n = walk.nextNode(); n; n = walk.nextNode()) {
if (n === node) return sum + at;
sum += n.nodeType === 3 ? n.data.length : 1;
}
return 0;
}
function boxAt(past) {
var walk = counted();
var left = past;
for (var n = walk.nextNode(); n; n = walk.nextNode()) {
var size = n.nodeType === 3 ? n.data.length : 1;
if (left >= size) {
left -= size;
continue;
}
var box = n.nodeType === 3 ? lineOf(n, left) : n.getBoundingClientRect();
if (box && box.height > 0) return box;
left = 0;
}
return null;
}
function rest() {
settling = 0;
if (shown < 0 || !onPage || page.style.opacity === "0") return;
readOn();
if (heldAt >= 0 && Math.abs(window.pageYOffset - heldAt) < 1) return;
heldAt = -1;
above = here();
tell();
}
function here() {
var first = window.pageYOffset > 0 ? firstShowing(onPage, topEdge()) : null;
return first ? countBefore(first.node, first.at) : 0;
}
function tell() {
var say = "at " + shown + " " + above;
if (say !== told && vwFind.post(say)) told = say;
}
function named(frag) {
var el = shadow.getElementById(frag);
if (el || !window.CSS || !CSS.escape) return el;
return onPage.querySelector('[name="' + CSS.escape(frag) + '"]');
}
function place(to) {
var mark = to && to.frag ? named(to.frag) : null;
var box = !mark && to && to.past > 0 ? boxAt(to.past) : null;
if (mark) {
mark.scrollIntoView();
} else if (box) {
window.scrollTo(0, window.pageYOffset + box.top - topEdge());
} else if (to && to.end) {
window.scrollTo(0, document.documentElement.scrollHeight);
} else {
window.scrollTo(0, 0);
}
}
function middle() {
var el = shadow.elementFromPoint
? shadow.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) : null;
return el && onPage && onPage !== el && onPage.contains(el) ? el : null;
}
function nameOf(i) {
var best = null;
var bestAt = -1;
for (var k = 0; k < contents.length; k++) {
var at = contents[k].at;
if (at < 0 || at > i || at < bestAt) continue;
if (at > bestAt || !best) {
best = contents[k].label;
bestAt = at;
}
}
return best;
}
function dressLike(el, attrs) {
for (var name in attrs) el.setAttribute(name, attrs[name]);
}
function show(i, to, quiet) {
var made = spine[i].ready;
var mine = ++turn;
var base = spine[i].path;
release();
shown = i;
moved = false;
setToFit = [];
heldAt = -1;
above = to && to.past > 0 ? to.past : 0;
tell();
var html = document.createElement("html");
var body = made.body.cloneNode(true);
dressLike(html, made.html);
dressLike(body, made.own);
html.appendChild(body);
drawn = made.drawn;
flow();
page.className = drawn ? "vw-page vw-fixed" : "vw-page vw-flow";
page.style.height = "";
if (drawn) {
html.style.width = drawn.w + "px";
html.style.height = drawn.h + "px";
}
bookSheets.textContent = "";
faces.textContent = "";
page.textContent = "";
page.style.opacity = "0";
page.appendChild(html);
onPage = body;
putCaption(where, nameOf(i));
prev.disabled = i <= 0;
next.disabled = i >= spine.length - 1;
if (!quiet) place(to);
var styled = Promise.all(made.styles.map(function (s) {
return s.path ? sheet(s.path) : fitted(s.css, base);
}));
Promise.all([styled, fetched(body, base)]).then(function (got) {
if (mine !== turn) return null;
var keep = quiet ? middle() : null;
var fonts = "";
var night = !drawn && !!darkPhone && darkPhone.matches;
got[0].forEach(function (s) {
var el = document.createElement("style");
el.textContent = s.css;
bookSheets.appendChild(el);
fonts += s.faces;
try { if (night && el.sheet) inkRules(el.sheet.cssRules); } catch (e) {  }
});
faces.textContent = fonts;
got[1]();
if (night) {
var ruled = body.querySelectorAll('[style*="border"]');
for (var r = 0; r < ruled.length; r++) inkEdges(ruled[r].style);
}
watch(night ? got[1].clear : []);
page.style.opacity = "";
fit();
if (keep) keep.scrollIntoView({ block: "center" });
else if (!quiet) place(to);
return settled(body).then(function () { return keep; });
}).then(function (keep) {
if (mine !== turn) return;
fit();
if (!moved) {
if (keep) keep.scrollIntoView({ block: "center" });
else if (!quiet) place(to);
}
if (!opened) {
opened = true;
bar.hidden = false;
turnBar.hidden = false;
vwStatusDone();
}
report();
if (!quiet) vwFind.changed();
trim();
rest();
}).catch(function (e) {
page.style.opacity = "";
if (!opened) fail(e);
});
}
function go(i, to) {
if (i < 0 || i >= spine.length) return Promise.resolve();
if (i === shown && onPage) {
place(to);
report();
return Promise.resolve();
}
var mine = ++turn;
return load(i).then(function () {
if (mine === turn) show(i, to, false);
});
}
function readWholeBook() {
if (wholeBook) return;
wholeBook = true;
reading = true;
var chain = Promise.resolve();
spine.forEach(function (ch, i) {
chain = chain.then(function () { return load(i); });
});
chain.then(function () {
reading = false;
vwFind.reread();
});
}
window.vwFindParts = {
count: function () { return spine.length; },
root: function (i) {
if (i === shown && onPage) return onPage;
if (spine[i].ready) return spine[i].ready.body;
readWholeBook();
return EMPTY;
},
show: function (i) {
if (spine[i].ready) {
forget();
show(i, null, true);
}
return onPage;
},
shown: function () { return shown; },
busy: function () { return reading; },
top: topEdge
};
window.vwPageCommand = function (msg) {
var verb = msg.charAt(0);
if (verb === "o" && opened) showContents(true);
else if (verb === "x") closeOver();
};
window.vwPortReady = function () {
sent = 0;
told = "";
toldFlow = "";
toldOver = false;
if (shown < 0 || !onPage) return;
flow();
report();
rest();
over();
};
function buildContents() {
putCaption(document.getElementById("epub-title"), bookTitle);
for (var i = 0; i < contents.length && i < 20000; i++) {
var li = document.createElement("li");
var el = document.createElement(contents[i].at < 0 ? "span" : "button");
if (contents[i].at >= 0) {
el.type = "button";
el.setAttribute("data-n", i);
}
putCaption(el, contents[i].label);
el.style.webkitPaddingStart = (12 + 16 * Math.min(contents[i].depth, 4)) + "px";
li.appendChild(el);
list.appendChild(li);
}
}
function showContents(on) {
if (on) {
var here = nameOf(shown);
var buttons = list.querySelectorAll("button");
var current = null;
for (var i = 0; i < buttons.length; i++) {
var e = contents[Number(buttons[i].getAttribute("data-n"))];
var is = !current && e.at === shown && e.label === here;
if (is) {
buttons[i].setAttribute("aria-current", "true");
current = buttons[i];
} else {
buttons[i].removeAttribute("aria-current");
}
}
showLink("");
panel.hidden = false;
if (current) current.scrollIntoView({ block: "center" });
closeContents.focus({ preventScroll: true });
} else {
panel.hidden = true;
openContents.focus({ preventScroll: true });
}
over();
}
function over() {
var is = !panel.hidden || !linkBox.hidden || !!before;
if (is !== toldOver && vwFind.post(is ? "cover 1" : "cover 0")) toldOver = is;
}
function closeOver() {
if (!linkBox.hidden) {
showLink("");
} else if (!panel.hidden) {
showContents(false);
} else if (before) {
var to = before;
before = null;
go(to.i, { past: to.past });
}
toldOver = false;
over();
}
function remember(from) {
before = { i: from.i, past: from.past, y: window.pageYOffset, touched: false };
over();
}
function forget() {
if (!before) return;
before = null;
over();
}
function readOn() {
if (!before) return;
if (!before.touched) before.y = window.pageYOffset;
else if (Math.abs(window.pageYOffset - before.y) > 2 * window.innerHeight) forget();
}
function near(past) {
if (past <= 0) return window.pageYOffset < window.innerHeight;
var box = boxAt(past);
return !!box && Math.abs(box.top - topEdge()) < window.innerHeight;
}
function outside(href) {
href = String(href || "").trim();
if (href.indexOf("//") === 0) return "https:" + href;
return OUTSIDE.test(href) ? href : "";
}
function showLink(address) {
if (address) {
linkAddress.textContent = address;
linkCopy.textContent = "Copy address";
linkBox.hidden = false;
linkCopy.focus({ preventScroll: true });
} else {
linkBox.hidden = true;
}
over();
}
function copyLink() {
var range = document.createRange();
range.selectNodeContents(linkAddress);
var chosen = window.getSelection();
chosen.removeAllRanges();
chosen.addRange(range);
function done() {
chosen.removeAllRanges();
linkCopy.textContent = "Copied";
}
var did = false;
try { did = document.execCommand("copy"); } catch (e) {  }
if (did) {
done();
} else if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(linkAddress.textContent).then(done, function () {  });
}
}
openContents.addEventListener("click", function () { showContents(true); });
closeContents.addEventListener("click", function () { showContents(false); });
prev.addEventListener("click", function () { forget(); go(shown - 1, null); });
next.addEventListener("click", function () { forget(); go(shown + 1, null); });
linkCopy.addEventListener("click", copyLink);
linkClose.addEventListener("click", function () { showLink(""); });
linkBox.addEventListener("click", function (e) { if (e.target === linkBox) showLink(""); });
list.addEventListener("click", function (e) {
var el = e.target;
if (!el || !el.getAttribute || el.getAttribute("data-n") === null) return;
var to = contents[Number(el.getAttribute("data-n"))];
forget();
showContents(false);
go(to.at, to.frag ? { frag: to.frag } : null);
});
function linkAt(el) {
for (var a = el; a && a !== shadow; a = a.parentNode) {
if (a.nodeType === 1 && LINK.test(local(a)) && (a.hasAttribute("href") || a.hasAttributeNS(XLINK, "href"))) return a;
}
return null;
}
function detailsAt(el, link) {
if (CONTROLS.test(local(el))) return null;
for (var s = el; s && s !== link; s = s.parentNode) {
if (s.nodeType !== 1 || local(s) !== "summary" || !s.parentNode || local(s.parentNode) !== "details") continue;
for (var first = s.parentNode.firstElementChild; first && local(first) !== "summary"; first = first.nextElementSibling);
if (first === s) return s.parentNode;
}
return null;
}
shadow.addEventListener("click", function (e) {
var a = linkAt(e.target);
if (!a) return;
e.preventDefault();
var details = detailsAt(e.target, a);
if (details) {
details.open = !details.open;
return;
}
var href = a.getAttribute("href") || a.getAttributeNS(XLINK, "href");
if (!href) return;
var at = resolve(spine[shown].path, href);
if (!at) {
var address = outside(href);
if (address) showLink(address);
return;
}
if (index[at.path] === undefined) return;
var from = { i: shown, past: here() };
var back = before;
go(index[at.path], at.frag ? { frag: at.frag } : null).then(function () {
if (back && shown === back.i && near(back.past)) forget();
else remember(from);
});
});
shadow.addEventListener("auxclick", function (e) {
if (linkAt(e.target)) e.preventDefault();
});
var TAPPED = /^(audio|label|summary|video)$/;
var selectedAtDown = false;
document.addEventListener("pointerdown", function () {
var sel = shadow.getSelection ? shadow.getSelection() : document.getSelection();
selectedAtDown = !!sel && !sel.isCollapsed && String(sel).length > 0;
}, true);
function onTheBook(e) {
var path = e.composedPath ? e.composedPath() : [e.target];
for (var i = 0; i < path.length; i++) {
var n = path[i];
if (n === host) return true;
if (n === bar || n === turnBar) return false;
if (n.nodeType === 1 && (CONTROLS.test(local(n)) || TAPPED.test(local(n)))) return false;
}
return path[0] === document.body || path[0] === document.documentElement;
}
function lineTall() {
var el = shadow.elementFromPoint
? shadow.elementFromPoint(window.innerWidth / 2, window.innerHeight - 2) : null;
if (!el || !onPage.contains(el)) el = onPage;
var style = getComputedStyle(el);
var tall = parseFloat(style.lineHeight);
if (!(tall > 0)) tall = 1.25 * parseFloat(style.fontSize);
return tall > 0 ? Math.min(tall, window.innerHeight / 4) : 0;
}
function turnPage(side) {
var y = window.pageYOffset;
if (side > 0 && y + window.innerHeight >= document.documentElement.scrollHeight - 2) {
if (shown < spine.length - 1) {
forget();
go(shown + 1, null);
}
return;
}
if (side < 0 && y <= 0) {
if (shown > 0) {
forget();
go(shown - 1, { end: true });
}
return;
}
var step = Math.max(window.innerHeight - topEdge() - lineTall(), window.innerHeight / 2);
window.scrollTo(0, y + side * step);
}
document.addEventListener("click", function (e) {
if (e.defaultPrevented || e.detail === 0 || selectedAtDown || shown < 0 || !onPage) return;
if (!panel.hidden || !linkBox.hidden) return;
var vv = window.visualViewport;
if (vv && vv.scale > 1.01) return;
if (!onTheBook(e)) return;
var third = window.innerWidth / 3;
var side = e.clientX < third ? -1 : e.clientX > 2 * third ? 1 : 0;
if (!side) return;
turnPage(turnBar.dir === "rtl" ? -side : side);
});
var reporting = false;
window.addEventListener("scroll", function () {
var own = relaying() || (heldAt >= 0 && Math.abs(window.pageYOffset - heldAt) < 1);
if (!own) {
if (settling) clearTimeout(settling);
settling = setTimeout(function () {
try { rest(); } catch (e) { settling = 0; }
}, 150);
}
if (reporting) return;
reporting = true;
requestAnimationFrame(function () {
reporting = false;
report();
});
}, { passive: true });
function relaid() {
across = window.innerWidth;
gaugeTall = typeTall();
ownSize();
if (shown < 0 || !onPage) return;
refit();
if (!settling) {
place(above > 0 ? { past: above } : null);
heldAt = window.pageYOffset;
}
if (before) before.y = window.pageYOffset;
report();
}
function ownSize() {
var tall = typeTall();
if (!phoneType || !tall) return;
document.documentElement.style.setProperty("--epub-own", String(phoneType / tall));
}
window.addEventListener("resize", function () {
if (window.innerWidth !== across) relaid();
});
function typeTall() {
return gauge ? gauge.getBoundingClientRect().height : 0;
}
function relaying() {
return typeTall() !== gaugeTall || window.innerWidth !== across;
}
(function () {
if (!window.ResizeObserver) return;
var first = true;
gauge = document.createElement("span");
gauge.id = "epub-gauge";
gauge.textContent = "M";
gauge.setAttribute("aria-hidden", "true");
gauge.style.cssText = "position:absolute;top:0;left:0;visibility:hidden;" +
"pointer-events:none;white-space:nowrap;font:100px/1 serif";
document.body.appendChild(gauge);
gaugeTall = typeTall();
ownSize();
new ResizeObserver(function () {
if (first) {
first = false;
gaugeTall = typeTall();
return;
}
try { relaid(); } catch (e) {  }
}).observe(gauge);
})();
["touchstart", "wheel", "keydown"].forEach(function (name) {
window.addEventListener(name, function () {
moved = true;
if (before) before.touched = true;
}, { passive: true });
});
function fail(e) {
vwError((e && e.vwTitle) || "Could not open this book", String((e && e.message) || e));
}
vwFetchDoc("buffer").then(open).then(function () {
buildContents();
var left = /^(\d+)\.(\d+)$/.exec(vwParams.get("at") || "");
if (left && Number(left[1]) < spine.length) {
return go(Number(left[1]), { past: Number(left[2]) });
}
return go(0, null);
}).catch(fail);
return { go: go };
})();