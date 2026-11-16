import { readFileSync, writeFileSync } from "node:fs";

const token = JSON.parse(readFileSync("C:/Users/adini/.senify/program-token.json", "utf8"));
const pageId = process.argv[2] ?? "UWP_3N7yXcwD1Z";
const res = await fetch(`http://127.0.0.1:4321/api/pages/${pageId}`, {
  headers: { authorization: `Bearer ${token.secret}` },
});
if (!res.ok) { console.error("HTTP", res.status, await res.text()); process.exit(1); }
const page = await res.json();
writeFileSync(".scratch/choc-page-home.json", JSON.stringify(page, null, 1));
const nodes = page.draft.nodes as Record<string, any>;
console.log("knoten", Object.keys(nodes).length, "wurzel", page.draft.rootNodeId);
const ids = process.argv.slice(3);
for (const id of ids) {
  const n = nodes[id];
  if (!n) { console.log(id, "FEHLT"); continue; }
  const kopie = { ...n };
  if (Array.isArray(kopie.children)) kopie.children = kopie.children.map((c: any) => (typeof c === "string" ? c : c.id));
  console.log(JSON.stringify(kopie, null, 1));
}