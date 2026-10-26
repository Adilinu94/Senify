import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// U2 (docs/fahrplan-framer-import.md, Live-Messung 26.10.2026): Auf Mobil fehlten
// 13 eindeutige Textzeilen — die gesamte Produktkarte (BERRY BLISS, ORDER NOW,
// $7.50 USD, CHOCO RING …). Der Inhalt war im Baum vorhanden, wurde aber nicht
// gerendert. Desktop war vollständig (87 von 87 eindeutigen Zeilen), die Höhe
// exakt gleich (17656 = 17656). Mobil: 14637 gegen 13336.
//
// Die Ursache ist eine VERWECHSLUNG von Sichtbarkeit und Darstellung:
//
//   Framer drückt "diese Kopie gilt nur auf Mobil" mit
//   `display:none!important` in einer Media-Query aus:
//
//     @media(min-width: 810px) and (max-width: 1499.98px){.hidden-bq06c3{...}}
//
//   Der Import hat das als GESTALTUNG gelesen. Weil Desktop 1440 in dieser
//   Range liegt, stand `display:none` im Basis-Zustand — und weil die
//   Mobil-Kaskade die Eigenschaft gar nicht kennt, hat Mobil sie geerbt.
//   Die Karte verschwand auf Mobil, obwohl dort ihr einziges Zuhause war.
//
// Zwei Dinge müssen zusammen richtig sein:
//
//  1. `hidden-<hash>` am ELEMENT (nicht nur am `ssr-variant`-Wrapper) bedeutet
//     Sichtbarkeit, nicht Aussehen.
//  2. Eine Regel, die nur `display:none` setzt und deren Selektor ein
//     `.hidden-<hash>` trägt, darf nicht in die Darstellungs-Kaskade.
//
// Die zwei Regeln sind getrennt prüfbar — genau das tun die Fälle unten.

const page = (body: string, head = ""): string =>
  `<html lang="de"><head><title>t</title>${head}</head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

const BREAKPOINTS =
  `<style data-framer-breakpoint-css>` +
  `@media(min-width: 1200px){.hidden-desk{display:none!important}}` +
  `@media(min-width: 810px) and (max-width: 1199.98px){.hidden-tab{display:none!important}}` +
  `@media(max-width: 809.98px){.hidden-mob{display:none!important}}` +
  `</style>`;

type MappedNode = {
  id: string;
  primitive: string;
  props: Record<string, unknown>;
  visibleDevices?: string[];
  hidden?: boolean;
};

const mappedOf = (html: string): Record<string, MappedNode> => {
  const document = captureHtml({ html });
  const normalized = normalize(document, { mode: "fidelity" });
  const mapped = mapDocument(document, normalized.rules);
  return mapped.document.nodes as unknown as Record<string, MappedNode>;
};

describe("U2: hidden-<hash> am Element ist Sichtbarkeit, nicht Darstellung", () => {
  it("gives a mobile-only card the device list instead of display:none", () => {
    // Framer's shape: the card carries the hashes of the devices it is NOT on,
    // directly on the element (no ssr-variant wrapper) — measured on
    // `concerned-circumstances-187935`, the card `framer-1ubp4ee-container`
    // with `hidden-72rtr7 hidden-bq06c3`.
    const body =
      `<div class="framer-card hidden-desk hidden-tab">` +
      `<p>BERRY BLISS</p><p>$7.50 USD</p>` +
      `</div>`;
    const nodes = mappedOf(page(body, BREAKPOINTS));
    const card = Object.values(nodes).find((node) => node.props["text"] === undefined && node.primitive === "frame" && node.visibleDevices !== undefined);
    expect(card).toBeDefined();
    // Only mobile: the two hashes name desktop and tablet.
    expect(card?.visibleDevices).toEqual(["mobile"]);
    // Hidden by default, shown again on the device it belongs to.
    expect(card?.hidden).toBe(true);
    // And NOT painted out: `display:none` would hide it on mobile too, because
    // the base value is inherited by every device.
    expect(card?.props["display"]).not.toBe("none");
  });

  it("keeps the mobile override that shows the node again", () => {
    const body = `<div class="framer-card hidden-desk hidden-tab"><p>Nur mobil</p></div>`;
    const nodes = mappedOf(page(body, BREAKPOINTS));
    const card = Object.values(nodes).find((node) => node.visibleDevices !== undefined && node.primitive === "frame");
    expect(card?.hidden).toBe(true);
    // The engine turns `hidden: true` + `visibleDevices` into an explicit
    // `overrides.mobile.hidden = false`; without it the node stays invisible.
    expect(card?.visibleDevices).toContain("mobile");
  });

  it("does not let the breakpoint rule leak into the look of a normal element", () => {
    // A plain visible box that happens to carry a hidden hash of ANOTHER device
    // still keeps its own layout — the hash must not eat its `display`.
    const body = `<div class="framer-box hidden-mob" style="display:flex;width:100px;height:40px"><p>Box</p></div>`;
    const nodes = mappedOf(page(body, BREAKPOINTS));
    const box = Object.values(nodes).find((node) => node.primitive === "frame" && node.props["width"] !== undefined);
    expect(box).toBeDefined();
    expect(box?.props["display"]).toBe("flex");
    expect(box?.visibleDevices).toEqual(["desktop", "tablet"]);
  });

  it("still reads the wrapper form (ssr-variant) unchanged", () => {
    // The older, already covered shape: the hashes ride on the wrapper.
    const body =
      `<div class="ssr-variant hidden-tab hidden-mob"><div class="framer-x"><p>A</p></div></div>` +
      `<div class="ssr-variant hidden-desk hidden-mob"><div class="framer-x"><p>B</p></div></div>` +
      `<div class="ssr-variant hidden-desk hidden-tab"><div class="framer-x"><p>C</p></div></div>`;
    const nodes = mappedOf(page(body, BREAKPOINTS));
    const visibilities = Object.values(nodes)
      .filter((node) => node.visibleDevices !== undefined && node.primitive === "frame")
      .map((node) => (node.visibleDevices ?? []).slice().sort())
      .sort();
    expect(visibilities).toEqual([["desktop"], ["mobile"], ["tablet"]]);
  });
});
