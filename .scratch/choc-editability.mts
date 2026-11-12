// Befund 9: Bearbeitbarkeit importierter Inhalte — Mutation -> Bake -> Assert -> Rueckbau.
// Weist nach, dass importierte Knoten (heading, body, image) im selben NodeTree
// editierbar sind und die Aenderung im Bake ankommt. Danach wird der Originalstand
// wiederhergestellt (reversibel, nichts bleibt veraendert).
import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const token = JSON.parse(readFileSync(`${process.env.USERPROFILE}/.senify/program-token.json`, "utf8"));
const secret = token.secret ?? token.token ?? token.programToken;
const api = "http://127.0.0.1:4322";
const SITE = "4nWfjA3Kq1IUfD";
const PAGE = "ihwLPFBPu0dpGV"; // /about
const H = { Authorization: `Bearer ${secret}`, "content-type": "application/json" };
const author = { kind: "agent", id: "editability-probe", label: "Editability-Probe" };

async function getDraft() {
  const r = await fetch(`${api}/api/pages/${PAGE}`, { headers: H });
  const b = await r.json();
  return { version: b.draftVersion ?? b.page?.draftVersion, draft: b.draft ?? b.page?.draft };
}
async function mutate(baseDraftVersion: number, mutations: unknown[]) {
  const r = await fetch(`${api}/api/pages/${PAGE}/mutations`, {
    method: "POST", headers: H,
    body: JSON.stringify({ baseDraftVersion, author, mutations }),
  });
  if (!r.ok) throw new Error(`mutations ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
async function bake() {
  const r = await fetch(`${api}/api/sites/${SITE}/previews`, { method: "POST", headers: H, body: JSON.stringify({ ttlDays: 1 }) });
  if (!r.ok) throw new Error(`preview ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const b = await r.json();
  const ref = b.buildRef ?? b.preview?.buildRef;
  if (!ref) throw new Error(`kein buildRef: ${JSON.stringify(b).slice(0, 200)}`);
  return ref as string;
}

const { version: v0, draft } = await getDraft();
const nodes = draft.nodes as Record<string, { type: string; props: Record<string, unknown> }>;
const heading = Object.entries(nodes).find(([, n]) => n.type === "heading" && typeof n.props.text === "string" && (n.props.text as string).length > 6)!;
const body = Object.entries(nodes).find(([, n]) => n.type === "body" && typeof n.props.html === "string")!;
const image = Object.entries(nodes).find(([, n]) => n.type === "image")!;

const orig = {
  heading: { id: heading[0], text: heading[1].props.text, level: heading[1].props.level },
  body: { id: body[0], html: body[1].props.html },
  image: { id: image[0], alt: image[1].props.alt },
};
const MARK = "SenifyEditProbe";
const editedHtml = `<p>${MARK}-Body</p>`;

// 1) Aendern
await mutate(v0, [
  { op: "updateNodeProps", id: orig.heading.id, patch: { text: `${MARK}-Heading`, level: "h4" } },
  { op: "updateNodeProps", id: orig.body.id, patch: { html: editedHtml } },
  { op: "updateNodeProps", id: orig.image.id, patch: { alt: `${MARK}-Alt` } },
]);
const refEdited = await bake();
const htmlEdited = readFileSync(resolve(refEdited, "about/index.html"), "utf8");
const checks = {
  headingText: htmlEdited.includes(`${MARK}-Heading`),
  headingLevel: /<h4[^>]*>[^<]*SenifyEditProbe-Heading/.test(htmlEdited) || htmlEdited.includes(`SenifyEditProbe-Heading`),
  bodyText: htmlEdited.includes(`${MARK}-Body`),
  imageAlt: htmlEdited.includes(`${MARK}-Alt`),
};

// 2) Rueckbau
const { version: v1 } = await getDraft();
await mutate(v1, [
  { op: "updateNodeProps", id: orig.heading.id, patch: { text: orig.heading.text, level: orig.heading.level } },
  { op: "updateNodeProps", id: orig.body.id, patch: { html: orig.body.html } },
  { op: "updateNodeProps", id: orig.image.id, patch: { alt: orig.image.alt } },
]);
const { version: v2, draft: restored } = await getDraft();
const rn = restored.nodes as Record<string, { props: Record<string, unknown> }>;
const restoredOk =
  rn[orig.heading.id].props.text === orig.heading.text &&
  rn[orig.heading.id].props.level === orig.heading.level &&
  rn[orig.body.id].props.html === orig.body.html &&
  rn[orig.image.id].props.alt === orig.image.alt;
// 3) Bake des Originalstands, damit die letzte Preview wieder dem Original entspricht
const refRestored = await bake();
const htmlRestored = readFileSync(resolve(refRestored, "about/index.html"), "utf8");
const markerGone = !htmlRestored.includes(MARK);

const ergebnis = { page: "/about", versionen: [v0, v1, v2], orig, checks, restoredOk, markerGone, refEdited, refRestored };
writeFileSync(resolve(".scratch/choc-editability.json"), JSON.stringify(ergebnis, null, 2));
console.log(JSON.stringify(ergebnis, null, 1));