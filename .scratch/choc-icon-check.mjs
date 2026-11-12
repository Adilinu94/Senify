// Befund 7: Check-Icon-Farben /price — Bake-CSS gegen Original vergleichen.
import fs from "node:fs";

const html = fs.readFileSync("C:/Users/adini/.senify/previews/H-OXzxq_XvLirh/price/index.html", "utf8");
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");

function ruleFor(id) {
  const marker = `[data-node-id="${id}"]`;
  const out = [];
  let pos = 0;
  while (true) {
    const i = styles.indexOf(marker, pos);
    if (i < 0) break;
    const end = styles.indexOf("}", i);
    out.push(styles.slice(i, end + 1));
    pos = end + 1;
  }
  return out;
}

for (const id of ["fi-6e64b7-10", "fi-6e64b7-9", "fi-6e64b7-8", "fi-6e64b7-11", "fi-6e64b7-7"]) {
  console.log(`== ${id} ==`);
  const rules = ruleFor(id);
  console.log(rules.length ? rules.join("\n") : "keine Regel");
}

const i = html.indexOf('data-node-id="fi-6e64b7-10"');
console.log("\nKontext vor Icon:\n", html.slice(i - 1000, i).replace(/\s+/g, " "));

// w-icon Basisregel
const wi = styles.indexOf(".w-icon");
console.log("\n.w-icon Regel:\n", styles.slice(wi, styles.indexOf("}", wi) + 1));