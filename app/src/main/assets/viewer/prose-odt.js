"use strict";
var ODT_NS = {
office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
draw: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
svg: "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0",
xlink: "http://www.w3.org/1999/xlink",
manifest: "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"
};
var ODT_MAX_XML = 96 * 1024 * 1024;
function odtAttr(el, ns, name) {
return el.getAttributeNS(ODT_NS[ns], name);
}
function odtIs(el, ns, name) {
return el.nodeType === 1 && el.localName === name && el.namespaceURI === ODT_NS[ns];
}
function odtChildren(el, ns, name) {
var out = [];
for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
if (odtIs(c, ns, name)) out.push(c);
}
return out;
}
function odtChild(el, ns, name) {
for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
if (odtIs(c, ns, name)) return c;
}
return null;
}
var ODT_UNITS = { pt: 1, "in": 72, cm: 72 / 2.54, mm: 72 / 25.4, px: 0.75, pc: 12 };
function odtPt(text) {
var m = /^\s*(-?[0-9]*\.?[0-9]+)(pt|in|cm|mm|px|pc)\s*$/.exec(text || "");
return m ? parseFloat(m[1]) * ODT_UNITS[m[2]] : null;
}
function odtPercent(text) {
var m = /^\s*(-?[0-9]*\.?[0-9]+)%\s*$/.exec(text || "");
return m ? parseFloat(m[1]) : null;
}
var ODT_LINE_STYLES = {
solid: "solid", double: "double", dotted: "dotted", dashed: "dashed", dash: "dashed",
"fine-dashed": "dashed", "dash-dot": "dashed", "dash-dot-dot": "dotted",
"double-thin": "double", groove: "groove", ridge: "ridge", inset: "inset", outset: "outset"
};
function odtBorder(text) {
if (!text || /^\s*(none|hidden)\s*$/.test(text)) return { width: 0 };
var out = { width: 0.75, style: "solid", color: "#000000" };
var parts = text.trim().split(/\s+/);
for (var i = 0; i < parts.length; i++) {
var pt = odtPt(parts[i]);
if (pt != null) out.width = pt;
else if (ODT_LINE_STYLES[parts[i]]) out.style = ODT_LINE_STYLES[parts[i]];
else if (vwProseColor(parts[i])) out.color = vwProseColor(parts[i]);
}
return out;
}
function odtIndexStyles(contentDoc, stylesDoc) {
var index = {
named: {}, defaults: {}, lists: {}, fonts: {}, layouts: {}, masters: [],
outline: null, automatic: { content: {}, styles: {} }, bags: {}
};
function take(container, into, lists, layouts) {
if (!container) return;
for (var s = container.firstElementChild; s; s = s.nextElementSibling) {
var name = odtAttr(s, "style", "name");
if (odtIs(s, "style", "style")) {
into[odtAttr(s, "style", "family") + "/" + name] = s;
} else if (odtIs(s, "style", "default-style")) {
index.defaults[odtAttr(s, "style", "family")] = s;
} else if (odtIs(s, "text", "list-style")) {
lists[name] = s;
} else if (odtIs(s, "text", "outline-style")) {
index.outline = s;
} else if (odtIs(s, "style", "page-layout")) {
layouts[name] = s;
}
}
}
function fonts(doc) {
var decls = doc && doc.getElementsByTagNameNS(ODT_NS.office, "font-face-decls")[0];
if (!decls) return;
var faces = odtChildren(decls, "style", "font-face");
for (var i = 0; i < faces.length; i++) {
var family = (odtAttr(faces[i], "svg", "font-family") || "").replace(/^'|'$/g, "");
index.fonts[odtAttr(faces[i], "style", "name")] =
{ family: family, kind: odtAttr(faces[i], "style", "font-family-generic") };
}
}
function section(doc, name) {
return doc ? doc.getElementsByTagNameNS(ODT_NS.office, name)[0] : null;
}
take(section(stylesDoc, "styles"), index.named, index.lists, index.layouts);
take(section(contentDoc, "styles"), index.named, index.lists, index.layouts);
take(section(stylesDoc, "automatic-styles"), index.automatic.styles, index.lists, index.layouts);
take(section(contentDoc, "automatic-styles"), index.automatic.content, index.lists, index.layouts);
fonts(stylesDoc);
fonts(contentDoc);
var masters = section(stylesDoc, "master-styles") || section(contentDoc, "master-styles");
if (masters) index.masters = odtChildren(masters, "style", "master-page");
return index;
}
function odtStyleNode(index, scope, family, name) {
return index.automatic[scope][family + "/" + name] || index.named[family + "/" + name] || null;
}
function odtReadStyle(index, node) {
var bag = {};
var sides = ["top", "right", "bottom", "left"];
var Sides = ["Top", "Right", "Bottom", "Left"];
function box(props, prefix, key, read) {
var all = odtAttr(props, "fo", prefix);
for (var i = 0; i < 4; i++) {
var one = odtAttr(props, "fo", prefix + "-" + sides[i]);
var v = read(one != null ? one : all);
if ((one != null || all != null) && v != null) bag[key(Sides[i])] = v;
}
}
var t = odtChild(node, "style", "text-properties");
if (t) {
var weight = odtAttr(t, "fo", "font-weight");
if (weight) bag.bold = weight === "bold" || parseInt(weight, 10) >= 600;
var slant = odtAttr(t, "fo", "font-style");
if (slant) bag.italic = slant !== "normal";
var under = odtAttr(t, "style", "text-underline-style");
if (under) {
bag.underline = under === "none" ? false :
odtAttr(t, "style", "text-underline-type") === "double" ? "double" :
under === "dotted" ? "dotted" : under === "wave" ? "wavy" :
/dash/.test(under) ? "dashed" : true;
}
var through = odtAttr(t, "style", "text-line-through-style");
if (through) {
bag.strike = through === "none" ? false :
odtAttr(t, "style", "text-line-through-type") === "double" ? "double" : true;
}
var ink = vwProseColor(odtAttr(t, "fo", "color"));
if (ink) bag.color = ink;
var mark = odtAttr(t, "fo", "background-color");
if (vwProseColor(mark)) bag.background = vwProseColor(mark);
var size = odtAttr(t, "fo", "font-size");
if (odtPt(size) != null) bag.size = odtPt(size);
else if (odtPercent(size) != null) bag.sizePercent = odtPercent(size);
var fontName = odtAttr(t, "style", "font-name");
var face = fontName ? (index.fonts[fontName] || { family: fontName }) : null;
if (!face && odtAttr(t, "fo", "font-family")) face = { family: odtAttr(t, "fo", "font-family") };
if (face) {
bag.font = vwProseFont(face.family, face.kind);
bag._symbol = vwProseSymbolFont(face.family);
}
var position = odtAttr(t, "style", "text-position");
if (position) {
var shift = position.trim().split(/\s+/);
var by = odtPercent(shift[0]);
bag.position = shift[0] === "super" || by > 0 ? "super" :
shift[0] === "sub" || by < 0 ? "sub" : null;
var share = shift.length > 1 ? odtPercent(shift[1]) : 58;
if (bag.position && share != null && share < 100) bag._shrink = share;
}
if (odtAttr(t, "fo", "font-variant") === "small-caps") bag.smallCaps = true;
if (odtAttr(t, "fo", "text-transform") === "uppercase") bag.caps = true;
if (odtPt(odtAttr(t, "fo", "letter-spacing"))) bag.spacing = odtPt(odtAttr(t, "fo", "letter-spacing"));
if (odtAttr(t, "text", "display") === "none") bag.hidden = true;
}
var p = odtChild(node, "style", "paragraph-properties");
if (p) {
var align = odtAttr(p, "fo", "text-align");
if (align) bag.align = { start: "start", end: "end", left: "left", right: "right",
center: "center", justify: "justify" }[align] || null;
if (!bag.align) delete bag.align;
box(p, "margin", function (S) {
return { Top: "before", Right: "right", Bottom: "after", Left: "left" }[S];
}, odtPt);
if (odtPt(odtAttr(p, "fo", "text-indent")) != null) bag.first = odtPt(odtAttr(p, "fo", "text-indent"));
bag._ownIndent = odtAttr(p, "fo", "margin-left") != null || odtAttr(p, "fo", "text-indent") != null;
var height = odtAttr(p, "fo", "line-height");
if (odtPercent(height) != null) bag.line = odtPercent(height) / 100;
else if (odtPt(height) != null) bag.lineExact = odtPt(height);
var least = odtPt(odtAttr(p, "style", "line-height-at-least"));
if (least) bag.lineAtLeast = least;
var ground = odtAttr(p, "fo", "background-color");
if (vwProseColor(ground)) bag.background = vwProseColor(ground);
box(p, "border", function (S) { return "border" + S; }, function (v) {
return v == null ? null : odtBorder(v);
});
box(p, "padding", function (S) { return "pad" + S; }, odtPt);
var mode = odtAttr(p, "style", "writing-mode");
if (/^(lr|rl)/.test(mode || "")) bag.rtl = /^rl/.test(mode);
var contextual = odtAttr(p, "style", "contextual-spacing");
if (contextual) bag._contextual = contextual === "true";
if (odtAttr(p, "fo", "break-before") === "page") bag._breakBefore = true;
if (odtAttr(p, "fo", "break-after") === "page") bag._breakAfter = true;
}
var c = odtChild(node, "style", "table-cell-properties");
if (c) {
var fill = odtAttr(c, "fo", "background-color");
if (vwProseColor(fill)) bag.background = vwProseColor(fill);
box(c, "border", function (S) { return "border" + S; }, function (v) {
return v == null ? null : odtBorder(v);
});
box(c, "padding", function (S) { return "pad" + S; }, odtPt);
var v = odtAttr(c, "style", "vertical-align");
if (v === "middle" || v === "bottom" || v === "top") bag.valign = v;
}
var tp = odtChild(node, "style", "table-properties");
if (tp) {
if (odtAttr(tp, "fo", "break-before") === "page") bag._breakBefore = true;
if (odtAttr(tp, "fo", "break-after") === "page") bag._breakAfter = true;
}
var r = odtChild(node, "style", "table-row-properties");
if (r) {
var rowFill = odtAttr(r, "fo", "background-color");
if (vwProseColor(rowFill)) bag.background = vwProseColor(rowFill);
var tall = odtPt(odtAttr(r, "style", "min-row-height")) || odtPt(odtAttr(r, "style", "row-height"));
if (tall) bag.minHeight = tall;
}
var master = odtAttr(node, "style", "master-page-name");
if (master != null) bag._master = master;
var list = odtAttr(node, "style", "list-style-name");
if (list != null) bag._list = list;
return bag;
}
function odtBag(index, scope, family, name) {
var key = scope + "/" + family + "/" + name;
if (index.bags[key]) return index.bags[key];
var chain = [];
var seen = {};
var node = name ? odtStyleNode(index, scope, family, name) : null;
while (node && chain.length < 64) {
chain.unshift(node);
var parent = odtAttr(node, "style", "parent-style-name");
if (!parent || seen[parent]) break;
seen[parent] = true;
node = odtStyleNode(index, scope, family, parent);
}
if (index.defaults[family]) chain.unshift(index.defaults[family]);
var bag = {};
for (var i = 0; i < chain.length; i++) {
var own = odtReadStyle(index, chain[i]);
if (own.sizePercent && bag.size) {
own.size = bag.size * own.sizePercent / 100;
delete own.sizePercent;
}
delete bag._ownIndent;
for (var k in own) if (own[k] != null) bag[k] = own[k];
if (odtIs(chain[i], "style", "style") && chain[i].parentNode.localName !== "automatic-styles") {
bag._named = odtAttr(chain[i], "style", "name");
}
}
if (bag._shrink) {
if (bag.size) bag.size = bag.size * bag._shrink / 100;
else bag.sizePercent = (bag.sizePercent || 100) * bag._shrink / 100;
}
index.bags[key] = bag;
return bag;
}
function odtCss(bag) {
var out = {};
for (var k in bag) if (k.charAt(0) !== "_") out[k] = bag[k];
if (bag._symbol) delete out.font;
return out;
}
function odtLayout(state, masterName) {
var index = state.index;
var master = null;
for (var i = 0; i < index.masters.length; i++) {
if (odtAttr(index.masters[i], "style", "name") === masterName) master = index.masters[i];
}
master = master || index.masters[0];
if (!master) return null;
var layout = { master: odtAttr(master, "style", "name") };
var node = index.layouts[odtAttr(master, "style", "page-layout-name")];
var props = node && odtChild(node, "style", "page-layout-properties");
if (props) {
var all = odtPt(odtAttr(props, "fo", "margin"));
layout.width = odtPt(odtAttr(props, "fo", "page-width"));
layout.height = odtPt(odtAttr(props, "fo", "page-height"));
layout.top = odtPt(odtAttr(props, "fo", "margin-top"));
layout.right = odtPt(odtAttr(props, "fo", "margin-right"));
layout.bottom = odtPt(odtAttr(props, "fo", "margin-bottom"));
layout.left = odtPt(odtAttr(props, "fo", "margin-left"));
if (layout.top == null) layout.top = all;
if (layout.right == null) layout.right = all;
if (layout.bottom == null) layout.bottom = all;
if (layout.left == null) layout.left = all;
}
function part(name) {
var el = odtChild(master, "style", name);
if (!el || odtAttr(el, "style", "display") === "false" || !el.firstElementChild) return null;
return function (into) {
odtBlocks(state, el, into, { scope: "styles", level: 0 });
};
}
layout.header = part("header");
layout.footer = part("footer");
return layout;
}
var ODT_NUM_FORMATS = { "1": "decimal", a: "lowerLetter", A: "upperLetter", i: "lowerRoman", I: "upperRoman" };
function odtLevelStyle(listStyle, level) {
if (!listStyle) return null;
for (var c = listStyle.firstElementChild; c; c = c.nextElementSibling) {
if (parseInt(odtAttr(c, "text", "level"), 10) === level) return c;
}
return null;
}
function odtLabel(state, listStyle, level, counts) {
var node = odtLevelStyle(listStyle, level);
if (!node) return { text: "", bag: {}, left: null, hang: 0 };
var out = { text: "", bag: {}, left: null, hang: 0 };
var props = odtChild(node, "style", "text-properties");
var styleName = odtAttr(node, "text", "style-name");
var bag = styleName ? odtBag(state.index, "content", "text", styleName) : {};
if (props) {
var own = odtReadStyle(state.index, node);
var merged = {};
var k;
for (k in bag) merged[k] = bag[k];
for (k in own) if (own[k] != null) merged[k] = own[k];
bag = merged;
}
if (odtIs(node, "text", "list-level-style-number") || odtIs(node, "text", "outline-level-style")) {
var format = odtAttr(node, "style", "num-format");
if (format) {
var show = parseInt(odtAttr(node, "text", "display-levels"), 10) || 1;
var parts = [];
for (var l = Math.max(1, level - show + 1); l <= level; l++) {
var at = l === level ? node : odtLevelStyle(listStyle, l);
var f = at ? odtAttr(at, "style", "num-format") : "1";
if (f) parts.push(vwProseNumber(counts[l] != null ? counts[l] : 1, ODT_NUM_FORMATS[f] || "decimal"));
}
out.text = (odtAttr(node, "style", "num-prefix") || "") + parts.join(".") +
(odtAttr(node, "style", "num-suffix") || "");
}
} else if (odtIs(node, "text", "list-level-style-bullet")) {
out.text = vwProseSymbols(odtAttr(node, "text", "bullet-char") || "\u2022", bag._symbol);
} else {
out.text = "\u2022";
}
out.bag = odtCss(bag);
var place = odtChild(node, "style", "list-level-properties");
var aligned = place && odtChild(place, "style", "list-level-label-alignment");
if (aligned) {
out.left = odtPt(odtAttr(aligned, "fo", "margin-left"));
var indent = odtPt(odtAttr(aligned, "fo", "text-indent"));
out.hang = indent != null && indent < 0 ? -indent : 0;
} else if (place) {
var before = odtPt(odtAttr(place, "text", "space-before")) || 0;
var widthOf = odtPt(odtAttr(place, "text", "min-label-width")) || 0;
out.left = before + widthOf;
out.hang = widthOf;
}
return out;
}
function odtStartOf(listStyle, level) {
var node = odtLevelStyle(listStyle, level);
var start = node ? parseInt(odtAttr(node, "text", "start-value"), 10) : NaN;
return isNaN(start) ? 1 : start;
}
function odtHidden(section) {
return odtAttr(section, "text", "display") === "none";
}
var ODT_INDEXES = /^(table-of-content|illustration-index|table-index|object-index|user-index|alphabetical-index|bibliography)$/;
function odtBlocks(state, el, into, ctx) {
for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
if (c.namespaceURI === ODT_NS.text) {
var n = c.localName;
if (n === "p") odtParagraph(state, c, into, ctx, "p");
else if (n === "h") odtParagraph(state, c, into, ctx, "h");
else if (n === "list") odtList(state, c, into, ctx);
else if (n === "numbered-paragraph") odtNumbered(state, c, into, ctx);
else if (n === "section") { if (!odtHidden(c)) odtBlocks(state, c, into, ctx); }
else if (n === "index-body" || n === "index-title") odtBlocks(state, c, into, ctx);
else if (ODT_INDEXES.test(n)) odtBlocks(state, c, into, ctx);
} else if (odtIs(c, "table", "table")) {
odtTable(state, c, into, ctx);
} else if (c.namespaceURI === ODT_NS.draw) {
var holder = document.createElement("p");
odtTarget(state, into, ctx).appendChild(holder);
odtInlineNode(state, c, holder, { scope: ctx.scope, space: { held: true } });
}
}
}
function odtTarget(state, into, ctx) {
return ctx.top ? state.prose.body : into;
}
function odtBreak(state, master) {
vwProseSheet(state.prose, master ? odtLayout(state, master) : null);
}
function odtPageBreak(state, node, bag) {
var started = node !== state.first && state.prose.body.firstChild != null;
if (started && (bag._breakBefore || bag._master || state.breakNext)) odtBreak(state, bag._master);
state.breakNext = !!bag._breakAfter;
}
function odtFirstBlock(el) {
for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
if (odtIs(c, "table", "table")) return c;
if (c.namespaceURI !== ODT_NS.text) continue;
var n = c.localName;
if (n === "p" || n === "h") return c;
if (n === "list" || n === "list-item" || n === "list-header" || n === "numbered-paragraph" ||
(n === "section" && !odtHidden(c)) || n === "index-body" || n === "index-title" ||
ODT_INDEXES.test(n)) {
var inner = odtFirstBlock(c);
if (inner) return inner;
}
}
return null;
}
function odtParagraph(state, node, into, ctx, kind) {
var prose = state.prose;
var bag = odtBag(state.index, ctx.scope, "paragraph", odtAttr(node, "text", "style-name"));
if (ctx.top) odtPageBreak(state, node, bag);
var tag = "p";
var level = 0;
if (kind === "h") {
level = Math.max(1, parseInt(odtAttr(node, "text", "outline-level"), 10) || 1);
tag = "h" + Math.min(level, 6);
}
var el = document.createElement(tag);
el.className = vwProseClass(prose, odtCss(bag));
odtTarget(state, into, ctx).appendChild(el);
var last = state.lastParagraph;
if (bag._contextual && last && last.el === el.previousElementSibling && last.named === bag._named) {
last.el.style.marginBottom = "0";
el.style.marginTop = "0";
}
state.lastParagraph = { el: el, named: bag._named };
odtInline(state, node, el, { scope: ctx.scope, symbol: bag._symbol, space: { held: true } });
var label = null;
if (ctx.item) {
label = odtItemLabel(state, ctx, bag);
} else if (level && state.index.outline && odtAttr(node, "text", "is-list-header") !== "true") {
var counts = state.outlineCounts;
var start = odtAttr(node, "text", "start-value");
counts[level] = start != null && parseInt(start, 10) >= 0 ? parseInt(start, 10)
: (counts[level] != null ? counts[level] + 1 : odtStartOf(state.index.outline, level));
counts.length = level + 1;
label = odtLabel(state, state.index.outline, level, counts);
if (!label.text) label = null;
else { label.left = null; label.hang = 0; }
}
if (label) odtPlaceLabel(state, el, bag, label);
return el;
}
function odtItemLabel(state, ctx, bag) {
var item = ctx.item;
var listStyle = ctx.listStyle;
if (!listStyle && bag._list) listStyle = state.index.lists[bag._list];
if (!listStyle) return null;
if (!item.counted && !item.header) {
var counts = item.counts;
var level = ctx.level;
counts[level] = item.start != null ? item.start
: (counts[level] != null ? counts[level] + 1 : odtStartOf(listStyle, level));
counts.length = level + 1;
}
var label = odtLabel(state, listStyle, ctx.level, item.counts);
if (item.counted || item.header) label.text = "";
item.counted = true;
return label;
}
function odtPlaceLabel(state, el, bag, label) {
var left = bag._ownIndent && bag.left != null ? bag.left : label.left;
var hang = bag._ownIndent && bag.first != null ? Math.max(0, -bag.first) : label.hang;
if (left != null) el.style.marginLeft = vwProsePt(left);
el.style.textIndent = label.text ? vwProsePt(-hang) : "0";
if (label.text) vwProseLabel(state.prose, el, label.text, label.bag, hang);
}
function odtList(state, node, into, ctx) {
var level = (ctx.level || 0) + 1;
var styleName = odtAttr(node, "text", "style-name");
var listStyle = styleName ? state.index.lists[styleName] : ctx.listStyle;
var counts;
var carried = odtAttr(node, "text", "continue-list");
if (level > 1 && ctx.item) counts = ctx.item.counts;
else if (carried && state.listCounts[carried]) counts = state.listCounts[carried];
else if (odtAttr(node, "text", "continue-numbering") === "true" && state.lastCounts[styleName]) {
counts = state.lastCounts[styleName];
} else counts = [];
var id = node.getAttribute("xml:id");
if (id) state.listCounts[id] = counts;
if (styleName) state.lastCounts[styleName] = counts;
for (var c = node.firstElementChild; c; c = c.nextElementSibling) {
var header = odtIs(c, "text", "list-header");
if (!header && !odtIs(c, "text", "list-item")) continue;
var start = parseInt(odtAttr(c, "text", "start-value"), 10);
odtBlocks(state, c, into, {
scope: ctx.scope, top: ctx.top, level: level, listStyle: listStyle,
item: { counts: counts, header: header, counted: false, start: isNaN(start) ? null : start }
});
}
}
function odtNumbered(state, node, into, ctx) {
var level = parseInt(odtAttr(node, "text", "level"), 10) || 1;
var styleName = odtAttr(node, "text", "style-name");
var counts = state.lastCounts[styleName] || (state.lastCounts[styleName] = []);
odtBlocks(state, node, into, {
scope: ctx.scope, top: ctx.top, level: level, listStyle: state.index.lists[styleName],
item: { counts: counts, header: false, counted: false, start: null }
});
}
var ODT_MAX_REPEATS = 10000;
function odtRepeat(state, node, which, into, draw) {
var times = parseInt(odtAttr(node, "table", "number-" + which + "-repeated"), 10) || 1;
for (var i = 0; i < times && (i === 0 || state.repeats > 0); i++) {
var el = draw(node);
into.appendChild(el);
if (i) state.repeats -= 1 + el.getElementsByTagName("td").length;
}
}
function odtTable(state, node, into, ctx) {
var prose = state.prose;
var index = state.index;
var table = document.createElement("table");
var styleName = odtAttr(node, "table", "style-name");
var tableNode = odtStyleNode(index, ctx.scope, "table", styleName);
var props = tableNode && odtChild(tableNode, "style", "table-properties");
if (ctx.top) odtPageBreak(state, node, odtBag(index, ctx.scope, "table", styleName));
var widths = [];
var known = true;
function columns(el) {
for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
if (odtIs(c, "table", "table-column")) {
var colNode = odtStyleNode(index, ctx.scope, "table-column", odtAttr(c, "table", "style-name"));
var colProps = colNode && odtChild(colNode, "style", "table-column-properties");
var w = colProps ? odtPt(odtAttr(colProps, "style", "column-width")) : null;
var times = Math.min(parseInt(odtAttr(c, "table", "number-columns-repeated"), 10) || 1, 256);
for (var i = 0; i < times; i++) widths.push(w);
if (w == null) known = false;
} else if (/^table-(columns|header-columns|column-group)$/.test(c.localName)) {
columns(c);
}
}
}
columns(node);
if (widths.length && known) {
var group = document.createElement("colgroup");
var total = 0;
for (var i = 0; i < widths.length; i++) {
var col = document.createElement("col");
col.style.width = vwProsePt(widths[i]);
total += widths[i];
group.appendChild(col);
}
table.appendChild(group);
table.style.tableLayout = "fixed";
table.style.width = vwProsePt(total);
}
if (props) {
var align = odtAttr(props, "table", "align");
if (align === "center") { table.style.marginLeft = "auto"; table.style.marginRight = "auto"; }
else if (align === "right") table.style.marginLeft = "auto";
else if (odtPt(odtAttr(props, "fo", "margin-left"))) {
table.style.marginLeft = vwProsePt(odtPt(odtAttr(props, "fo", "margin-left")));
}
var above = odtPt(odtAttr(props, "fo", "margin-top"));
var below = odtPt(odtAttr(props, "fo", "margin-bottom"));
if (above) table.style.marginTop = vwProsePt(above);
if (below) table.style.marginBottom = vwProsePt(below);
var fill = vwProseColor(odtAttr(props, "fo", "background-color"));
if (fill) table.style.backgroundColor = fill;
}
var body = document.createElement("tbody");
table.appendChild(body);
function cell(c) {
var td = document.createElement("td");
td.className = vwProseClass(prose, odtCss(
odtBag(index, ctx.scope, "table-cell", odtAttr(c, "table", "style-name"))));
var across = parseInt(odtAttr(c, "table", "number-columns-spanned"), 10);
var down = parseInt(odtAttr(c, "table", "number-rows-spanned"), 10);
if (across > 1) td.colSpan = Math.min(across, 1000);
if (down > 1) td.rowSpan = Math.min(down, 65534);
odtBlocks(state, c, td, { scope: ctx.scope, level: 0 });
return td;
}
function row(r) {
var tr = document.createElement("tr");
tr.className = vwProseClass(prose, odtCss(
odtBag(index, ctx.scope, "table-row", odtAttr(r, "table", "style-name"))));
for (var c = r.firstElementChild; c; c = c.nextElementSibling) {
if (!odtIs(c, "table", "table-cell")) continue;
odtRepeat(state, c, "columns", tr, cell);
}
return tr;
}
function rows(el) {
for (var r = el.firstElementChild; r; r = r.nextElementSibling) {
if (odtIs(r, "table", "table-row")) {
odtRepeat(state, r, "rows", body, row);
} else if (/^table-(rows|header-rows|row-group)$/.test(r.localName)) {
rows(r);
}
}
}
rows(node);
odtTarget(state, into, ctx).appendChild(table);
}
function odtText(into, text, ctx) {
text = text.replace(/[ \t\r\n]+/g, " ");
if (ctx.space.held && text.charAt(0) === " ") text = text.slice(1);
if (!text) return;
ctx.space.held = text.charAt(text.length - 1) === " ";
if (ctx.symbol || /[\uF020-\uF0FF]/.test(text)) text = vwProseSymbols(text, ctx.symbol);
into.appendChild(document.createTextNode(text));
}
function odtInline(state, node, into, ctx) {
for (var c = node.firstChild; c; c = c.nextSibling) {
if (c.nodeType === 3 || c.nodeType === 4) odtText(into, c.nodeValue, ctx);
else if (c.nodeType === 1) odtInlineNode(state, c, into, ctx);
}
}
function odtInlineNode(state, c, into, ctx) {
var n = c.localName;
if (c.namespaceURI === ODT_NS.draw) {
if (n === "frame") odtFrame(state, c, into, ctx);
else if (n === "a") odtInline(state, c, into, ctx);
else odtShape(state, c, into, ctx);
ctx.space.held = false;
return;
}
if (c.namespaceURI !== ODT_NS.text) return;
if (n === "span") {
var bag = odtBag(state.index, ctx.scope, "text", odtAttr(c, "text", "style-name"));
var span = document.createElement("span");
span.className = vwProseClass(state.prose, odtCss(bag));
into.appendChild(span);
odtInline(state, c, span, {
scope: ctx.scope, symbol: bag.font ? bag._symbol : ctx.symbol, space: ctx.space
});
} else if (n === "s" || n === "tab" || n === "line-break") {
if (n === "s") {
var spaces = Math.min(parseInt(odtAttr(c, "text", "c"), 10) || 1, 1000);
into.appendChild(document.createTextNode(new Array(spaces + 1).join(" ")));
} else {
into.appendChild(n === "tab" ? document.createTextNode("\t") : document.createElement("br"));
}
ctx.space.held = false;
} else if (n === "a") {
var link = document.createElement("a");
into.appendChild(link);
odtInline(state, c, link, ctx);
} else if (n === "note") {
odtNote(state, c, into, ctx);
} else if (n === "ruby") {
var ruby = document.createElement("ruby");
var base = odtChild(c, "text", "ruby-base");
var gloss = odtChild(c, "text", "ruby-text");
if (base) odtInline(state, base, ruby, ctx);
if (gloss) {
var rt = document.createElement("rt");
rt.textContent = gloss.textContent;
ruby.appendChild(rt);
}
into.appendChild(ruby);
} else if (n === "hidden-text" || n === "hidden-paragraph" || n === "tracked-changes" ||
n === "note-citation") {
} else {
odtInline(state, c, into, ctx);
}
}
function odtNote(state, node, into, ctx) {
var citation = odtChild(node, "text", "note-citation");
var mark = citation ? citation.textContent : "*";
var ref = document.createElement("sup");
ref.className = "vw-noteref";
ref.textContent = mark;
into.appendChild(ref);
var body = odtChild(node, "text", "note-body");
if (!body) return;
state.notes.push({ mark: mark, body: body, scope: ctx.scope });
}
function odtFlushNotes(state) {
if (!state.notes.length) return;
var area = vwProseNotes(state.prose);
for (var i = 0; i < state.notes.length; i++) {
var note = state.notes[i];
var holder = document.createElement("div");
area.appendChild(holder);
odtBlocks(state, note.body, holder, { scope: note.scope, level: 0 });
var first = holder.querySelector("p, h1, h2, h3, h4, h5, h6");
if (first) {
var mark = document.createElement("sup");
mark.textContent = note.mark;
first.insertBefore(document.createTextNode(" "), first.firstChild);
first.insertBefore(mark, first.firstChild);
first.style.marginLeft = "0";
first.style.textIndent = "0";
}
}
}
function odtShape(state, node, into, ctx) {
var paragraphs = node.getElementsByTagNameNS(ODT_NS.text, "p");
for (var i = 0; i < paragraphs.length; i++) {
if (i) into.appendChild(document.createElement("br"));
odtInline(state, paragraphs[i], into, ctx);
}
}
function odtFrame(state, node, into, ctx) {
var prose = state.prose;
var width = odtPt(odtAttr(node, "svg", "width"));
var height = odtPt(odtAttr(node, "svg", "height"));
var inline = odtAttr(node, "text", "anchor-type") === "as-char";
var styleNode = odtStyleNode(state.index, ctx.scope, "graphic", odtAttr(node, "draw", "style-name"));
var chain = 0;
var wrap = null;
var side = null;
while (styleNode && chain++ < 16) {
var g = odtChild(styleNode, "style", "graphic-properties");
if (g && wrap == null) wrap = odtAttr(g, "style", "wrap");
if (g && side == null) side = odtAttr(g, "style", "horizontal-pos");
var up = odtAttr(styleNode, "style", "parent-style-name");
styleNode = up ? odtStyleNode(state.index, ctx.scope, "graphic", up) : null;
}
function place(el) {
if (!inline) {
var floats = wrap === "left" || wrap === "right" || wrap === "parallel" ||
wrap === "dynamic" || wrap === "biggest";
if (floats && side !== "center") {
el.style.cssFloat = side === "right" || side === "outside" ? "right" : "left";
el.style.margin = side === "right" ? "0 0 6pt 9pt" : "0 9pt 6pt 0";
} else {
el.style.display = "block";
el.style.marginLeft = side === "center" || side === "right" ? "auto" : "0";
el.style.marginRight = side === "center" ? "auto" : "0";
}
el.style.textIndent = "0";
}
into.appendChild(el);
}
var title = odtChild(node, "svg", "title") || odtChild(node, "svg", "desc");
var alt = title ? title.textContent : "";
var box = odtChild(node, "draw", "text-box");
if (box) {
var div = document.createElement(inline ? "span" : "div");
if (inline) div.style.display = "inline-block";
if (width) div.style.width = vwProsePt(width);
div.style.maxWidth = "100%";
place(div);
odtBlocks(state, box, div, { scope: ctx.scope, level: 0 });
return;
}
var images = odtChildren(node, "draw", "image");
if (!images.length) {
if (odtChild(node, "draw", "object") || odtChild(node, "draw", "object-ole")) {
place(vwProsePicture(prose, null, width, height, alt));
}
return;
}
var slot = document.createElement("span");
place(slot);
state.pending.push(odtFirstDrawable(state, images, 0).then(function (bytes) {
var picture = vwProsePicture(prose, bytes, width, height, alt);
picture.style.cssText += slot.style.cssText;
if (slot.parentNode) slot.parentNode.replaceChild(picture, slot);
}));
}
function odtFirstDrawable(state, images, from) {
if (from >= images.length) return Promise.resolve(null);
return odtPictureBytes(state, images[from]).then(function (bytes) {
if (bytes && vwProsePictureType(bytes)) return bytes;
return odtFirstDrawable(state, images, from + 1).then(function (later) {
return later || bytes;
});
});
}
function odtPictureBytes(state, image) {
var inlineData = odtChild(image, "office", "binary-data");
if (inlineData) {
try {
var raw = atob(inlineData.textContent.replace(/\s+/g, ""));
var bytes = new Uint8Array(raw.length);
for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
return Promise.resolve(bytes);
} catch (e) {
return Promise.resolve(null);
}
}
var href = (odtAttr(image, "xlink", "href") || "").replace(/^\.\//, "");
var entry = state.zip && href && !/^[a-z][a-z0-9+.-]*:/i.test(href) ? state.zip.file(href) : null;
if (!entry) return Promise.resolve(null);
return entry.async("uint8array").catch(function () { return null; });
}
function odtParse(xml, what) {
var doc = new DOMParser().parseFromString(xml, "application/xml");
if (doc.getElementsByTagName("parsererror").length) {
throw new Error("The " + what + " inside this document is damaged.");
}
return doc;
}
function odtEntry(zip, name) {
var entry = zip.file(name);
if (!entry) return Promise.resolve(null);
var size = entry._data && entry._data.uncompressedSize;
if (size > ODT_MAX_XML) {
return Promise.reject(new Error("This document is too large to open here."));
}
return entry.async("string");
}
function vwReadOdt(buffer, container) {
var head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
var zipped = head[0] === 0x50 && head[1] === 0x4B;
var opened = zipped
? JSZip.loadAsync(buffer).then(function (zip) {
return Promise.all([
odtEntry(zip, "content.xml"), odtEntry(zip, "styles.xml"), odtEntry(zip, "META-INF/manifest.xml")
]).then(function (parts) {
if (parts[2] && /<manifest:encryption-data[\s>]/.test(parts[2])) {
throw new Error("This document is protected by a password, and Gander " +
"cannot open password-protected OpenDocument files.");
}
if (!parts[0]) throw new Error("This file has no document inside it.");
return {
zip: zip,
content: odtParse(parts[0], "text"),
styles: parts[1] ? odtParse(parts[1], "styles") : null
};
});
})
: Promise.resolve().then(function () {
var flat = odtParse(new TextDecoder("utf-8").decode(buffer), "text");
return { zip: null, content: flat, styles: flat };
});
return opened.then(function (file) {
var body = file.content.getElementsByTagNameNS(ODT_NS.office, "text")[0];
if (!body) throw new Error("This is not an OpenDocument text document.");
var state = {
prose: vwProseOpen(container),
index: odtIndexStyles(file.content, file.styles),
zip: file.zip,
pending: [], notes: [], listCounts: {}, lastCounts: {}, outlineCounts: [],
breakNext: false, first: null, repeats: ODT_MAX_REPEATS
};
var base = odtCss(odtBag(state.index, "content", "paragraph", ""));
state.prose.base = vwProseClass(state.prose, {
font: base.font, size: base.size, color: base.color
});
var first = state.first = odtFirstBlock(body);
var firstBag = !first ? {}
: odtIs(first, "table", "table")
? odtBag(state.index, "content", "table", odtAttr(first, "table", "style-name"))
: odtBag(state.index, "content", "paragraph", odtAttr(first, "text", "style-name"));
vwProseSheet(state.prose, odtLayout(state, firstBag._master || "Standard"));
odtBlocks(state, body, null, { scope: "content", top: true, level: 0 });
odtFlushNotes(state);
return Promise.all(state.pending).then(function () { return state.prose; });
});
}