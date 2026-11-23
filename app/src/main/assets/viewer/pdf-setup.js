var vwPdfBlocked = vwWebViewTooOld("PDFs");
if (vwPdfBlocked && vwParams.get("simple") === "1") {
(function () {
var card = document.getElementById("vw-status");
var port = null;
var asked = false;
var button = document.createElement("button");
button.type = "button";
button.className = "vw-simple-btn";
button.textContent = "Open in simple view";
button.setAttribute("aria-describedby", "vw-simple-caveat");
var caveat = document.createElement("div");
caveat.id = "vw-simple-caveat";
caveat.className = "vw-simple-caveat";
caveat.textContent = "Shows the pages as pictures, without search, text selection or form entries.";
card.appendChild(button);
card.appendChild(caveat);
function send() {
if (asked && port) port.postMessage("simple");
}
button.addEventListener("click", function () {
asked = true;
button.disabled = true;
send();
});
window.addEventListener("message", function (e) {
if (!e.ports || !e.ports.length || port) return;
port = e.ports[0];
send();
});
})();
}
var vwNight = vwParams.get("night") === "1";
if (vwNight) document.documentElement.classList.add("vw-night");