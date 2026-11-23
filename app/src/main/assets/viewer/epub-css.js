"use strict";
var vwBookCss = (function () {
function prepared(css) {
css = String(css).replace(/\r\n?|\f/g, "\n").replace(/\u0000/g, "\uFFFD");
var end = css.length;
while (end > 0 && css.charCodeAt(end - 1) === 92) end--;
return (css.length - end) % 2 ? css + "\uFFFD" : css;
}
function codeAt(css, i) {
return i < css.length ? css.charCodeAt(i) : -1;
}
function isDigit(c) {
return c >= 48 && c <= 57;
}
function isHex(c) {
return isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}
function isNameStart(c) {
return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 128;
}
function isName(c) {
return isNameStart(c) || isDigit(c) || c === 45;
}
function isSpace(c) {
return c === 10 || c === 9 || c === 32;
}
function isUnprintable(c) {
return (c >= 0 && c <= 8) || c === 11 || (c >= 14 && c <= 31) || c === 127;
}
function escapes(css, i) {
return codeAt(css, i) === 92 && codeAt(css, i + 1) !== 10;
}
function escaped(css, i) {
var c = codeAt(css, i);
if (c < 0) return { ch: "\uFFFD", to: i };
if (!isHex(c)) return { ch: css.charAt(i), to: i + 1 };
var j = i;
while (j < i + 6 && isHex(codeAt(css, j))) j++;
var n = parseInt(css.slice(i, j), 16);
if (isSpace(codeAt(css, j))) j++;
if (n === 0 || (n >= 0xD800 && n <= 0xDFFF) || n > 0x10FFFF) return { ch: "\uFFFD", to: j };
if (n < 0x10000) return { ch: String.fromCharCode(n), to: j };
n -= 0x10000;
return { ch: String.fromCharCode(0xD800 + (n >> 10), 0xDC00 + (n & 0x3FF)), to: j };
}
function startsName(css, i) {
var c = codeAt(css, i);
if (c === 45) {
var d = codeAt(css, i + 1);
return isNameStart(d) || d === 45 || escapes(css, i + 1);
}
return isNameStart(c) || escapes(css, i);
}
function startsNumber(css, i) {
var c = codeAt(css, i);
if (c === 43 || c === 45) {
c = codeAt(css, i + 1);
return isDigit(c) || (c === 46 && isDigit(codeAt(css, i + 2)));
}
return c === 46 ? isDigit(codeAt(css, i + 1)) : isDigit(c);
}
function nameAt(css, i) {
var value = "";
var run = i;
for (;;) {
if (isName(codeAt(css, i))) {
i++;
} else if (escapes(css, i)) {
var e = escaped(css, i + 1);
value += css.slice(run, i) + e.ch;
i = run = e.to;
} else {
return { value: value + css.slice(run, i), to: i };
}
}
}
function numberEnd(css, i) {
if (codeAt(css, i) === 43 || codeAt(css, i) === 45) i++;
while (isDigit(codeAt(css, i))) i++;
if (codeAt(css, i) === 46 && isDigit(codeAt(css, i + 1))) {
i += 2;
while (isDigit(codeAt(css, i))) i++;
}
var c = codeAt(css, i);
var d = codeAt(css, i + 1);
if ((c === 69 || c === 101) && (isDigit(d) || ((d === 43 || d === 45) && isDigit(codeAt(css, i + 2))))) {
i += isDigit(d) ? 2 : 3;
while (isDigit(codeAt(css, i))) i++;
}
if (startsName(css, i)) return nameAt(css, i).to;
return codeAt(css, i) === 37 ? i + 1 : i;
}
function stringAt(css, i, quote) {
var value = "";
var run = i;
for (;;) {
var c = codeAt(css, i);
if (c === quote || c < 0) {
return { type: "string", value: value + css.slice(run, i), to: c < 0 ? i : i + 1, closed: c >= 0 };
}
if (c === 10) return { type: "bad-string", to: i };
if (c !== 92) {
i++;
continue;
}
value += css.slice(run, i);
var d = codeAt(css, i + 1);
if (d < 0 || d === 10) {
i = run = d < 0 ? i + 1 : i + 2;
} else {
var e = escaped(css, i + 1);
value += e.ch;
i = run = e.to;
}
}
}
function urlAt(css, i) {
var value = "";
var run = i;
for (;;) {
var c = codeAt(css, i);
if (c === 41 || c < 0) return { type: "url", value: value + css.slice(run, i), to: c < 0 ? i : i + 1 };
if (isSpace(c)) {
var end = i;
while (isSpace(codeAt(css, i))) i++;
c = codeAt(css, i);
if (c === 41 || c < 0) return { type: "url", value: value + css.slice(run, end), to: c < 0 ? i : i + 1 };
return badUrlAt(css, i);
}
if (c === 34 || c === 39 || c === 40 || isUnprintable(c) || (c === 92 && !escapes(css, i))) {
return badUrlAt(css, i);
}
if (c === 92) {
var e = escaped(css, i + 1);
value += css.slice(run, i) + e.ch;
i = run = e.to;
} else {
i++;
}
}
}
function badUrlAt(css, i) {
for (;;) {
var c = codeAt(css, i);
if (c === 41 || c < 0) return { type: "bad-url", to: c < 0 ? i : i + 1 };
i = escapes(css, i) ? escaped(css, i + 1).to : i + 1;
}
}
function nameLike(css, i) {
var name = nameAt(css, i);
if (codeAt(css, name.to) !== 40) return { type: "ident", value: name.value, to: name.to };
if (/^url$/i.test(name.value)) {
var k = name.to + 1;
while (isSpace(codeAt(css, k))) k++;
if (codeAt(css, k) !== 34 && codeAt(css, k) !== 39) return urlAt(css, k);
}
return { type: "function", value: name.value, to: name.to + 1 };
}
function tokens(css) {
var out = [];
var i = 0;
while (i < css.length) {
var c = css.charCodeAt(i);
var t;
if (c === 47 && codeAt(css, i + 1) === 42) {
var end = css.indexOf("*/", i + 2);
t = { type: "comment", to: end < 0 ? css.length : end + 2 };
} else if (isSpace(c)) {
var j = i;
while (isSpace(codeAt(css, j))) j++;
t = { type: "space", to: j };
} else if (c === 34 || c === 39) {
t = stringAt(css, i + 1, c);
} else if (c === 35 && (isName(codeAt(css, i + 1)) || escapes(css, i + 1))) {
t = { type: "hash", to: nameAt(css, i + 1).to };
} else if (c === 64 && startsName(css, i + 1)) {
var at = nameAt(css, i + 1);
t = { type: "at", value: at.value, to: at.to };
} else if (startsNumber(css, i)) {
t = { type: "number", to: numberEnd(css, i) };
} else if (c === 45 && codeAt(css, i + 1) === 45 && codeAt(css, i + 2) === 62) {
t = { type: "cdc", to: i + 3 };
} else if (c === 60 && css.substr(i + 1, 3) === "!--") {
t = { type: "cdo", to: i + 4 };
} else if (startsName(css, i)) {
t = nameLike(css, i);
} else {
t = { type: css.charAt(i), to: i + 1 };
}
t.from = i;
out.push(t);
i = t.to;
}
return out;
}
function urlTrim(s) {
var a = 0;
var b = s.length;
while (a < b && s.charCodeAt(a) <= 32) a++;
while (b > a && s.charCodeAt(b - 1) <= 32) b--;
return s.slice(a, b);
}
function cssString(s) {
return s.replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\a ");
}
function closerOf(type) {
return type === "{" ? "}" : type === "[" ? "]" : type === "(" || type === "function" ? ")" : "";
}
function closedAt(list, i, to) {
var open = [closerOf(list[i].type)];
for (var j = i + 1; j < to; j++) {
var close = closerOf(list[j].type);
if (close) {
open.push(close);
} else if (list[j].type === open[open.length - 1]) {
open.pop();
if (!open.length) return j + 1;
}
}
return to;
}
function ruleEnd(list, i, to, nested) {
for (var j = i + 1; j < to; j++) {
var type = list[j].type;
if (type === ";") return j + 1;
if (type === "}" && nested) return j;
if (type === "{") return closedAt(list, j, to);
if (closerOf(type)) j = closedAt(list, j, to) - 1;
}
return to;
}
function blocked(list, i, end) {
for (var j = i + 1; j < end; j++) {
if (list[j].type === "{") return true;
if (closerOf(list[j].type)) j = closedAt(list, j, end) - 1;
}
return false;
}
function after(list, i, to) {
for (i++; i < to && (list[i].type === "space" || list[i].type === "comment"); i++);
return i;
}
function importing(list, i, to) {
var j = after(list, i, to);
var t = j < to ? list[j] : null;
if (t && (t.type === "string" || t.type === "url")) return t.value;
if (t && t.type === "function" && /^url$/i.test(t.value)) {
var k = after(list, j, to);
if (k < to && list[k].type === "string") return list[k].value;
}
return null;
}
var HOLDERS = /^(media|supports|document|-moz-document|layer|container|scope|starting-style)$/i;
var PICTURED = /^((-webkit-|-moz-)?(image-set|image|cross-fade|element|gradient|(repeating-)?(linear|radial|conic)-gradient)|type|calc|min|max|clamp)$/;
var EPUB_ONLY = /^-epub-(hyphens|line-break|text-align-last|text-underline-position)$/i;
function rewrite(css, list, from, to, into, how) {
var text = "";
var found = { all: 0, far: 0 };
var open = [];
var top = { rules: !!how.sheet, start: true, at: false, holds: false };
var levels = [top];
function flush() {
if (text) into.push(text);
text = "";
}
function address(value) {
var trimmed = urlTrim(value);
var here = trimmed.charAt(0) === "#";
found.all++;
if (!here) found.far++;
if (here || /^(data|blob):/i.test(trimmed) || !how.answer) {
text += 'url("' + cssString(value) + '")';
return;
}
var at = how.resolve(how.base, trimmed);
if (!at) {
text += 'url("data:,")';
return;
}
flush();
into.push({ path: at.path });
}
function unread() {
found.all++;
found.far++;
text += "url(\u0001)";
}
for (var i = from; i < to; i++) {
var t = list[i];
var type = t.type;
var inner = open.length ? open[open.length - 1] : null;
var level = levels[levels.length - 1];
var bare = !inner || !!inner.level;
if (type === "comment") {
text += "/**/";
continue;
}
if (type === "space") {
text += css.slice(t.from, t.to);
continue;
}
if (bare && level.rules && level.start && type !== "cdo" && type !== "cdc") {
level.start = false;
level.at = type === "at";
level.holds = false;
var name = type === "at" ? t.value.toLowerCase() : "";
var first = levels.length === 1;
var own = (first && (name === "import" || name === "namespace")) || name === "font-face";
var end = own ? ruleEnd(list, i, to, !first) : i;
if (name === "namespace" && list[end - 1].type === "}") own = false;
if (own) {
flush();
if (name === "import") {
var href = importing(list, i, end);
var target = href === null ? null : how.resolve(how.base, urlTrim(href));
var file = target && how.entry(target.path);
if (file) into.push({ imp: file.name });
} else if (name === "namespace" || blocked(list, i, end)) {
var part = [];
rewrite(css, list, i, end, part,
{ base: how.base, answer: name === "font-face", resolve: how.resolve, entry: how.entry });
if (name === "namespace" && list[end - 1].type !== ";") part.push(";");
into.push(name === "font-face" ? { face: part } : part.join(""));
}
i = end - 1;
level.start = true;
continue;
}
level.holds = HOLDERS.test(name);
}
if (type === "{") {
text += "{";
var block = bare ? { rules: level.rules && level.at && level.holds, start: true, at: false, holds: false } : null;
open.push({ close: "}", level: block });
if (block) levels.push(block);
continue;
}
if (type === "}" || type === ")" || type === "]") {
text += type;
if (inner && inner.close === type) {
open.pop();
if (inner.level) {
levels.pop();
levels[levels.length - 1].start = true;
}
}
continue;
}
if (type === ";") {
text += ";";
if (bare && level.at) level.start = true;
continue;
}
if (type === "url") {
address(t.value);
continue;
}
if (type === "bad-url") {
unread();
continue;
}
if (type === "string") {
if (inner && inner.sets) address(t.value);
else text += t.closed ? css.slice(t.from, t.to) : '"' + cssString(t.value) + '"';
continue;
}
if (type === "function") {
var fn = t.value.toLowerCase();
if (fn === "url" || fn === "src") {
var arg = after(list, i, to);
var shut = closedAt(list, i, to);
if (arg < shut && list[arg].type === "string") address(list[arg].value);
else unread();
i = shut - 1;
continue;
}
if (inner && inner.sets && !PICTURED.test(fn)) {
unread();
i = closedAt(list, i, to) - 1;
continue;
}
text += css.slice(t.from, t.to);
open.push({ close: ")", sets: fn === "image-set" || fn === "-webkit-image-set" || fn === "image" });
continue;
}
if (type === "(" || type === "[") {
text += type;
open.push({ close: closerOf(type) });
continue;
}
if (how.sheet && type === ":" && i + 1 < to) {
var next = list[i + 1];
var called = next.type === "ident" || next.type === "function" ? next.value.toLowerCase() : "";
if (next.type === "ident" && called === "root") {
text += "html";
i++;
continue;
}
if (called === "host" || (next.type === "function" && called === "host-context")) {
text += ":not(*)";
i = next.type === "function" ? closedAt(list, i + 1, to) - 1 : i + 1;
continue;
}
}
if (how.sheet && type === "ident" && EPUB_ONLY.test(t.value)) {
var k = after(list, i, to);
if (k < to && list[k].type === ":") {
text += t.value.slice(6);
continue;
}
}
text += css.slice(t.from, t.to);
}
var unfinished = how.sheet && !top.start && !(open.length && open[0].level);
for (var o = open.length - 1; o >= 0; o--) text += open[o].close;
if (unfinished) text += "{}";
flush();
return found;
}
function inStyle(style, base, answer, book) {
var css = prepared(style);
var list = tokens(css);
var parts = [];
var found = rewrite(css, list, 0, list.length, parts,
{ base: base, answer: answer, resolve: book.resolve, entry: book.entry });
return { parts: parts, found: found };
}
function parsed(source, base, book) {
var css = prepared(source);
var list = tokens(css);
var parts = [];
rewrite(css, list, 0, list.length, parts,
{ base: base, sheet: true, answer: true, resolve: book.resolve, entry: book.entry });
return parts;
}
return { inStyle: inStyle, parsed: parsed };
})();