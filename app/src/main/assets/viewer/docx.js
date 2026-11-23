var vwMakeElement = document.createElement;
document.createElement = function (name, options) {
var el = vwMakeElement.call(document, name, options);
if (String(name).toLowerCase() === "iframe") el.setAttribute("sandbox", "");
return el;
};
function makeElement(spec) {
if (this && this.renderRun && !this.vwRunsOnce) {
vwSplitAsWordDid(this);
drawRunsOnce(this);
drawLrTbAcross(this);
vwWordLines(this);
}
var custom = vwWordElement(spec);
var el = docx.defaultOptions.h(spec);
for (var name in custom) el.style.setProperty(name, custom[name]);
return el;
}
function drawRunsOnce(renderer) {
var draw = renderer.renderRun;
renderer.vwRunsOnce = true;
renderer.renderRun = function (run) {
if (!run.verticalAlign) return draw.call(this, run);
var span = draw.call(this, Object.assign({}, run, { verticalAlign: null }));
if (span) {
var raised = this.h({ tagName: run.verticalAlign });
while (span.firstChild) raised.appendChild(span.firstChild);
span.appendChild(raised);
}
return span;
};
}
function drawLrTbAcross(renderer) {
var draw = renderer.renderTableCell;
renderer.renderTableCell = function (cell) {
if (cell.cssStyle && cell.cssStyle["writing-mode"] === "vertical-lr") {
delete cell.cssStyle["writing-mode"];
delete cell.cssStyle.transform;
}
return draw.call(this, cell);
};
}
function fixSymbolChars(root) {
var map = {
0xF0B7: "•", 0xF0A7: "▪", 0xF0A8: "◦", 0xF076: "❖",
0xF0D8: "➢", 0xF0FC: "✓", 0xF0B0: "°", 0xF0D0: "➔"
};
var pua = new RegExp("[\\uF000-\\uF0FF]", "g");
var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
var n;
while ((n = walker.nextNode())) {
pua.lastIndex = 0;
if (pua.test(n.nodeValue)) {
pua.lastIndex = 0;
n.nodeValue = n.nodeValue.replace(pua, function (c) {
return map[c.charCodeAt(0)] || "•";
});
}
}
}
function fitPageWidth() {
var wrap = document.querySelector(".docx-wrapper");
var pages = wrap ? wrap.querySelectorAll("section.docx") : [];
if (!pages.length) return;
wrap.style.setProperty("--vw-page-zoom", "1");
var pad = getComputedStyle(wrap);
var room = wrap.clientWidth -
parseFloat(pad.paddingLeft || 0) - parseFloat(pad.paddingRight || 0);
var widest = 0, widestPage = null;
for (var i = 0; i < pages.length; i++) {
var width = pages[i].getBoundingClientRect().width;
if (width > widest) { widest = width; widestPage = pages[i]; }
}
if (room > 0 && widest > 0) {
wrap.style.setProperty("--vw-page-zoom", room / widest);
vwPages.rectScale = widestPage.getBoundingClientRect().width / room;
}
}
var VW_PRINT_OVER = 0.02;
function vwPrintFooters(sheets) {
for (var i = 0; i < sheets.length; i++) {
var footer = sheets[i].querySelector(":scope > footer");
var into = footer ? Math.max(0, -parseFloat(getComputedStyle(footer).marginBottom) || 0) : 0;
var style = getComputedStyle(sheets[i]);
var paper = parseFloat(style.minHeight) || 0;
var over = Math.max(0, sheets[i].getBoundingClientRect().height - paper);
var pad = parseFloat(style.paddingBottom) || 0;
if (!(into + over > 0.5) || over > paper * VW_PRINT_OVER || into + over > pad + VW_SLACK) continue;
sheets[i].style.setProperty("--vw-print-pad", Math.max(0, pad - into - over) + "px");
sheets[i].classList.add(into > 0 ? "vw-print-footer" : "vw-print-fit");
}
}
window.vwPageCommand = function (msg) {
var verb = msg.charAt(0);
if (verb === "g") vwGoToPage(Math.floor(Number(msg.slice(1))));
else if (verb === "i") vwSetNight(msg.charAt(1) === "1");
};
window.vwPortReady = function () {
vwPageSent = 0;
vwReportPage();
};
var VW_DRAW = {
inWrapper: true,
breakPages: true,
renderHeadersFooters: true,
ignoreLastRenderedPageBreak: true,
experimental: true,
keepOrigin: true,
h: makeElement
};
function vwDrawWord(buf) {
return docx.parseAsync(buf, VW_DRAW)
.then(function (doc) {
vwContextualSpacing(doc);
var model = vwNumberModel(doc);
if (vwPages.turns) vwAddTurns(model, vwPages.turns);
return docx.renderDocument(doc, VW_DRAW);
})
.then(function (nodes) {
var container = document.getElementById("container");
container.innerHTML = "";
nodes.forEach(function (node) { container.appendChild(node); });
});
}
function vwDrawWordAgain(buf) {
var container = document.getElementById("container");
var pictures = [].map.call(container.querySelectorAll('img[src^="blob:"]'),
function (img) { return img.src; });
container.innerHTML = "";
return vwDrawWord(buf).then(function () {
pictures.forEach(function (url) { URL.revokeObjectURL(url); });
});
}
var VW_XML_PACKAGE = "http://schemas.microsoft.com/office/2006/xmlPackage";
function vwEscapeXml(s) {
return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
function vwWordFromPackage(buf) {
var head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 2));
if (head[0] === 0x50 && head[1] === 0x4B) return Promise.resolve(buf);
var xml = new DOMParser().parseFromString(new TextDecoder().decode(buf), "application/xml");
var root = xml.documentElement;
if (!root || root.namespaceURI !== VW_XML_PACKAGE || root.localName !== "package") {
return Promise.resolve(buf);
}
var zip = new JSZip();
var serializer = new XMLSerializer();
var types = "";
var parts = root.getElementsByTagNameNS(VW_XML_PACKAGE, "part");
for (var i = 0; i < parts.length; i++) {
var part = parts[i];
var name = String(part.getAttributeNS(VW_XML_PACKAGE, "name") || "").replace(/^\/+/, "");
if (!name) continue;
var xmlData = part.getElementsByTagNameNS(VW_XML_PACKAGE, "xmlData")[0];
var binaryData = part.getElementsByTagNameNS(VW_XML_PACKAGE, "binaryData")[0];
if (xmlData && xmlData.firstElementChild) {
zip.file(name, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
serializer.serializeToString(xmlData.firstElementChild));
} else if (binaryData) {
zip.file(name, binaryData.textContent.replace(/\s+/g, ""), { base64: true });
} else {
continue;
}
types += '<Override PartName="/' + vwEscapeXml(name) + '" ContentType="' +
vwEscapeXml(part.getAttributeNS(VW_XML_PACKAGE, "contentType") || "") + '"/>';
}
zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + types + "</Types>");
return zip.generateAsync({ type: "arraybuffer" });
}
if (!vwWebViewTooOld("Word documents")) {
vwFetchDoc("buffer")
.then(vwWordFromPackage)
.then(function (buf) {
return vwDrawWord(buf)
.then(function () {
document.getElementById("container").style.visibility = "hidden";
return vwFindMissingPages();
})
.then(function (missing) { if (missing) return vwDrawWordAgain(buf); });
})
.then(function () {
document.body.getBoundingClientRect();
return document.fonts.ready;
})
.then(function () {
vwPages.settled = true;
var container = document.getElementById("container");
container.style.visibility = "";
vwDisarmLinks(container);
fixSymbolChars(container);
vwNumberPages(vwSheets());
vwLineUpTabs();
if (vwNightOn) vwPrepareNight();
vwHideTails(vwSheets());
vwPrintFooters(vwSheets());
fitPageWidth();
vwFitHeight();
vwPrintSizes(vwSheets());
vwStatusDone();
vwFollowPages();
})
.catch(function (e) { vwError("Could not render this Word document", String(e)); });
}