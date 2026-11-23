"use strict";
function vwProseSniff(bytes) {
function starts(at, text) {
for (var i = 0; i < text.length; i++) {
if (bytes[at + i] !== text.charCodeAt(i)) return false;
}
return true;
}
var at = 0;
if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) at = 3;
while (at < 64 && (bytes[at] === 0x20 || bytes[at] === 0x09 || bytes[at] === 0x0A || bytes[at] === 0x0D)) at++;
if (starts(at, "{\\rtf")) return "rtf";
if (starts(0, "PK")) return "odt";
if (starts(at, "<?xml") || starts(at, "<office:document")) return "odt";
if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) return "doc";
return null;
}
var VW_PROSE_READERS = { odt: vwReadOdt, rtf: vwReadRtf, doc: vwReadDoc };
vwFetchDoc("buffer")
.then(function (buffer) {
var kind = vwProseSniff(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 80)));
if (!kind) {
throw new Error("It does not begin the way an OpenDocument, Rich Text or Word " +
"97-2003 file does. If it was saved by an older Word, Word 2 say, Gander cannot " +
"read it; re-saving it in any of those three formats will help.");
}
return VW_PROSE_READERS[kind](buffer, document.getElementById("container"));
})
.then(function (prose) {
vwProseFit(prose);
vwPrintSizes(prose.wrap.querySelectorAll(".vw-paper > section"));
vwStatusDone();
})
.catch(function (e) {
vwError("Could not open this document", String(e && e.message || e));
});