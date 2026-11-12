import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Konsolidierte Re-Import-Runde: alle 10 Seiten mit dem aktuellen Code
// (Fade-Fix, Überschriften-Normalisierung, Fehlerliste, Release-Checks).
// Läuft sequenziell gegen die Engine-API; Reports landen in .scratch/.

const SITE = "4nWfjA3Kq1IUfD";
const BASE = "https://chocolate-attributes-385353.framer.app";
const token = JSON.parse(readFileSync(`${process.env.USERPROFILE}/.senify/program-token.json`, "utf8"));
const secret = token.secret ?? token.token ?? token.programToken;
const api = "http://127.0.0.1:4322";

const pages = [
  { id: "UWP_3N7yXcwD1Z", path: "/", slug: "home" },
  { id: "ihwLPFBPu0dpGV", path: "/about", slug: "about" },
  { id: "smimmAz1y8ar40", path: "/price", slug: "price" },
  { id: "4eqvkvOoBRbXPx", path: "/blog", slug: "blog" },
  { id: "P3EWR6xdmAooPy", path: "/contact", slug: "contact" },
  { id: "8jD3uXzQ4R1Xn7", path: "/privacy-policy", slug: "privacy" },
  { id: "8A4nr5nVi98iw4", path: "/terms-and-condition", slug: "terms" },
  { id: "0MtmULO02MSU2L", path: "/blog/how-to-automate-employee-onboarding-(without-a-6-week-it-project)", slug: "article-onboarding" },
  { id: "Gfj-Zg9uB-CfW8", path: "/blog/what-is-hr-automation-a-practical-guide-for-startups-and-growing-companies", slug: "article-hr-automation" },
  { id: "jbAjJ925e3QeoN", path: "/blog/pto-and-time-off-tracking-how-to-automate-it-without-spreadsheets-or-approval-limbo", slug: "article-pto" },
];

const headers = { Authorization: `Bearer ${secret}` };
const summary: unknown[] = [];

for (const page of pages) {
  const res = await fetch(`${api}/api/pages/${page.id}`, { headers });
  if (!res.ok) throw new Error(`GET ${page.path}: ${res.status}`);
  const body = (await res.json()) as { page?: { draftVersion?: number }; draftVersion?: number };
  const version = body.page?.draftVersion ?? body.draftVersion;
  if (typeof version !== "number") throw new Error(`Keine draftVersion für ${page.path}: ${JSON.stringify(body).slice(0, 200)}`);
  const url = BASE + (page.path === "/" ? "/" : page.path);
  console.log(`[${page.slug}] draft ${version} → importiere ${url}`);
  const run = spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "packages/mcp/src/cli.ts",
      "import", "framer", url,
      "--site", SITE,
      "--page-path", page.path,
      "--page-id", page.id,
      "--base-draft-version", String(version),
      "--capture", "browser",
      "--mode", "fidelity",
      "--output", "structure",
      "--write",
      "--report",
    ],
    { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" }, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 },
  );
  const out = `.scratch/choc-reimport2-${page.slug}.json`;
  if (run.stdout) writeFileSync(out, run.stdout);
  if (run.status !== 0) {
    console.error(`[${page.slug}] FEHLER exit=${run.status}\n${(run.stderr ?? "").slice(-2000)}`);
    summary.push({ slug: page.slug, ok: false, exit: run.status });
    continue;
  }
  try {
    const parsed = JSON.parse(run.stdout) as { job: { status: string }; report: { score: number; counts: { nodes: number; mapped: number }; findings: { kind: string; severity: string }[] } };
    const heading = parsed.report.findings.filter((f) => f.kind === "heading-levels");
    console.log(`[${page.slug}] OK job=${parsed.job.status} score=${parsed.report.score} knoten=${parsed.report.counts.mapped}/${parsed.report.counts.nodes} heading-Funde=${heading.length}`);
    summary.push({ slug: page.slug, ok: true, job: parsed.job.status, score: parsed.report.score, counts: parsed.report.counts, headingFindings: heading.length });
  } catch {
    console.log(`[${page.slug}] exit 0, aber stdout kein JSON: ${run.stdout.slice(0, 300)}`);
    summary.push({ slug: page.slug, ok: true, parse: false });
  }
}

writeFileSync(".scratch/choc-reimport2-summary.json", JSON.stringify(summary, null, 1));
console.log("FERTIG", JSON.stringify(summary));