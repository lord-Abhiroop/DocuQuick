var VW_XL_PALETTE = [
"000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
"000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
"800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080",
"9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF",
"000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF",
"00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99",
"3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696",
"003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333"
];
var VW_XL_SCHEME = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4",
"accent5", "accent6", "hlink", "folHlink"];
var VW_XL_THEME = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000",
"5B9BD5", "70AD47", "0563C1", "954F72"];
var VW_XL_PATTERN = {
solid: 1, darkGray: 0.75, darkTrellis: 0.75, mediumGray: 0.5, darkHorizontal: 0.5,
darkVertical: 0.5, darkDown: 0.5, darkUp: 0.5, darkGrid: 0.5, lightGrid: 0.4375,
lightTrellis: 0.375, lightGray: 0.25, lightHorizontal: 0.25, lightVertical: 0.25,
lightDown: 0.25, lightUp: 0.25, gray125: 0.125, gray0625: 0.0625
};
var VW_SHEET_NIGHT_GROUND = "17130A";
var VW_SHEET_NIGHT_INK = "E7E2D9";
var VW_SHEET_NIGHT_LIFT = 0.7;
var VW_SHEET_CONTRAST = 4.5;
function vwXmlAll(xml, name) {
return vwXmlElements(xml, name, 0);
}
function vwXmlFirst(xml, name) {
var all = vwXmlElements(xml, name, 1);
return all.length ? all[0] : null;
}
var vwXmlTagRes = {};
function vwXmlElements(xml, name, most) {
var res = vwXmlTagRes[name] || (vwXmlTagRes[name] = [
new RegExp("<(?:[\\w.-]+:)?" + name + "(?=[\\s/>])([^>]*?)(/?)>", "g"),
new RegExp("</(?:[\\w.-]+:)?" + name + "\\s*>", "g")
]);
var open = res[0], close = res[1], out = [], m, unended = false;
open.lastIndex = 0;
while ((m = open.exec(xml))) {
var body = "";
if (!m[2]) {
if (unended) continue;
close.lastIndex = open.lastIndex;
var end = close.exec(xml);
if (!end) {
unended = true;
continue;
}
body = xml.slice(open.lastIndex, end.index);
open.lastIndex = close.lastIndex;
}
out.push([m[1], body]);
if (most && out.length >= most) break;
}
return out;
}
var vwXmlAttrRes = {};
function vwXmlAttr(attrs, name) {
var re = vwXmlAttrRes[name] ||
(vwXmlAttrRes[name] = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')"));
var m = re.exec(attrs);
if (!m) return null;
var value = m[1] !== undefined ? m[1] : m[2];
return value.indexOf("&") >= 0 ? vwXmlUnescape(value) : vwOwn(value);
}
function vwOwn(s) {
return s.length < 13 ? s : (" " + s).slice(1);
}
function vwXmlFlag(xml, name) {
var el = vwXmlFirst(xml, name);
return !!el && !/^(0|false)$/i.test(vwXmlAttr(el[0], "val") || "");
}
function vwXmlText(bytes) {
if (!bytes) return "";
var encoding = bytes[0] === 0xFF && bytes[1] === 0xFE ? "utf-16le"
: bytes[0] === 0xFE && bytes[1] === 0xFF ? "utf-16be" : "utf-8";
try {
return new TextDecoder(encoding).decode(bytes);
} catch (e) {
return "";
}
}
function vwRgb(hex) {
return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}
function vwHex(rgb) {
return rgb.map(function (v) {
var s = Math.round(Math.min(255, Math.max(0, v))).toString(16).toUpperCase();
return s.length < 2 ? "0" + s : s;
}).join("");
}
function vwBlend(a, b, share) {
var x = vwRgb(a), y = vwRgb(b);
return vwHex(x.map(function (v, i) { return v + (y[i] - v) * share; }));
}
function vwTint(hex, tint) {
var c = vwRgb(hex).map(function (v) { return v / 255; });
var max = Math.max(c[0], c[1], c[2]), min = Math.min(c[0], c[1], c[2]);
var l = (max + min) / 2, d = max - min, h = 0, s = 0;
if (d) {
s = l <= 0.5 ? d / (max + min) : d / (2 - max - min);
h = max === c[0] ? (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0)
: max === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
h /= 6;
}
l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
if (!s) return vwHex([l * 255, l * 255, l * 255]);
var q = l <= 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
function channel(t) {
t = (t % 1 + 1) % 1;
var v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
return v * 255;
}
return vwHex([channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]);
}
function vwContrast(a, b) {
function luminance(hex) {
var c = vwRgb(hex).map(function (v) {
v /= 255;
return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
});
return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] + 0.05;
}
var x = luminance(a), y = luminance(b);
return x > y ? x / y : y / x;
}
function vwSheetNight(hex) {
var c = vwRgb(hex), ground = vwRgb(VW_SHEET_NIGHT_GROUND), ink = vwRgb(VW_SHEET_NIGHT_INK);
return vwHex(VW_NIGHT_MATRIX.map(function (row, i) {
var v = row[0] * c[0] / 255 + row[1] * c[1] / 255 + row[2] * c[2] / 255 + row[3];
v = Math.pow(Math.min(1, Math.max(0, v)), VW_SHEET_NIGHT_LIFT);
return ground[i] + v * (ink[i] - ground[i]);
}));
}
function vwReadableOn(fill, dark, light) {
return vwContrast(dark, fill) >= vwContrast(light, fill) ? dark : light;
}
function vwXlColour(attrs, theme, palette) {
var hex = null, v;
if ((v = vwXmlAttr(attrs, "rgb")) !== null && /^([0-9A-Fa-f]{2})?[0-9A-Fa-f]{6}$/.test(v)) {
hex = v.slice(-6).toUpperCase();
} else if ((v = vwXmlAttr(attrs, "theme")) !== null) {
hex = theme[+v] || null;
} else if ((v = vwXmlAttr(attrs, "indexed")) !== null) {
hex = palette[+v] || (+v === 64 ? "000000" : +v === 65 ? "FFFFFF" : null);
}
if (!hex) return null;
var tint = parseFloat(vwXmlAttr(attrs, "tint"));
return tint ? vwTint(hex, tint) : hex;
}
function vwXlTheme(xml) {
var scheme = vwXmlFirst(xml, "clrScheme");
if (!scheme) return VW_XL_THEME;
return VW_XL_SCHEME.map(function (name, i) {
var part = vwXmlFirst(scheme[1], name), m = null;
if (part) {
m = /<(?:[\w.-]+:)?srgbClr\b[^>]*?\bval\s*=\s*["']([0-9A-Fa-f]{6})["']/.exec(part[1]) ||
/<(?:[\w.-]+:)?sysClr\b[^>]*?\blastClr\s*=\s*["']([0-9A-Fa-f]{6})["']/.exec(part[1]);
}
return m ? m[1].toUpperCase() : VW_XL_THEME[i];
});
}
function vwXlFill(xml, theme, palette) {
var gradient = vwXmlFirst(xml, "gradientFill");
if (gradient) {
var stops = [];
vwXmlAll(gradient[1], "stop").forEach(function (stop) {
var colour = vwXmlFirst(stop[1], "color");
var hex = colour && vwXlColour(colour[0], theme, palette);
if (hex) stops.push(vwRgb(hex));
});
if (!stops.length) return null;
return vwHex([0, 1, 2].map(function (i) {
return stops.reduce(function (sum, c) { return sum + c[i]; }, 0) / stops.length;
}));
}
var pattern = vwXmlFirst(xml, "patternFill");
var share = pattern ? VW_XL_PATTERN[vwXmlAttr(pattern[0], "patternType") || "none"] : 0;
if (!share) return null;
var fg = vwXmlFirst(pattern[1], "fgColor"), bg = vwXmlFirst(pattern[1], "bgColor");
var front = (fg && vwXlColour(fg[0], theme, palette)) || "000000";
if (share === 1) return front;
return vwBlend((bg && vwXlColour(bg[0], theme, palette)) || "FFFFFF", front, share);
}
var VW_PT = 4 / 3;
var VW_CELL_PAD = 3;
var VW_INDENT_PX = 9;
var VW_SPARE_COLUMNS = 64;
var VW_NORMAL_FONT = "Calibri";
var VW_NORMAL_PT = 11;
function vwMaxDigit(pt) {
return pt <= 11 ? 7 : Math.round(7 * pt / 11);
}
function vwColumnPx(width, digit) {
return Math.floor(((256 * width + Math.floor(128 / digit)) / 256) * digit);
}
function vwBaseColumnPx(base, digit) {
return Math.ceil((base * digit + 5) / 8) * 8;
}
function vwRowPx(pt) {
return Math.round(pt * VW_PT);
}
function vwNormalRowPx(name, pt) {
var narrow = VW_FONT_NARROW.test(String(name || "").toLowerCase());
return vwRowPx(Math.round((narrow ? pt * 1.22 + 1.5 : pt * 1.15 + 1.25) / 0.75) * 0.75);
}
var VW_FONT_NARROW = /^(calibri|calibri light|aptos narrow|arial narrow|carlito|liberation sans narrow|roboto condensed|helvetica condensed|helvetica neue condensed|tw cen mt condensed|gill sans mt condensed|franklin gothic (book|medium) cond)$/;
var VW_FONT_SERIF = /^(times|times new roman|cambria|georgia|garamond|book antiqua|palatino|palatino linotype|constantia|century|century schoolbook|bookman old style|liberation serif|dejavu serif|noto serif|baskerville|baskerville old face|bodoni mt|didot|caladea|tinos|sylfaen|ms mincho|ms pmincho|simsun|nsimsun|batang)$/;
var VW_FONT_MONO = /^(courier|courier new|consolas|lucida console|lucida sans typewriter|menlo|monaco|source code pro|dejavu sans mono|liberation mono|cousine|andale mono|fixedsys|terminal|ocr a extended|noto mono|roboto mono|cascadia code|cascadia mono)$/;
function vwFontStack(name) {
var clean = String(name || "").replace(/[^\w \-. -￿]/g, "").replace(/\s+/g, " ").trim();
if (!clean) return null;
var key = clean.toLowerCase();
return '"' + clean + '", ' + (VW_FONT_NARROW.test(key)
? 'sans-serif-condensed, "Roboto Condensed", "Arial Narrow", sans-serif'
: VW_FONT_SERIF.test(key) ? "serif" : VW_FONT_MONO.test(key) ? "monospace" : "sans-serif");
}
function vwNormal(name, pt) {
if (!(pt > 0)) pt = VW_NORMAL_PT;
name = name || VW_NORMAL_FONT;
return {
name: name, stack: vwFontStack(name) || vwFontStack(VW_NORMAL_FONT), pt: pt,
px: Math.round(pt * VW_PT * 100) / 100, digit: vwMaxDigit(pt), row: vwNormalRowPx(name, pt)
};
}
var VW_CURRENCY_FORMATS = {
5: "$#,##0_);($#,##0)", 6: "$#,##0_);[Red]($#,##0)", 7: "$#,##0.00_);($#,##0.00)", 8: "$#,##0.00_);[Red]($#,##0.00)"
};
function vwNumberFormat(id, own) {
var code = own[id];
if (code === undefined) {
var table = XLSX.SSF && XLSX.SSF.get_table ? XLSX.SSF.get_table() : {};
code = table[id] !== undefined ? table[id] : VW_CURRENCY_FORMATS[id];
}
return code && code !== "General" ? code : null;
}
var VW_BORDER_LINES = {
thin: [1, "solid"], medium: [2, "solid"], thick: [3, "solid"], double: [3, "double"],
hair: [1, "dotted"], dotted: [1, "dotted"], dashed: [1, "dashed"], dashDot: [1, "dashed"],
dashDotDot: [1, "dotted"], mediumDashed: [2, "dashed"], mediumDashDot: [2, "dashed"],
mediumDashDotDot: [2, "dashed"], slantDashDot: [2, "dashed"]
};
function vwBorderLine(kind, colour) {
var line = VW_BORDER_LINES[kind];
return line ? { w: line[0], st: line[1], c: colour || null } : null;
}
function vwBorderWeight(e) {
return e ? e.w * 10 + (e.st === "double" ? 5 : e.st === "solid" ? 3 : e.st === "dashed" ? 2 : 1) : 0;
}
function vwHeavier(a, b) {
return vwBorderWeight(b) > vwBorderWeight(a) ? b : a;
}
function vwBorderKey(e) {
return e ? e.w + e.st + (e.c || "a") : "";
}
var VW_ALIGN = {
left: "left", center: "center", right: "right", fill: "left", justify: "justify",
centerContinuous: "center", distributed: "justify"
};
var VW_VALIGN = { top: "top", center: "middle", justify: "top", distributed: "middle" };
var VW_LOOK_FIELDS = ["fill", "ink", "b", "i", "u", "s", "font", "px", "h", "v", "wrap", "indent", "rot", "nf"];
function VwLooks() {
this.list = [null];
this.classes = [""];
this.byKey = {};
this.edges = {};
this.edgeCount = 0;
this.rules = [];
this.style = null;
}
VwLooks.prototype.add = function (look) {
if (look.ink === "000000") look.ink = null;
if (look.h === "general") look.h = null;
if (look.v === "bottom") look.v = null;
if (look.h === "justify" || look.h === "distributed") look.wrap = true;
var borders = look.borders;
if (borders && !borders.l && !borders.r && !borders.t && !borders.b) borders = look.borders = null;
var key = VW_LOOK_FIELDS.map(function (f) { return look[f] || ""; }).join("|") + "|" +
(borders ? [borders.l, borders.r, borders.t, borders.b].map(vwBorderKey).join(",") : "");
if (/^[|,]*$/.test(key)) return 0;
var n = this.byKey[key];
if (n !== undefined) return n;
n = this.byKey[key] = this.list.length;
this.list.push(look);
this.classes.push((look.fill ? "vw-f " : "") + "vw-l" + n);
this.rules.push(vwLookRules(n, look));
return n;
};
VwLooks.prototype.edge = function (right, bottom, left, top) {
if (!right && !bottom && !left && !top) return "";
var key = vwBorderKey(right) + "," + vwBorderKey(bottom) + "," + vwBorderKey(left) + "," + vwBorderKey(top);
if (key === ",,,") return "";
var n = this.edges[key];
if (n === undefined) {
n = this.edges[key] = ++this.edgeCount;
this.rules.push(vwEdgeRules(n, right, bottom, left, top));
}
return "vw-e" + n;
};
VwLooks.prototype.flush = function () {
if (!this.rules.length) return;
if (!this.style) {
this.style = document.createElement("style");
document.head.appendChild(this.style);
}
this.style.appendChild(document.createTextNode(this.rules.join("\n") + "\n"));
this.rules = [];
};
function vwLookRules(n, look) {
var rule = "#grid td.vw-l" + n;
var day = [], night = [];
var fill = look.fill, ink = look.ink;
var paper = fill || "FFFFFF";
var text = ink || (fill ? vwReadableOn(fill, "000000", "FFFFFF") : "000000");
if (fill) day.push("background-color: #" + fill);
if (text !== "000000") day.push("color: #" + text);
if (look.b) day.push("font-weight: 700");
if (look.i) day.push("font-style: italic");
if (look.u || look.s) {
day.push("text-decoration: " + (look.u ? "underline" : "") + (look.u && look.s ? " " : "") + (look.s ? "line-through" : ""));
if (look.u === 2) day.push("text-decoration-style: double");
}
if (look.font) day.push("font-family: " + look.font);
if (look.px) day.push("font-size: " + look.px + "px");
if (look.h) day.push("text-align: " + VW_ALIGN[look.h]);
if (look.v) day.push("vertical-align: " + VW_VALIGN[look.v]);
if (look.wrap) day.push("white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word");
if (look.indent) {
day.push((look.h === "right" ? "padding-right: " : "padding-left: ") + (VW_CELL_PAD + look.indent * VW_INDENT_PX) + "px");
}
var out = rule + " { " + day.join("; ") + " }";
if (fill || ink) {
var paperAtNight = fill ? vwSheetNight(fill) : VW_SHEET_NIGHT_GROUND;
var textAtNight = vwSheetNight(text);
if (vwContrast(textAtNight, paperAtNight) < Math.min(VW_SHEET_CONTRAST, vwContrast(text, paper))) {
textAtNight = vwReadableOn(paperAtNight, VW_SHEET_NIGHT_GROUND, VW_SHEET_NIGHT_INK);
}
if (fill) night.push("background-color: #" + paperAtNight);
night.push("color: #" + textAtNight);
out += "\n@media (prefers-color-scheme: dark) { " + rule + " { " + night.join("; ") + " } }";
}
return out;
}
function vwEdgeRules(n, right, bottom, left, top) {
var rule = "#grid td.vw-e" + n, day = [], night = [];
[["right", right], ["bottom", bottom], ["left", left], ["top", top]].forEach(function (side) {
var e = side[1];
if (!e) return;
var colour = e.c || "000000";
day.push("border-" + side[0] + ": " + e.w + "px " + e.st + " #" + colour);
night.push("border-" + side[0] + "-color: #" + vwSheetNight(colour));
});
return rule + " { " + day.join("; ") + " }\n@media (prefers-color-scheme: dark) { " + rule + " { " +
night.join("; ") + " } }";
}
function vwColumnOf(letters) {
var n = 0;
for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) & 0x1F);
return n - 1;
}
function VwSheet(normal) {
this.colLooks = [];
this.rowLooks = [];
this.cells = [];
this.cols = [];
this.rows = [];
this.width = vwBaseColumnPx(8, normal.digit);
this.height = normal.row;
this.frozen = { rows: 0, columns: 0 };
this.grid = true;
this.heads = true;
this.rtl = false;
this.tab = null;
this.widths = true;
this.rules = [];
this.tables = [];
}
VwSheet.prototype.tableAt = function (row, col) {
for (var k = 0; k < this.tables.length; k++) {
var g = this.tables[k].range;
if (row >= g.s.r && row <= g.e.r && col >= g.s.c && col <= g.e.c) return vwTableLook(this.tables[k], row, col);
}
return null;
};
VwSheet.prototype.at = function (row, col) {
var own = this.cells[row];
if (own !== undefined && own[col] !== undefined) return own[col];
var look = this.rowLooks[row];
return look !== undefined ? look : this.colLooks[col] || 0;
};
function vwPlainSheet(normal) {
var sheet = new VwSheet(normal);
sheet.widths = false;
return sheet;
}
var VW_SHEET_TAG = /<(?:[\w.-]+:)?(row|c)(?=[\s\/>])([^>]*)>/g;
var VW_ATTR_ROW = /\sr\s*=\s*["'](\d+)/;
var VW_ATTR_CELL = /\sr\s*=\s*["']([A-Za-z]+)(\d+)/;
var VW_ATTR_STYLE = /\ss\s*=\s*["'](\d+)/;
var VW_ATTR_ROW_STYLED = /\scustomFormat\s*=\s*["'](1|true)["']/;
var VW_ATTR_HEIGHT = /\sht\s*=\s*["']([\d.]+)/;
var VW_ATTR_CUSTOM_HEIGHT = /\scustomHeight\s*=\s*["'](1|true)["']/;
var VW_ATTR_HIDDEN = /\shidden\s*=\s*["'](1|true)["']/;
function vwXmlOn(attrs, name) {
return /^(1|true)$/i.test(vwXmlAttr(attrs, name) || "");
}
function vwXmlOff(attrs, name) {
return /^(0|false)$/i.test(vwXmlAttr(attrs, name) || "");
}
function vwXlsxSheet(xml, lookOf, lastColumn, normal, theme, palette, dxfs) {
var sheet = new VwSheet(normal);
var data = /<(?:[\w.-]+:)?sheetData(?=[\s\/>])/.exec(xml);
var head = data ? xml.slice(0, data.index) : xml;
var cap = lastColumn + 1 + VW_SPARE_COLUMNS;
var pr = vwXmlFirst(head, "sheetPr");
var tab = pr && vwXmlFirst(pr[1], "tabColor");
if (tab) sheet.tab = vwXlColour(tab[0], theme, palette);
var view = vwXmlFirst(head, "sheetView");
if (view) {
sheet.grid = !vwXmlOff(view[0], "showGridLines");
sheet.heads = !vwXmlOff(view[0], "showRowColHeaders");
sheet.rtl = vwXmlOn(view[0], "rightToLeft");
var pane = vwXmlFirst(view[1], "pane");
if (pane && /^frozen/.test(vwXmlAttr(pane[0], "state") || "")) {
sheet.frozen.columns = Math.max(0, Math.floor(+vwXmlAttr(pane[0], "xSplit") || 0));
sheet.frozen.rows = Math.max(0, Math.floor(+vwXmlAttr(pane[0], "ySplit") || 0));
}
}
var format = vwXmlFirst(head, "sheetFormatPr");
if (format) {
var height = parseFloat(vwXmlAttr(format[0], "defaultRowHeight"));
var width = parseFloat(vwXmlAttr(format[0], "defaultColWidth"));
var base = parseFloat(vwXmlAttr(format[0], "baseColWidth"));
if (height > 0) sheet.height = vwRowPx(height);
if (width > 0) sheet.width = vwColumnPx(width, normal.digit);
else if (base > 0) sheet.width = vwBaseColumnPx(base, normal.digit);
}
vwXmlAll(head, "col").forEach(function (col) {
var a = col[0];
var min = +vwXmlAttr(a, "min") || 1, max = Math.min(+vwXmlAttr(a, "max") || min, cap);
var w = parseFloat(vwXmlAttr(a, "width"));
var hidden = vwXmlOn(a, "hidden") || w === 0;
var info = w > 0 || hidden ? { w: w > 0 ? vwColumnPx(w, normal.digit) : 0, hidden: hidden } : null;
var look = lookOf(+vwXmlAttr(a, "style") || 0);
for (var c = min - 1; c < max; c++) {
if (info) sheet.cols[c] = info;
if (look) sheet.colLooks[c] = look;
}
});
if (!data) return sheet;
var close = /<\/(?:[\w.-]+:)?sheetData\s*>/g;
close.lastIndex = data.index;
var end = close.exec(xml) ? close.lastIndex : xml.length;
try {
sheet.rules = vwXlsxRules(xml.slice(end), dxfs || [], theme, palette);
} catch (e) {
sheet.rules = [];
}
var tag = VW_SHEET_TAG, r = -1, c = -1, rowLook = 0, m, v;
var colLooks = sheet.colLooks, cells = sheet.cells;
tag.lastIndex = data.index;
while ((m = tag.exec(xml)) && m.index < end) {
var attrs = m[2];
if (m[1] === "row") {
v = VW_ATTR_ROW.exec(attrs);
r = v ? +v[1] - 1 : r + 1;
c = -1;
rowLook = 0;
if (VW_ATTR_ROW_STYLED.test(attrs)) {
v = VW_ATTR_STYLE.exec(attrs);
rowLook = v ? lookOf(+v[1]) : 0;
sheet.rowLooks[r] = rowLook;
}
v = VW_ATTR_HEIGHT.exec(attrs);
var hidden = VW_ATTR_HIDDEN.test(attrs) || (!!v && +v[1] === 0);
if (v || hidden) {
sheet.rows[r] = { h: v ? vwRowPx(+v[1]) : sheet.height, custom: VW_ATTR_CUSTOM_HEIGHT.test(attrs), hidden: hidden };
}
} else {
v = VW_ATTR_CELL.exec(attrs);
if (v) {
c = vwColumnOf(v[1].toUpperCase());
r = +v[2] - 1;
} else {
c++;
}
v = VW_ATTR_STYLE.exec(attrs);
var look = v ? lookOf(+v[1]) : 0;
if (look || rowLook || colLooks[c]) (cells[r] || (cells[r] = []))[c] = look;
}
}
tag.lastIndex = 0;
return sheet;
}
function vwXlsxFont(xml, theme, palette) {
var colour = vwXmlFirst(xml, "color"), u = vwXmlFirst(xml, "u"), sz = vwXmlFirst(xml, "sz");
var name = vwXmlFirst(xml, "name") || vwXmlFirst(xml, "rFont");
var underline = u ? vwXmlAttr(u[0], "val") || "single" : "none";
return {
ink: colour ? vwXlColour(colour[0], theme, palette) : null,
b: vwXmlFlag(xml, "b"),
i: vwXmlFlag(xml, "i"),
u: underline === "none" ? 0 : /^double/.test(underline) ? 2 : 1,
s: vwXmlFlag(xml, "strike"),
pt: sz ? parseFloat(vwXmlAttr(sz[0], "val")) || 0 : 0,
name: name ? vwXmlAttr(name[0], "val") : null
};
}
function vwXlsxBorder(xml, theme, palette) {
function side(names) {
for (var k = 0; k < names.length; k++) {
var el = vwXmlFirst(xml, names[k]);
if (!el) continue;
var colour = vwXmlFirst(el[1], "color");
return vwBorderLine(vwXmlAttr(el[0], "style"), colour && !vwXmlOn(colour[0], "auto") ? vwXlColour(colour[0], theme, palette) : null);
}
return null;
}
return { l: side(["left", "start"]), r: side(["right", "end"]), t: side(["top"]), b: side(["bottom"]) };
}
function vwInnerLine(el, theme, palette) {
var colour = vwXmlFirst(el[1], "color");
return vwBorderLine(vwXmlAttr(el[0], "style"), colour && !vwXmlOn(colour[0], "auto") ? vwXlColour(colour[0], theme, palette) : null);
}
function vwXlsxLook(xf, fonts, fills, borders, normal, formats) {
var a = xf[0];
var font = fonts[+vwXmlAttr(a, "fontId") || 0] || {};
var align = vwXmlFirst(xf[1], "alignment");
var al = align ? align[0] : "";
var rot = +vwXmlAttr(al, "textRotation") || 0;
return {
fill: fills[+vwXmlAttr(a, "fillId") || 0] || null,
ink: font.ink === normal.ink ? null : font.ink,
b: font.b, i: font.i, u: font.u, s: font.s,
font: font.name && font.name !== normal.name ? vwFontStack(font.name) : null,
px: font.pt && font.pt !== normal.pt ? Math.round(font.pt * VW_PT * 100) / 100 : null,
h: vwXmlAttr(al, "horizontal"),
v: vwXmlAttr(al, "vertical"),
wrap: vwXmlOn(al, "wrapText"),
indent: Math.min(15, Math.max(0, +vwXmlAttr(al, "indent") || 0)),
rot: rot > 90 && rot <= 180 ? 90 - rot : rot,
nf: vwNumberFormat(+vwXmlAttr(a, "numFmtId") || 0, formats),
borders: borders[+vwXmlAttr(a, "borderId") || 0] || null
};
}
function vwPartPath(from, target) {
if (target.charAt(0) === "/") return target.slice(1);
var path = (from.replace(/[^\/]*$/, "") + target).split("/"), out = [];
path.forEach(function (step) {
if (step === "..") out.pop();
else if (step !== ".") out.push(step);
});
return out.join("/");
}
function vwRelations(path, part) {
var folder = path.replace(/[^\/]*$/, "");
var rels = {};
vwXmlAll(vwXmlText(part(folder + "_rels/" + path.slice(folder.length) + ".rels")), "Relationship").forEach(function (rel) {
var target = vwXmlAttr(rel[0], "Target");
if (!target || vwXmlAttr(rel[0], "TargetMode") === "External") return;
rels[vwXmlAttr(rel[0], "Id")] = { path: vwPartPath(path, target), type: vwXmlAttr(rel[0], "Type") || "" };
});
return rels;
}
var VW_EMU = 9525;
var VW_PICTURES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp",
webp: "image/webp", svg: "image/svg+xml" };
function vwDrawnText(xml) {
return vwXmlAll(xml, "p").map(function (p) {
return vwXmlAll(p[1], "t").map(function (t) { return vwXmlUnescape(t[1]); }).join("");
}).join("\n").replace(/^\s+|\s+$/g, "");
}
function vwXmlUnescape(text) {
if (text.indexOf("&") < 0) return vwOwn(text);
function code(m, n) { return n <= 0x10FFFF ? String.fromCodePoint(n) : m; }
return vwOwn(text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
.replace(/&#x([0-9A-Fa-f]{1,8});/g, function (m, n) { return code(m, parseInt(n, 16)); })
.replace(/&#(\d{1,10});/g, function (m, n) { return code(m, +n); }).replace(/&amp;/g, "&"));
}
function vwXlsxArt(sheetPath, part) {
var art = [];
var rels = vwRelations(sheetPath, part);
Object.keys(rels).forEach(function (id) {
if (!/\/drawing$/.test(rels[id].type)) return;
var drawingPath = rels[id].path, xml = vwXmlText(part(drawingPath));
var drawn = vwRelations(drawingPath, part);
["twoCellAnchor", "oneCellAnchor", "absoluteAnchor"].forEach(function (kind) {
vwXmlAll(xml, kind).forEach(function (anchor) {
var item = vwXlsxAnchor(kind, anchor[1]);
if (!item) return;
var body = anchor[1];
var blip = /<(?:[\w.-]+:)?blip\b[^>]*?\s[\w.-]+:embed\s*=\s*["']([^"']+)["']/.exec(body);
var chart = /<(?:[\w.-]+:)?chart\b[^>]*?\s[\w.-]+:id\s*=\s*["']([^"']+)["']/.exec(body);
if (vwXmlFirst(body, "pic") && blip) {
var media = drawn[blip[1]];
var ext = media ? (/\.(\w+)$/.exec(media.path) || [])[1] : null;
var type = ext && VW_PICTURES[ext.toLowerCase()];
var bytes = media && type ? part(media.path) : null;
item.kind = bytes ? "picture" : "unshown";
if (bytes) {
item.bytes = bytes;
item.type = type;
}
var name = vwXmlFirst(body, "cNvPr");
item.title = name ? vwXmlAttr(name[0], "descr") || "" : "";
} else if (chart) {
item.kind = "chart";
var chartPart = drawn[chart[1]];
var title = chartPart ? vwXmlFirst(vwXmlText(part(chartPart.path)), "title") : null;
item.title = title ? vwDrawnText(title[1]) : "";
} else if (vwXmlFirst(body, "sp")) {
var text = vwXmlFirst(body, "txBody");
item.title = text ? vwDrawnText(text[1]) : "";
if (!item.title) return;
item.kind = "text";
} else {
return;
}
art.push(item);
});
});
});
return art;
}
function vwXlsxAnchor(kind, xml) {
function cellOf(name) {
var el = vwXmlFirst(xml, name);
if (!el) return null;
function n(tag) { var t = vwXmlFirst(el[1], tag); return t ? +t[1] || 0 : 0; }
return { c: n("col"), x: n("colOff") / VW_EMU, r: n("row"), y: n("rowOff") / VW_EMU };
}
var ext = vwXmlFirst(xml, "ext"), pos = vwXmlFirst(xml, "pos");
var size = ext ? { w: (+vwXmlAttr(ext[0], "cx") || 0) / VW_EMU, h: (+vwXmlAttr(ext[0], "cy") || 0) / VW_EMU } : null;
if (kind === "twoCellAnchor") {
var from = cellOf("from"), to = cellOf("to");
return from && to ? { from: from, to: to } : null;
}
if (kind === "oneCellAnchor") {
var start = cellOf("from");
return start && size ? { from: start, size: size } : null;
}
return pos && size ? { at: { x: (+vwXmlAttr(pos[0], "x") || 0) / VW_EMU, y: (+vwXmlAttr(pos[0], "y") || 0) / VW_EMU }, size: size } : null;
}
function vwXlsxDxf(xml, theme, palette) {
var out = {};
var font = vwXmlFirst(xml, "font");
if (font) {
var f = font[1], colour = vwXmlFirst(f, "color"), u = vwXmlFirst(f, "u");
if (colour) out.ink = vwXlColour(colour[0], theme, palette);
if (vwXmlFirst(f, "b")) out.b = vwXmlFlag(f, "b");
if (vwXmlFirst(f, "i")) out.i = vwXmlFlag(f, "i");
if (vwXmlFirst(f, "strike")) out.s = vwXmlFlag(f, "strike");
if (u) out.u = (vwXmlAttr(u[0], "val") || "single") === "none" ? 0 : /^double/.test(vwXmlAttr(u[0], "val") || "") ? 2 : 1;
}
var fill = vwXmlFirst(xml, "fill");
var pattern = fill && vwXmlFirst(fill[1], "patternFill");
if (pattern) {
var type = vwXmlAttr(pattern[0], "patternType");
var bg = vwXmlFirst(pattern[1], "bgColor"), fg = vwXmlFirst(pattern[1], "fgColor");
if (!type || type === "solid") {
var solid = (bg && vwXlColour(bg[0], theme, palette)) || (fg && vwXlColour(fg[0], theme, palette));
if (solid) out.fill = solid;
} else if (type !== "none") {
out.fill = vwXlFill(fill[1], theme, palette);
}
} else if (fill && vwXmlFirst(fill[1], "gradientFill")) {
out.fill = vwXlFill(fill[1], theme, palette);
}
return out;
}
function vwCfvo(el) {
return { type: vwXmlAttr(el[0], "type") || "min", val: vwXmlAttr(el[0], "val") || "" };
}
function vwXlsxRules(xml, dxfs, theme, palette) {
var rules = [], bars = null;
vwXmlAll(xml, "conditionalFormatting").forEach(function (cf) {
var ranges = [];
(vwXmlAttr(cf[0], "sqref") || "").split(/\s+/).forEach(function (ref) {
if (!/^\$?[A-Za-z]{1,3}\$?\d+(:\$?[A-Za-z]{1,3}\$?\d+)?$/.test(ref)) return;
ranges.push(XLSX.utils.decode_range(ref.replace(/\$/g, "").toUpperCase()));
});
if (!ranges.length) return;
vwXmlAll(cf[1], "cfRule").forEach(function (rule) {
var a = rule[0], body = rule[1];
var dxf = vwXmlAttr(a, "dxfId");
var r = {
ranges: ranges, type: vwXmlAttr(a, "type") || "", priority: +vwXmlAttr(a, "priority") || 0,
operator: vwXmlAttr(a, "operator") || "", stop: vwXmlOn(a, "stopIfTrue"),
look: dxf !== null && dxfs[+dxf] ? dxfs[+dxf] : null,
rank: +vwXmlAttr(a, "rank") || 10, percent: vwXmlOn(a, "percent"), bottom: vwXmlOn(a, "bottom"),
above: !vwXmlOff(a, "aboveAverage"), equal: vwXmlOn(a, "equalAverage"), deviations: +vwXmlAttr(a, "stdDev") || 0,
text: vwXmlAttr(a, "text") || "",
formulas: vwXmlAll(body, "formula").map(function (f) { return vwXmlUnescape(f[1]); })
};
var scale = vwXmlFirst(body, "colorScale"), bar = vwXmlFirst(body, "dataBar");
if (scale) {
r.cfvos = vwXmlAll(scale[1], "cfvo").map(vwCfvo);
r.colours = vwXmlAll(scale[1], "color").map(function (c) { return vwXlColour(c[0], theme, palette); });
} else if (bar) {
r.cfvos = vwXmlAll(bar[1], "cfvo").map(vwCfvo);
var colour = vwXmlFirst(bar[1], "color");
r.colours = [colour ? vwXlColour(colour[0], theme, palette) : "638EC6"];
r.lengths = [10, 90];
var id = vwXmlFirst(body, "id");
var newer = id && (bars = bars || vwXlsxBars(xml))[id[1].replace(/\s+/g, "").toUpperCase()];
if (newer) {
r.lengths = newer.lengths;
if (newer.cfvos.length >= 2) r.cfvos = newer.cfvos;
}
}
rules.push(r);
});
});
return rules.sort(function (x, y) { return x.priority - y.priority; });
}
function vwXlsxBars(xml) {
var bars = {};
vwXmlAll(xml, "cfRule").forEach(function (rule) {
var id = vwXmlAttr(rule[0], "id"), bar = vwXmlFirst(rule[1], "dataBar");
if (!id || !bar || vwXmlAttr(rule[0], "type") !== "dataBar") return;
var least = parseFloat(vwXmlAttr(bar[0], "minLength")), most = parseFloat(vwXmlAttr(bar[0], "maxLength"));
bars[id.replace(/\s+/g, "").toUpperCase()] = {
lengths: [isNaN(least) ? 10 : least, isNaN(most) ? 90 : most],
cfvos: vwXmlAll(bar[1], "cfvo").map(function (el) {
var f = vwXmlFirst(el[1], "f");
return { type: vwXmlAttr(el[0], "type") || "autoMin", val: f ? vwXmlUnescape(f[1]) : vwXmlAttr(el[0], "val") || "" };
})
};
});
return bars;
}
function vwTableColour(colour, theme, accent) {
if (colour === null || colour === undefined) return null;
if (typeof colour === "string") return colour;
var index = colour[0] === "A" ? accent : colour[0];
var hex = theme[index];
return hex && colour[1] ? vwTint(hex, colour[1]) : hex || null;
}
function vwTableElement(element, theme, accent) {
var out = {};
if (element.fill) out.fill = vwTableColour(element.fill, theme, accent);
if (element.ink) out.ink = vwTableColour(element.ink, theme, accent);
if (element.bold) out.b = true;
if (element.italic) out.i = true;
["l", "r", "t", "b", "h", "v"].forEach(function (side) {
if (element[side]) out["line" + side] = vwBorderLine(element[side][0], vwTableColour(element[side][1], theme, accent));
});
if (element.size) out.size = element.size;
return out;
}
function vwBuiltinTable(name, theme) {
if (typeof VW_TABLE_STYLES === "undefined") return null;
var m = /^TableStyle(Light|Medium|Dark)(\d+)$/.exec(name || "");
if (!m) return null;
var family = m[1], n = +m[2], firsts = family === "Light" ? [1, 8, 15] : family === "Medium" ? [1, 8, 15, 22] : [1];
var raw = VW_TABLE_STYLES[family + n], accent = 4;
if (!raw) {
for (var k = firsts.length - 1; k >= 0; k--) {
if (n > firsts[k]) {
raw = VW_TABLE_STYLES[family + (firsts[k] + 1) + "-" + (firsts[k] + 6)];
accent = 4 + n - firsts[k] - 1;
break;
}
}
}
if (!raw) return null;
var out = {};
Object.keys(raw).forEach(function (element) { out[element] = vwTableElement(raw[element], theme, accent); });
return out;
}
function vwXlsxTables(sheetPath, part, theme, custom) {
var tables = [], rels = vwRelations(sheetPath, part);
Object.keys(rels).forEach(function (id) {
if (!/\/table$/.test(rels[id].type)) return;
var xml = vwXmlText(part(rels[id].path));
var table = vwXmlFirst(xml, "table");
var ref = table && vwXmlAttr(table[0], "ref");
if (!ref || !/^[A-Za-z]{1,3}\d+:[A-Za-z]{1,3}\d+$/.test(ref)) return;
var info = vwXmlFirst(table[1], "tableStyleInfo");
var name = info ? vwXmlAttr(info[0], "name") : null;
var elements = (name && custom[name]) || vwBuiltinTable(name, theme);
if (!elements) return;
var header = vwXmlAttr(table[0], "headerRowCount");
tables.push({
part: rels[id].path,
range: XLSX.utils.decode_range(ref.toUpperCase()),
header: header === null ? 1 : +header || 0,
totals: +vwXmlAttr(table[0], "totalsRowCount") || 0,
rowStripes: !info || !vwXmlOff(info[0], "showRowStripes"),
columnStripes: !!info && vwXmlOn(info[0], "showColumnStripes"),
firstColumn: !!info && vwXmlOn(info[0], "showFirstColumn"),
lastColumn: !!info && vwXmlOn(info[0], "showLastColumn"),
elements: elements,
made: {}
});
});
return tables;
}
function vwTableLook(table, r, c) {
var g = table.range;
var top = g.s.r, bottom = g.e.r, first = g.s.c, last = g.e.c;
var bodyTop = top + table.header, bodyBottom = bottom - table.totals;
var inHeader = r < bodyTop, inTotal = r > bodyBottom, inBody = !inHeader && !inTotal;
var parts = [];
function cover(name, r0, r1, c0, c1) {
var element = table.elements[name];
if (element && r >= r0 && r <= r1 && c >= c0 && c <= c1) parts.push([name, element, r0, r1, c0, c1]);
}
var el = table.elements;
cover("wholeTable", top, bottom, first, last);
if (table.columnStripes && inBody) {
var cs = (el.firstColumnStripe && el.firstColumnStripe.size) || 1, cs2 = (el.secondColumnStripe && el.secondColumnStripe.size) || 1;
var cBand = (c - first) % (cs + cs2), cFrom = c - cBand;
if (cBand < cs) cover("firstColumnStripe", bodyTop, bodyBottom, cFrom, cFrom + cs - 1);
else cover("secondColumnStripe", bodyTop, bodyBottom, cFrom + cs, cFrom + cs + cs2 - 1);
}
if (table.rowStripes && inBody) {
var rs = (el.firstRowStripe && el.firstRowStripe.size) || 1, rs2 = (el.secondRowStripe && el.secondRowStripe.size) || 1;
var rBand = (r - bodyTop) % (rs + rs2), rFrom = r - rBand;
if (rBand < rs) cover("firstRowStripe", rFrom, rFrom + rs - 1, first, last);
else cover("secondRowStripe", rFrom + rs, rFrom + rs + rs2 - 1, first, last);
}
if (table.lastColumn) cover("lastColumn", top, bottom, last, last);
if (table.firstColumn) cover("firstColumn", top, bottom, first, first);
if (table.header) cover("headerRow", top, bodyTop - 1, first, last);
if (table.totals) cover("totalRow", bodyBottom + 1, bottom, first, last);
if (table.header && table.firstColumn) cover("firstHeaderCell", top, top, first, first);
if (table.header && table.lastColumn) cover("lastHeaderCell", top, top, last, last);
if (table.totals && table.firstColumn) cover("firstTotalCell", bottom, bottom, first, first);
if (table.totals && table.lastColumn) cover("lastTotalCell", bottom, bottom, last, last);
if (!parts.length) return null;
var key = parts.map(function (p) {
return p[0] + (r === p[2] ? "t" : "") + (r === p[3] ? "b" : "") + (c === p[4] ? "l" : "") + (c === p[5] ? "r" : "");
}).join(",");
if (table.made[key]) return table.made[key];
var look = { borders: { l: null, r: null, t: null, b: null } };
parts.forEach(function (p) {
var e = p[1];
["fill", "ink", "b", "i"].forEach(function (field) { if (e[field] !== undefined) look[field] = e[field]; });
var sides = { l: c === p[4] ? e.linel : e.linev, r: c === p[5] ? e.liner : e.linev,
t: r === p[2] ? e.linet : e.lineh, b: r === p[3] ? e.lineb : e.lineh };
for (var side in sides) if (sides[side]) look.borders[side] = sides[side];
});
look.key = table.part + "|" + key;
return (table.made[key] = look);
}
function vwXlsxStyles(wb, looks) {
var dir = wb.Directory, files = wb.files;
if (!files || !dir || !dir.workbooks || !dir.workbooks.length) return null;
var byPath = {};
Object.keys(files).forEach(function (key) { byPath[key.toLowerCase()] = files[key]; });
function part(path) {
var file = byPath[path.replace(/^\//, "").toLowerCase()];
return file ? file.content : null;
}
var theme = dir.themes && dir.themes.length ? vwXlTheme(vwXmlText(part(dir.themes[0]))) : VW_XL_THEME;
var xml = dir.style && /\.xml$/i.test(dir.style) ? vwXmlText(part(dir.style)) : "";
var palette = VW_XL_PALETTE;
var custom = vwXmlFirst(xml, "indexedColors");
if (custom) {
palette = VW_XL_PALETTE.slice();
vwXmlAll(custom[1], "rgbColor").forEach(function (colour, i) {
var hex = i < 64 && vwXlColour(colour[0], theme, VW_XL_PALETTE);
if (hex) palette[i] = hex;
});
}
var fontsXml = vwXmlFirst(xml, "fonts"), fillsXml = vwXmlFirst(xml, "fills");
var bordersXml = vwXmlFirst(xml, "borders"), xfsXml = vwXmlFirst(xml, "cellXfs");
var fonts = vwXmlAll(fontsXml ? fontsXml[1] : "", "font").map(function (font) {
return vwXlsxFont(font[1], theme, palette);
});
var fills = vwXmlAll(fillsXml ? fillsXml[1] : "", "fill").map(function (fill) {
return vwXlFill(fill[1], theme, palette);
});
var borders = vwXmlAll(bordersXml ? bordersXml[1] : "", "border").map(function (border) {
return vwXlsxBorder(border[1], theme, palette);
});
var xfs = vwXmlAll(xfsXml ? xfsXml[1] : "", "xf");
var dxfsXml = vwXmlFirst(xml, "dxfs");
var dxfs = vwXmlAll(dxfsXml ? dxfsXml[1] : "", "dxf").map(function (dxf) { return vwXlsxDxf(dxf[1], theme, palette); });
var formatsXml = vwXmlFirst(xml, "numFmts"), formats = {};
vwXmlAll(formatsXml ? formatsXml[1] : "", "numFmt").forEach(function (format) {
formats[+vwXmlAttr(format[0], "numFmtId")] = vwXmlAttr(format[0], "formatCode") || "";
});
var first = fonts[xfs.length ? +vwXmlAttr(xfs[0][0], "fontId") || 0 : 0] || {};
var normal = vwNormal(first.name, first.pt);
normal.ink = first.ink || null;
var xfLooks = xfs.map(function (xf) { return looks.add(vwXlsxLook(xf, fonts, fills, borders, normal, formats)); });
var customTables = {}, dxfList = null;
vwXmlAll(xml, "tableStyle").forEach(function (style) {
var name = vwXmlAttr(style[0], "name"), elements = {};
vwXmlAll(style[1], "tableStyleElement").forEach(function (element) {
dxfList = dxfList || (dxfsXml ? vwXmlAll(dxfsXml[1], "dxf") : []);
var dxf = dxfList[+vwXmlAttr(element[0], "dxfId")];
if (!dxf) return;
var look = vwXlsxDxf(dxf[1], theme, palette), border = vwXlsxBorder(dxf[1], theme, palette);
var e = {};
if (look.fill) e.fill = look.fill;
if (look.ink) e.ink = look.ink;
if (look.b) e.b = true;
if (look.i) e.i = true;
["l", "r", "t", "b"].forEach(function (side) { if (border[side]) e["line" + side] = border[side]; });
var inside = vwXmlFirst(dxf[1], "border");
if (inside) {
var h = vwXmlFirst(inside[1], "horizontal"), v = vwXmlFirst(inside[1], "vertical");
if (h) e.lineh = vwInnerLine(h, theme, palette);
if (v) e.linev = vwInnerLine(v, theme, palette);
}
var size = vwXmlAttr(element[0], "size");
if (size) e.size = +size;
elements[vwXmlAttr(element[0], "type")] = e;
});
if (name) customTables[name] = elements;
});
function lookOf(n) { return xfLooks[n] || 0; }
var book = dir.workbooks[0].replace(/^\//, "");
var folder = book.replace(/[^\/]*$/, "");
var targets = {};
vwXmlAll(vwXmlText(part(folder + "_rels/" + book.slice(folder.length) + ".rels")), "Relationship")
.forEach(function (rel) { targets[vwXmlAttr(rel[0], "Id")] = vwXmlAttr(rel[0], "Target"); });
var list = vwXmlFirst(vwXmlText(part(book)), "sheets");
var paths = vwXmlAll(list ? list[1] : "", "sheet").map(function (sheet) {
var id = /\s[\w.-]+:id\s*=\s*["']([^"']*)["']/.exec(sheet[0]);
var target = id && targets[id[1]];
if (!target) return null;
if (target.charAt(0) === "/") return target.slice(1);
var path = (folder + target).split("/"), out = [];
path.forEach(function (step) {
if (step === "..") out.pop();
else if (step !== ".") out.push(step);
});
return out.join("/");
});
var sheetParts = paths.map(function (path) { return path ? part(path) : null; });
var arts = paths.map(function (path) {
try {
return path ? vwXlsxArt(path, part) : [];
} catch (e) {
return [];
}
});
var tableLists = paths.map(function (path) {
try {
return path ? vwXlsxTables(path, part, theme, customTables) : [];
} catch (e) {
return [];
}
});
byPath = files = null;
var view = wb.Workbook && wb.Workbook.WBView && wb.Workbook.WBView[0];
return {
normal: normal,
active: view && view.activeTab !== undefined ? +view.activeTab : null,
arts: arts,
sheets: wb.SheetNames.map(function (name, i) {
var bytes = sheetParts[i];
sheetParts[i] = null;
if (!bytes) return null;
var ref = wb.Sheets[name] && wb.Sheets[name]["!ref"];
var lastColumn = ref ? XLSX.utils.decode_range(ref).e.c : -1;
var sheet;
return function () {
if (sheet === undefined) {
sheet = vwXlsxSheet(vwXmlText(bytes), lookOf, lastColumn, normal, theme, palette, dxfs);
sheet.tables = tableLists[i] || [];
bytes = null;
}
return sheet;
};
})
};
}
var VW_XLS_PATTERNS = ["none", "solid", "mediumGray", "darkGray", "lightGray", "darkHorizontal",
"darkVertical", "darkDown", "darkUp", "darkGrid", "darkTrellis", "lightHorizontal", "lightVertical",
"lightDown", "lightUp", "lightGrid", "lightTrellis", "gray125", "gray0625"];
var VW_XLS_LINES = ["none", "thin", "medium", "dashed", "dotted", "thick", "double", "hair",
"mediumDashed", "dashDot", "mediumDashDot", "dashDotDot", "mediumDashDotDot", "slantDashDot"];
var VW_XLS_ALIGN = ["general", "left", "center", "right", "fill", "justify", "centerContinuous", "distributed"];
var VW_XLS_VALIGN = ["top", "center", "bottom", "justify", "distributed"];
var VW_XLS_BOF = 0x0809, VW_XLS_EOF = 0x000A, VW_XLS_FILEPASS = 0x002F, VW_XLS_FONT = 0x0031,
VW_XLS_XF = 0x00E0, VW_XLS_PALETTE = 0x0092, VW_XLS_BOUNDSHEET = 0x0085, VW_XLS_ROW = 0x0208,
VW_XLS_COLINFO = 0x007D, VW_XLS_MULRK = 0x00BD, VW_XLS_MULBLANK = 0x00BE, VW_XLS_WINDOW1 = 0x003D,
VW_XLS_WINDOW2 = 0x023E, VW_XLS_PANE = 0x0041, VW_XLS_DEFCOLWIDTH = 0x0055,
VW_XLS_STANDARDWIDTH = 0x0099, VW_XLS_DEFAULTROWHEIGHT = 0x0225, VW_XLS_SHEETEXT = 0x0862,
VW_XLS_FORMAT = 0x041E;
var VW_XLS_CELLS = { 0x0006: 1, 0x00D6: 1, 0x00FD: 1, 0x0201: 1, 0x0203: 1, 0x0204: 1, 0x0205: 1, 0x027E: 1 };
function vwXlsStyles(wb, looks) {
var cfb = wb.cfb && wb.cfb.FullPaths ? wb.cfb : null;
var stream = cfb && (XLSX.CFB.find(cfb, "/Workbook") || XLSX.CFB.find(cfb, "/Book"));
var b = stream && stream.content;
if (!b || b.length < 8) return null;
if (!(b instanceof Uint8Array)) b = new Uint8Array(b);
function u16(at) { return b[at] | b[at + 1] << 8; }
function u32(at) { return u16(at) + u16(at + 2) * 0x10000; }
if (u16(0) !== VW_XLS_BOF || u16(4) !== 0x0600) return null;
var fonts = [], xfs = [], sheets = [], palette = VW_XL_PALETTE.slice(), activeTab = 0, formats = {};
for (var at = 0; at + 4 <= b.length;) {
var type = u16(at), d = at + 4, size = u16(at + 2);
at = d + size;
if (type === VW_XLS_FILEPASS) return null;
if (type === VW_XLS_EOF) break;
if (type === VW_XLS_FONT) {
var options = u16(d + 2), icv = u16(d + 4), cch = b[d + 14], wide = b[d + 15] & 1, name = "";
for (var k = 0; k < cch && d + 16 + (k + 1) * (wide ? 2 : 1) <= at; k++) {
name += String.fromCharCode(wide ? u16(d + 16 + k * 2) : b[d + 16 + k]);
}
fonts.push({
ink: icv < 64 ? icv : null, b: u16(d + 6) >= 700, i: !!(options & 2), s: !!(options & 8),
u: b[d + 10] === 2 || b[d + 10] === 0x22 ? 2 : b[d + 10] ? 1 : 0, pt: u16(d) / 20, name: name
});
} else if (type === VW_XLS_XF) {
xfs.push({
font: u16(d), format: u16(d + 2), align: u16(d + 6), indent: u16(d + 8), lines: u32(d + 10),
more: u32(d + 14), area: u16(d + 18)
});
} else if (type === VW_XLS_FORMAT && size >= 5) {
var count = u16(d + 2), high = b[d + 4] & 1, code = "";
for (var q = 0; q < count && d + 5 + (q + 1) * (high ? 2 : 1) <= at; q++) {
code += String.fromCharCode(high ? u16(d + 5 + q * 2) : b[d + 5 + q]);
}
formats[u16(d)] = code;
} else if (type === VW_XLS_PALETTE) {
for (var p = 0; p < u16(d) && 8 + p < 64; p++) palette[8 + p] = vwHex([b[d + 2 + p * 4], b[d + 3 + p * 4], b[d + 4 + p * 4]]);
} else if (type === VW_XLS_BOUNDSHEET) {
sheets.push(u32(d));
} else if (type === VW_XLS_WINDOW1 && size >= 12) {
activeTab = u16(d + 10);
}
}
function colour(icv, auto) {
return icv < 64 ? palette[icv] : icv === 64 ? "000000" : icv === 65 ? "FFFFFF" : auto;
}
function fontOf(n) { return fonts[n < 4 ? n : n - 1] || {}; }
var first = fontOf(0);
var normal = vwNormal(first.name, first.pt);
var xfLooks = xfs.map(function (xf) {
var font = fontOf(xf.font);
var share = VW_XL_PATTERN[VW_XLS_PATTERNS[xf.more >>> 26]] || 0, fill = null;
if (share) {
var front = colour(xf.area & 0x7F, "000000");
fill = share === 1 ? front : vwBlend(colour(xf.area >> 7 & 0x7F, "FFFFFF"), front, share);
}
function line(kind, icv) { return vwBorderLine(VW_XLS_LINES[kind], icv === 64 || icv > 65 ? null : colour(icv, null)); }
var lines = xf.lines, more = xf.more, rot = xf.align >> 8 & 0xFF;
return looks.add({
fill: fill,
ink: font.ink === null || font.ink === first.ink ? null : colour(font.ink, null),
b: font.b, i: font.i, u: font.u, s: font.s,
font: font.name && font.name !== normal.name ? vwFontStack(font.name) : null,
px: font.pt && font.pt !== normal.pt ? Math.round(font.pt * VW_PT * 100) / 100 : null,
h: VW_XLS_ALIGN[xf.align & 7],
v: VW_XLS_VALIGN[xf.align >> 4 & 7] || null,
wrap: !!(xf.align & 8),
indent: xf.indent & 0xF,
rot: rot > 90 && rot <= 180 ? 90 - rot : rot,
nf: vwNumberFormat(xf.format, formats),
borders: {
l: line(lines & 0xF, lines >> 16 & 0x7F), r: line(lines >> 4 & 0xF, lines >> 23 & 0x7F),
t: line(lines >> 8 & 0xF, more & 0x7F), b: line(lines >> 12 & 0xF, more >> 7 & 0x7F)
}
});
});
var listed = sheets.slice();
sheets.sort(function (x, y) { return x - y; });
if (sheets.length !== wb.SheetNames.length) return null;
return {
normal: normal,
active: listed[activeTab] !== undefined ? sheets.indexOf(listed[activeTab]) : null,
sheets: wb.SheetNames.map(function (name, i) {
var start = sheets[i];
if (u16(start) !== VW_XLS_BOF || u16(start + 6) !== 0x0010) return null;
var ref = wb.Sheets[name] && wb.Sheets[name]["!ref"];
var lastColumn = ref ? XLSX.utils.decode_range(ref).e.c : -1;
var sheet;
return function () {
if (sheet === undefined) sheet = vwXlsSheet(b, start, u16, u32, xfLooks, lastColumn, normal, palette);
return sheet;
};
})
};
}
function vwXlsSheet(b, start, u16, u32, xfLooks, lastColumn, normal, palette) {
var sheet = new VwSheet(normal);
var at, type, d, c, n, i, frozen = false, split = null, defaultWidth = 0, depth;
var cap = lastColumn + 1 + VW_SPARE_COLUMNS;
function lookOf(xf) { return xfLooks[xf] || 0; }
function ended() {
if (type === VW_XLS_BOF) depth++;
else if (type === VW_XLS_EOF) depth--;
return depth <= 0;
}
for (at = start, depth = 0; at + 4 <= b.length;) {
type = u16(at);
d = at + 4;
n = u16(at + 2);
at = d + n;
if (ended()) break;
if (depth > 1) continue;
if (type === VW_XLS_ROW) {
var row = u16(d), flags = u16(d + 12);
if (flags & 0x80) sheet.rowLooks[row] = lookOf(u16(d + 14) & 0xFFF);
var twips = u16(d + 6) & 0x7FFF, custom = !!(flags & 0x40);
sheet.rows[row] = { h: twips ? vwRowPx(twips / 20) : sheet.height, custom: custom, hidden: !!(flags & 0x20) || (!twips && custom) };
} else if (type === VW_XLS_COLINFO) {
var look = lookOf(u16(d + 6)), width = u16(d + 4), hidden = !!(u16(d + 8) & 1) || width === 0;
var info = { w: width ? vwColumnPx(width / 256, normal.digit) : 0, hidden: hidden };
for (c = u16(d); c <= Math.min(u16(d + 2), cap); c++) {
sheet.cols[c] = info;
if (look) sheet.colLooks[c] = look;
}
} else if (type === VW_XLS_DEFCOLWIDTH) {
if (!defaultWidth) sheet.width = vwBaseColumnPx(u16(d), normal.digit);
} else if (type === VW_XLS_STANDARDWIDTH) {
defaultWidth = u16(d);
if (defaultWidth) sheet.width = vwColumnPx(defaultWidth / 256, normal.digit);
} else if (type === VW_XLS_DEFAULTROWHEIGHT && n >= 4) {
if (u16(d + 2)) sheet.height = vwRowPx(u16(d + 2) / 20);
} else if (type === VW_XLS_WINDOW2) {
var view = u16(d);
sheet.grid = !!(view & 0x02);
sheet.heads = !!(view & 0x04);
frozen = !!(view & 0x08);
sheet.rtl = !!(view & 0x40);
} else if (type === VW_XLS_PANE) {
split = { columns: u16(d), rows: u16(d + 2) };
} else if (type === VW_XLS_SHEETEXT && n >= 20) {
var icv = u32(d + 16) & 0x7F;
if (icv < 64) sheet.tab = palette[icv];
}
}
if (frozen && split) sheet.frozen = split;
function cell(r, col, xf) {
var look = lookOf(xf);
if (look || sheet.rowLooks[r] || sheet.colLooks[col]) (sheet.cells[r] || (sheet.cells[r] = []))[col] = look;
}
for (at = start, depth = 0; at + 4 <= b.length;) {
type = u16(at);
d = at + 4;
n = u16(at + 2);
at = d + n;
if (ended()) break;
if (depth > 1) continue;
if (VW_XLS_CELLS[type]) {
cell(u16(d), u16(d + 2), u16(d + 4));
} else if (type === VW_XLS_MULRK || type === VW_XLS_MULBLANK) {
var step = type === VW_XLS_MULRK ? 6 : 2;
for (i = 0; i < (n - 6) / step; i++) cell(u16(d), u16(d + 2) + i, u16(d + 4 + i * step));
}
}
return sheet;
}
function vwWorkbookStyles(wb) {
var looks = new VwLooks(), read = null;
try {
read = vwXlsxStyles(wb, looks) || vwXlsStyles(wb, looks);
} catch (e) {
read = null;
}
delete wb.files;
delete wb.keys;
delete wb.cfb;
var normal = read ? read.normal : vwNormal(VW_NORMAL_FONT, VW_NORMAL_PT);
var made = [];
return {
looks: looks,
normal: normal,
active: read ? read.active : null,
art: function (k) { return (read && read.arts && read.arts[k]) || []; },
sheet: function (k) {
if (made[k]) return made[k];
var get = read && read.sheets[k], sheet = null;
try {
sheet = get ? get() : null;
} catch (e) {
sheet = null;
}
return (made[k] = sheet || vwPlainSheet(normal));
}
};
}