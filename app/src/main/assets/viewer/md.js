if (!vwWebViewTooOld("Markdown files")) {
vwFetchDoc("text")
.then(function (txt) {
var html = marked.parse(txt, { gfm: true, breaks: false });
var content = document.getElementById("content");
content.innerHTML = DOMPurify.sanitize(html);
pointPicturesBeside(content);
content.querySelectorAll("pre, code").forEach(function (el) {
if (!el.hasAttribute("dir") && !el.parentElement.closest("pre[dir], code[dir]")) el.dir = "ltr";
});
content.dir = vwMostlyRightToLeft(proseText(content)) ? "rtl" : "ltr";
vwStatusDone();
})
.catch(function (e) { vwError("Could not render this Markdown file", String(e)); });
}
function pointPicturesBeside(root) {
root.querySelectorAll("img[src]").forEach(function (img) {
var src = img.getAttribute("src");
var only = /#gh-(dark|light)-mode-only$/.exec(src);
if (only) img.setAttribute("data-vw-only", only[1]);
if (besideTheFile(src)) img.setAttribute("src", besideUrl(src));
});
root.querySelectorAll("img[srcset], source[srcset]").forEach(function (el) {
el.setAttribute("srcset", el.getAttribute("srcset").replace(/(^|,)(\s*)(\S*[^\s,])/g,
function (all, comma, space, src) {
return comma + space + (besideTheFile(src) ? besideUrl(src) : src);
}));
});
}
function besideTheFile(src) {
return !/^\s*([a-z][a-z\d+.-]*:|[\/\\#]|$)/i.test(src);
}
function besideUrl(src) {
return "/beside?path=" + encodeURIComponent(src);
}
function proseText(root) {
var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), node, parts = [], length = 0;
while (length < VW_DIRECTION_SAMPLE && (node = walk.nextNode())) {
if (!node.parentElement.closest("[dir]")) {
parts.push(node.data);
length += node.data.length;
}
}
return parts.join("").slice(0, VW_DIRECTION_SAMPLE);
}