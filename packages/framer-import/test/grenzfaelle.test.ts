import { describe, expect, it } from "vitest";
import { captureHtml, mapDocument, normalize } from "../src/index.ts";

// Die drei Punkte, die `docs/current/stand.md` als "nicht untersucht" führt,
// jeder als Probe: der Fall wird festgehalten, damit sein Verhalten belegt
// ist - und eine Aenderung daran sofort auffaellt.

const page = (body: string, css = "", head = ""): string =>
  `<html lang="en"><head><title>t</title>${head}<style>${css}</style></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

function run(html: string) {
  const document = captureHtml({ html });
  const normalized = normalize(document, { mode: "fidelity" });
  const mapped = mapDocument(document, normalized.rules);
  const nodes = Object.values(mapped.document.nodes).filter((node) => node.primitive !== "root");
  return { document, normalized, mapped, nodes };
}

describe("Grenzfaelle, die stand.md als nicht untersucht fuehrt", () => {
  it("liest ein Hintergrundbild aus der Kurzform als Hintergrundbild", () => {
    // Die Stiltabelle liest `background` als Farbe. Ein Bild in der Kurzform
    // (der Verlauf auf der Karte, das Bild hinter dem Text) ist kein Farbwert,
    // sondern ein Hintergrundbild - sonst faellt es weg.
    const { nodes } = run(page('<div style="background: url(assets/bild.png)"></div>'));
    expect(nodes[0]?.props["backgroundImage"]).toBe("url(assets/bild.png)");
    expect(nodes[0]?.props["background"]).toBeUndefined();
  });

  it("nimmt fuer ein Token die Definition, die fuer die Geraetebreite gilt", () => {
    // Framer definiert ein Token manchmal im Media-Block. Der Browser zeigt
    // dort den Wert des Blocks; der Import muss dasselbe nehmen.
    const TOKEN = "--token-11111111-2222-3333-4444-555555555555";
    const css = `:root{${TOKEN}:#111111}@media (max-width:809px){:root{${TOKEN}:#222222}}.fx{color:var(${TOKEN}, #000000)}`;
    const { mapped } = run(
      page(`<div class="fx" style="color: var(${TOKEN}, #000000)">Text</div>`, css),
    );
    const knoten = Object.values(mapped.document.nodes).filter((node) => node.primitive !== "root");
    const mitFarbe = knoten.find((node) => node.props["color"] !== undefined);
    expect(mitFarbe?.props["color"]).toContain("#111111");
    expect(mitFarbe?.props["color_mobile"]).toContain("#222222");
  });

  it("trifft eine Varianten-Regel mit :not() und die unter einem Media-Block", () => {
    // Framer schreibt die Regeln einer Variante unter deren Klasse. Eine
    // `:not()`-Bedingung und ein Media-Block duerfen die Regel nicht
    // verlieren.
    const css = `.framer-C.framer-v-abc:not(.framer-v-def){color:#00ff00}`;
    const { nodes } = run(page('<div class="framer-C framer-v-abc">Variante</div>', css));
    const farbe = nodes.find((node) => node.props["color"] !== undefined)?.props["color"];
    expect(farbe).toBe("#00ff00");
  });
});
