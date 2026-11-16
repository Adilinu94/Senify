// Befund 7: --framer-icon-mask inline vs. CSS, Icon-Hintergrundfarben.
import fs from "node:fs";

const html = fs.readFileSync("C:/Users/adini/.senify/previews/H-OXzxq_XvLirh/price/index.html", "utf8");
const i = html.indexOf("--framer-icon-mask");
console.log("Erste inline-Stelle:\n", html.slice(i - 400, i + 300));
const defs = (html.match(/--framer-icon-mask\s*:/g) || []).length;
const uses = (html.match(/var\(--framer-icon-mask/g) || []).length;
console.log("inline-Definitionen:", defs, "Verwendungen:", uses);

// Icon mit Maske: hat es background-color inline?
const j = html.indexOf("--framer-icon-mask:");
if (j >= 0) {
  const start = html.lastIndexOf("<", j);
  console.log("\nIcon-Tag mit Mask-Definition:\n", html.slice(start, html.indexOf(">", j) + 1).slice(0, 900));
}