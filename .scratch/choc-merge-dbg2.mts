import { readFileSync } from "node:fs";
type N = { key: string; tag: string; baseClasses?: string[]; variantClasses?: string[]; htmlId?: string | null; states: any[]; children: N[] };
for (const f of ["desktop", "tablet"]) {
  const doc = JSON.parse(readFileSync(`.scratch/choc-dbg-${f}.json`, "utf8"));
  const out: string[] = [];
  const all: N[] = [];
  const walk = (n: N) => { all.push(n); n.children.forEach(walk); };
  walk(doc.pages[0].root);
  const host = all.find((n) => (n.baseClasses ?? []).includes("framer-1uss29n"))!;
  for (const c of host.children) out.push(`${c.key} ${c.tag} base=${JSON.stringify(c.baseClasses)} var=${JSON.stringify(c.variantClasses)} text=${JSON.stringify(c.states[0]?.text)?.slice(0, 200)}`);
  const sig = (n: N) => `${n.tag}|${(n.baseClasses ?? []).join("|")}`;
  const same = all.filter((n) => sig(n) === sig(host.children[0]!));
  out.push(`same signature count: ${same.length}, index of ours: ${same.indexOf(host.children[0]!)}`);
  console.log(`== ${f}\n${out.join("\n")}`);
}