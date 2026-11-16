import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapDocument, mapUnframerProject, normalize } from "@senify/framer-import";

const FIXTURE = fileURLToPath(new URL("./fixtures/unframer/components", import.meta.url));
const CAPTURED = "2026-11-15T12:00:00.000Z";

type MappedNode = { primitive: string; props: Record<string, unknown> };

describe("Projekt-XML: benannte Framer-Komponenten als DOM-Widgets (ADR-0038)", () => {
  it("bildet Navbar, Step 2, Ticker reviews item und Footer 2 auf Widgets ab", () => {
    const document = mapUnframerProject({
      projectXml: readFileSync(`${FIXTURE}/project.xml`, "utf8"),
      pages: [{ path: "/", xml: readFileSync(`${FIXTURE}/page.xml`, "utf8") }],
      capturedAt: CAPTURED,
    });
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const nodes = Object.values(mapped.document.nodes) as MappedNode[];
    const byPrimitive = new Map(nodes.map((node) => [node.primitive, node]));

    expect(byPrimitive.has("framer-navbar")).toBe(true);
    expect(byPrimitive.has("framer-footer")).toBe(true);
    expect(byPrimitive.has("framer-reviews")).toBe(true);
    const step = byPrimitive.get("framer-step");
    expect(step).toBeDefined();
    expect(step?.props["nr"]).toBe("01");
    expect(step?.props["title"]).toBe("Webdesign");
    expect(step?.props["text"]).toBe("Ich gestalte Webseiten.");
    expect(step?.props["points"]).toEqual([
      { label: "Klare Layouts:", text: "Ruhige Farben." },
      { label: "Responsiv:", text: "Auf jedem Gerät." },
    ]);

    // Keine Platte für diese vier: der Placeholder-Zähler bleibt bei null.
    expect(mapped.stats.placeholders).toBe(0);
    const info = mapped.findings.filter((finding) => finding.kind === "code-component" && finding.severity === "info");
    expect(info).toHaveLength(4);
    expect(info.map((finding) => finding.message).join("\n")).toContain("framer-footer");
  });

  it("mappt Hero-Autor, Buttons, Statistik-Ticker und View-all samt Instanzwerten", () => {
    const projectXml = `<Project>
      <Pages><Page nodeId="p" path="/" /></Pages>
      <Components>
        <Component nodeId="c-avatar" name="Avatar &amp; info" />
        <Component nodeId="c-button" name="Button" />
        <Component nodeId="c-button2" name="Button 2" />
        <Component nodeId="c-ticker" name="Ticker" />
        <Component nodeId="c-viewall" name="View all 2" />
      </Components>
    </Project>`;
    const pageXml = `<Desktop nodeId="d" width="1200px">
      <AvatarInfo nodeId="a" width="fit-content" componentId="c-avatar" variant="v1" iWJIQRIQk="Adrian Nick" vqHnFkhQ0="Webdesigner, Entwickler" />
      <Button nodeId="b" width="fit-content" height="70px" componentId="c-button" variant="v2" erbCBAez1="Was ich für dich tun kann?" J2FI0NDh9="false" l1gPDCIox="#service" />
      <Button2 nodeId="b2" width="fit-content" componentId="c-button2" variant="v3" erbCBAez1="Projekt anfragen" J2FI0NDh9="false" />
      <Ticker nodeId="t" width="1fr" componentId="c-ticker" variant="v4" ocoluOEZo="65" eBqMtzQHE="11+ " WFUNR5_Ok="Jahre Erfahrung" mWirz3oxs="95%" U7MJejad2="Weiterempfehlungsrate" kpxbnMuh9="100%" tinhmYfS8="zufriedene Kunden" wZIgtp_0x="114" WuukyzOlW="abgeschlossene Projekte" />
      <ViewAll2 nodeId="v" width="1fr" height="1fr" componentId="c-viewall" variant="v5" vZVzlwRQh="Alle Referenzen ansehen" />
    </Desktop>`;
    const document = mapUnframerProject({
      projectXml,
      pages: [{ path: "/", xml: pageXml }],
      capturedAt: CAPTURED,
    });
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const nodes = Object.values(mapped.document.nodes) as MappedNode[];
    const byPrimitive = new Map(nodes.map((node) => [node.primitive, node]));

    expect(byPrimitive.get("framer-avatar-info")?.props).toMatchObject({
      name: "Adrian Nick",
      role: "Webdesigner, Entwickler",
    });
    expect(byPrimitive.get("framer-button")?.props).toMatchObject({
      label: "Projekt anfragen",
      variant: "primary",
    });
    const buttons = nodes.filter((node) => node.primitive === "framer-button");
    expect(buttons.some((node) => node.props["label"] === "Was ich für dich tun kann?" && node.props["variant"] === "ghost" && node.props["link"] === "#service")).toBe(true);
    expect(byPrimitive.get("framer-stats")?.props).toMatchObject({
      speed: 65,
      items: [
        { value: "11+", label: "Jahre Erfahrung" },
        { value: "95%", label: "Weiterempfehlungsrate" },
        { value: "100%", label: "zufriedene Kunden" },
        { value: "114", label: "abgeschlossene Projekte" },
      ],
    });
    expect(byPrimitive.get("framer-view-all")?.props).toMatchObject({ label: "Alle Referenzen ansehen" });
    expect(mapped.stats.placeholders).toBe(0);
  });

  it("lässt unbekannte Komponenten weiter als Rahmen stehen", () => {
    const document = mapUnframerProject({
      projectXml: `<Project><Pages><Page nodeId="p" path="/" /></Pages><Components><Component nodeId="c" name="Mystery" /></Components></Project>`,
      pages: [{ path: "/", xml: `<Desktop nodeId="d" width="1200px"><Mystery nodeId="m" width="1fr" componentId="c" /></Desktop>` }],
      capturedAt: CAPTURED,
    });
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const nodes = Object.values(mapped.document.nodes) as MappedNode[];
    expect(nodes.some((node) => node.primitive === "frame")).toBe(true);
    expect(nodes.some((node) => node.primitive.startsWith("framer-"))).toBe(false);
    const finding = mapped.findings.find((entry) => entry.kind === "component-instance");
    expect(finding?.severity).toBe("warn");
    expect(finding?.message).toContain("Mystery");
  });
});
