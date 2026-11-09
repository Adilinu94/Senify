import { describe, expect, it } from "vitest";
import type { NodeTree } from "@senify/section-sdk";
import { auditFramerRuntime } from "../src/runtime-audit.ts";

function treeWithPayload(coversPage: boolean, active?: boolean): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page-root", props: {}, parentId: null, children: ["payload"] },
      payload: {
        id: "payload",
        type: "payload",
        props: { coversPage, ...(active === undefined ? {} : { active }) },
        parentId: "root",
        children: [],
      },
    },
  } as unknown as NodeTree;
}

describe("auditFramerRuntime", () => {
  it("bestaetigt einen aktiven seitenweiten Traeger", () => {
    const result = auditFramerRuntime({ html: "<p>Hallo</p>", tree: treeWithPayload(true) });
    expect(result.verdict).toBe("confirmed");
    expect(result.signals).toContainEqual(
      expect.objectContaining({ kind: "page-carrier", strength: "runtime" }),
    );
  });

  it("bestaetigt ein Framer-Skript von einem Framer-Host", () => {
    const result = auditFramerRuntime({
      html: '<p>Hallo</p><script src="https://framerusercontent.com/runtime.js"></script>',
    });
    expect(result.verdict).toBe("confirmed");
    expect(result.signals).toContainEqual(
      expect.objectContaining({ kind: "framer-host-script", strength: "runtime" }),
    );
  });

  it("bestaetigt einen Framer-Marker in einem lokalen Skript", () => {
    const result = auditFramerRuntime({
      html: '<p>Hallo</p><script src="/runtime.js"></script>',
      scripts: [{ url: "/runtime.js", content: "window.__framer = { version: 1 };" }],
    });
    expect(result.verdict).toBe("confirmed");
    expect(result.signals).toContainEqual(
      expect.objectContaining({ kind: "framer-script", strength: "runtime" }),
    );
  });

  it("bestaetigt ein Framer-Global im Browser", () => {
    const result = auditFramerRuntime({ html: "<p>Hallo</p>", globals: ["__framer", "other"] });
    expect(result.verdict).toBe("confirmed");
  });

  it("widerlegt eine Seite ohne ausfuehrbaren Inhalt", () => {
    const result = auditFramerRuntime({ html: "<p>Hallo</p>" });
    expect(result.verdict).toBe("refuted");
    expect(result.openQuestions).toEqual([]);
  });

  it("widerlegt eine Seite, deren einziges Skript geprueft und ohne Framer-Marker ist", () => {
    const result = auditFramerRuntime({
      html: '<script src="/app.js"></script><p>Hallo</p>',
      scripts: [{ url: "/app.js", content: 'console.log("app");' }],
    });
    expect(result.verdict).toBe("refuted");
    expect(result.signals).toContainEqual(
      expect.objectContaining({ kind: "script-inspected", strength: "neutral" }),
    );
  });

  it("widerlegt die Runtime trotz Framer-Host-Abhaengigkeit fuer ein Bild", () => {
    const result = auditFramerRuntime({
      html: "<p>Hallo</p>",
      network: [{ url: "https://framerusercontent.com/images/hero.png", resourceType: "image" }],
    });
    expect(result.verdict).toBe("refuted");
    expect(result.openQuestions.some((question) => question.includes("Framer-Host-Abhaengigkeit"))).toBe(
      true,
    );
  });

  it("bleibt unbekannt, wenn ein lokales Skript nicht geprueft wurde", () => {
    const result = auditFramerRuntime({ html: '<script src="/app.js"></script><p>Hallo</p>' });
    expect(result.verdict).toBe("unknown");
    expect(result.openQuestions.some((question) => question.includes("/app.js"))).toBe(true);
  });

  it("bleibt unbekannt bei einem Inline-Skript, das weitere Skripte nachlaedt", () => {
    const html =
      '<script>var s=document.createElement("script");s.src="/app.js";document.body.appendChild(s);</script><p>Hallo</p>';
    const result = auditFramerRuntime({ html });
    expect(result.verdict).toBe("unknown");
    expect(result.signals).toContainEqual(
      expect.objectContaining({ kind: "dynamic-loading", strength: "unknown" }),
    );
  });

  it("bleibt unbekannt bei einem dynamischen Import in einem geprueften Skript", () => {
    const result = auditFramerRuntime({
      html: '<script src="/app.js"></script>',
      scripts: [{ url: "/app.js", content: 'import("/chunk.js");' }],
    });
    expect(result.verdict).toBe("unknown");
  });

  it("bleibt unbekannt bei einem iframe", () => {
    const result = auditFramerRuntime({ html: '<iframe src="https://example.com/"></iframe>' });
    expect(result.verdict).toBe("unknown");
  });

  it("bleibt unbekannt bei einem Teil-Payload", () => {
    const result = auditFramerRuntime({ html: "<p>Hallo</p>", tree: treeWithPayload(false) });
    expect(result.verdict).toBe("unknown");
  });

  it("bestaetigt auch dann, wenn zugleich unbekannte Signale vorliegen", () => {
    const result = auditFramerRuntime({
      html: '<script src="/runtime.js"></script>',
      tree: treeWithPayload(false),
      scripts: [{ url: "/runtime.js", content: "window.__framer = {};" }],
    });
    expect(result.verdict).toBe("confirmed");
  });

  it("fehlende Framer-Host-Anfragen allein widerlegen die Runtime nicht", () => {
    const result = auditFramerRuntime({
      html: '<script>eval("var x = 1;");</script>',
      network: [],
      tree: undefined,
    });
    expect(result.verdict).toBe("unknown");
  });
});
