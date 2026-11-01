// Reproduziert den Import-Merge fuer den Outfit-Knoten: Desktop-IR, dann
// Tablet- und Telefon-Aufbau dazu, dann das gemappte Dokument.
import { captureHtml, normalize, mapDocument } from "../../packages/framer-import/src/index.ts";
import { mergeDeviceVariants } from "../../packages/framer-import/src/import.ts";
import { captureBrowser } from "../../packages/framer-import/src/capture-browser.ts";

const WANT = "framer-4g55og";
type IrNode = {
  key: string;
  tag: string;
  baseClasses: string[];
  states: { device: string; hiddenAt: string[]; visual: Record<string, unknown> }[];
  children: IrNode[];
};
type IrDoc = { pages: { root: IrNode }[] };

function show(label: string, doc: IrDoc): void {
  let found = 0;
  const walk = (node: IrNode): void => {
    if (node.baseClasses.includes(WANT)) {
      found += 1;
      console.log(`\n${label} · ${node.key} <${node.tag}>`);
      for (const state of node.states) {
        console.log(`  [${state.device}] hiddenAt=${JSON.stringify(state.hiddenAt)}`);
        for (const [name, value] of Object.entries(state.visual)) console.log(`    ${name}=${JSON.stringify(value).slice(0, 90)}`);
      }
    }
    for (const child of node.children) walk(child);
  };
  walk(doc.pages[0]?.root as IrNode);
  if (found === 0) console.log(`\n${label} · kein ${WANT}`);
}

function mappedOf(doc: IrDoc, label: string): void {
  const normalized = normalize(doc as never, { mode: "fidelity" });
  const mapped = mapDocument(doc as never, normalized.rules);
  const nodes = mapped.document.nodes as Record<string, { id: string; primitive: string; props: Record<string, unknown>; overrides?: Record<string, { props?: Record<string, unknown> }> }>;
  const entries = Object.values(nodes).filter((node) => JSON.stringify(node.props["transform"] ?? "").includes("rotate(30deg)") && JSON.stringify(node.overrides ?? {}).includes("rotate"));
  console.log(`\n${label} · gemappt: ${entries.length} Knoten mit rotate(30) und Override`);
  for (const node of entries.slice(0, 10)) {
    console.log(`  ${node.id}(${node.primitive}) transform=${JSON.stringify(node.props["transform"] ?? null)}`);
    console.log(`    tablet=${JSON.stringify(node.overrides?.tablet?.props?.["transform"] ?? null)} mobile=${JSON.stringify(node.overrides?.mobile?.props?.["transform"] ?? null)}`);
  }
}

const capture = await captureBrowser({ url: "https://unifiersofjapan.framer.website/", pagePath: "/", settleMs: 600 });
console.log(`frueh ${capture.earlyMarkup?.length ?? 0} · tablet ${capture.deviceMarkup?.tablet?.length ?? 0} · mobile ${capture.deviceMarkup?.mobile?.length ?? 0}`);

const desktop = capture.document as unknown as IrDoc;
show("desktop", desktop);
const tabletHtml = capture.deviceMarkup?.tablet ?? "";
const mobileHtml = capture.deviceMarkup?.mobile ?? "";
const tablet = tabletHtml === "" ? undefined : (captureHtml({ html: tabletHtml, url: "https://unifiersofjapan.framer.website/" }) as unknown as IrDoc);
const mobile = mobileHtml === "" ? undefined : (captureHtml({ html: mobileHtml, url: "https://unifiersofjapan.framer.website/" }) as unknown as IrDoc);
if (tablet !== undefined) show("tablet", tablet);
if (mobile !== undefined) show("mobile", mobile);

let merged = desktop as never;
if (tablet !== undefined) merged = mergeDeviceVariants(merged, tablet as never, "tablet") as never;
if (mobile !== undefined) merged = mergeDeviceVariants(merged, mobile as never, "mobile") as never;
show("gemergt", merged as unknown as IrDoc);
mappedOf(merged as unknown as IrDoc, "gemergt");
