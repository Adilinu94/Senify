import { describe, expect, it } from "vitest";
import { captureHtml } from "../src/capture-html.ts";
import { mapDocument, normalize } from "../src/index.ts";

const page = (body: string): string =>
  `<html lang="en"><head><title>t</title></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

function pipeline(body: string) {
  const document = captureHtml({ html: page(body), url: "https://relay.example/contact" });
  const mapped = mapDocument(document, normalize(document, { mode: "fidelity" }).rules);
  return { document, mapped };
}

function irNode(document: ReturnType<typeof pipeline>["document"]) {
  const nodes: unknown[] = [];
  const walk = (node: { kind: string; children: unknown[] }): void => {
    nodes.push(node);
    for (const child of node.children) walk(child as { kind: string; children: unknown[] });
  };
  walk(document.pages[0]!.root);
  return nodes.find((node) => (node as { kind: string }).kind === "embed") as
    | { embedUrl?: string | null; embedTitle?: string | null; embedBlocked?: string | null }
    | undefined;
}

describe("a third-party iframe", () => {
  it("keeps an https frame as the embed primitive with address and title", () => {
    const { document, mapped } = pipeline(
      `<div><iframe src="https://calendly.com/relay/30min" title="Termin buchen" style="width:100%;height:600px"></iframe></div>`,
    );
    expect(irNode(document)?.embedUrl).toBe("https://calendly.com/relay/30min");
    expect(irNode(document)?.embedTitle).toBe("Termin buchen");
    expect(irNode(document)?.embedBlocked).toBeNull();

    const embed = Object.values(mapped.document.nodes).find((node) => node.primitive === "embed");
    expect(embed).toBeDefined();
    expect(embed?.props["url"]).toBe("https://calendly.com/relay/30min");
    expect(embed?.props["title"]).toBe("Termin buchen");
    expect(mapped.findings.some((finding) => finding.kind === "embed-blocked")).toBe(false);
  });

  it("reports a srcdoc frame and keeps a visible placeholder", () => {
    const { document, mapped } = pipeline(
      `<div><iframe srcdoc="&lt;p&gt;Termin&lt;/p&gt;" title="Termin"></iframe></div>`,
    );
    expect(irNode(document)?.embedBlocked).toBe("srcdoc");
    const embed = Object.values(mapped.document.nodes).find((node) => node.primitive === "embed");
    expect(embed).toBeDefined();
    expect(embed?.props["url"]).toBeUndefined();
    const finding = mapped.findings.find((entry) => entry.kind === "embed-blocked");
    expect(finding?.evidence).toBe("iframe[srcdoc]");
    expect(finding?.message).toContain("srcdoc");
  });

  it("reports a non-https frame instead of handing the address on", () => {
    const { document, mapped } = pipeline(
      `<div><iframe src="http://insecure.example/embed" title="Alt"></iframe></div>`,
    );
    expect(irNode(document)?.embedBlocked).toBe("scheme");
    const embed = Object.values(mapped.document.nodes).find((node) => node.primitive === "embed");
    expect(embed?.props["url"]).toBeUndefined();
    const finding = mapped.findings.find((entry) => entry.kind === "embed-blocked");
    expect(finding?.evidence).toContain("http://insecure.example/embed");
  });

  it("reports a frame without an address", () => {
    const { document, mapped } = pipeline(`<div><iframe title="Leer"></iframe></div>`);
    expect(irNode(document)?.embedBlocked).toBe("missing");
    expect(mapped.findings.some((entry) => entry.kind === "embed-blocked")).toBe(true);
  });

  it("leaves an ordinary frame without a finding", () => {
    const { document, mapped } = pipeline(`<div><div style="width:10px;height:10px"></div></div>`);
    expect(irNode(document)).toBeUndefined();
    expect(mapped.findings.some((entry) => entry.kind === "embed-blocked")).toBe(false);
  });
});
