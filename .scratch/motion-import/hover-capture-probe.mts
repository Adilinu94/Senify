import { captureBrowser } from "@senify/framer-import";
const r = await captureBrowser({ url: process.argv[2] ?? "https://gracious-balance-599544.framer.app/", settleMs: 1500 });
const out = [];
const walk = (n) => { for (const s of n.states) { const h = s.interactions?.hover; if (h) out.push([n.key, n.name, JSON.stringify(h), "transition=" + s.visual["transition"]]); } n.children.forEach(walk); };
r.document.pages.forEach((p) => walk(p.root));
console.log("Knoten mit Hover:", out.length);
for (const o of out) console.log(o.join(" | "));
console.log("Befunde Eltern-Hover:", r.document.findings.filter((f) => f.message.includes("Hover")).length);
