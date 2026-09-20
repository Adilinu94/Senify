import { describe, expect, it } from "vitest";
import { buildDocumentProfile } from "@senify/engine";

// The document parser: design.md tables become a profile the scale engine can
// derive a theme from. The fixtures are cut down copies of real imports (dark
// mono template, light editorial template) plus the two edge cases the import
// run actually showed: an implausible "Body" row and a document without tables.

const DARK_MONO = [
  "# Achilles Design System - Token Reference",
  "",
  "> Always read this file first.",
  "",
  "Achilles is a dark-themed Framer template design system (preview: https://getachilles.framer.ai/). Design language: black canvas with green code-curtain glow, mono typography, terminal UI. Core typeface: **Geist Mono, Inter**, base spacing unit 4px.",
  "",
  "## Colors",
  "",
  "### Accent - Primary",
  "",
  "| Role | Hex | Usage |",
  "|------|-----|-------|",
  "| primary | `#00E07A` | CTAs, highlights |",
  "| on-primary | `#141414` | Text on primary |",
  "",
  "### Surface & Neutral",
  "",
  "| Role | Hex | Usage |",
  "|------|-----|-------|",
  "| background | `#141414` | Page canvas |",
  "| ink / textPrimary | `#FFFFFF` | Headlines, body copy |",
  "| border (inferred) | `#26292B` | Hairlines |",
  "",
  "## Typography",
  "",
  "Font family: **Geist Mono, Inter**, fallback `system-ui, sans-serif`.",
  "",
  "| Style | Size | Weight | Line Height | Spacing |",
  "|-------|------|--------|-------------|---------|",
  "| Display (H1) | 40px | 500-600 | 1.05-1.15 | -0.02em (inferred) |",
  "| Body | 14px | 400 | 1.6 | 0 |",
  "",
  "## Shape",
  "",
  "| Token | Radius | Components |",
  "|-------|--------|------------|",
  "| Base | 0px | Cards |",
  "| Button | 8px | Primary buttons |",
  "",
  "## Elevation",
  "",
  "| Level | CSS Shadow | Usage |",
  "|-------|-----------|-------|",
  "| 0 | none | Base surface |",
  "| 1 | `0 8px 32px rgb(0 0 0/.12)` | Modals |",
  "",
  "## Motion",
  "",
  "| Token | Value | Usage |",
  "|-------|-------|-------|",
  "| ease-out | `cubic-bezier(0.16, 1, 0.3, 1)` | Reveals |",
  "| duration-medium | 500ms | Section fade |",
  "",
].join("\n");

const DARK_GUIDELINES = [
  "# Achilles - Guidelines",
  "",
  "## Do's",
  "",
  "- Keep the mono headline on a single idea per line.",
  "- Use the green accent for one action per view.",
  "",
  "## Don'ts",
  "",
  "- Never place two green CTAs in the same viewport.",
  "- Don't mix pill and sharp corners in one row.",
  "",
  "## Accessibility",
  "",
  "- Contrast ratios sit at or above AA for all text.",
  "- Never set body text below 14px on dark ground.",
  "",
].join("\n");

const DARK_COMPONENTS = [
  "# Achilles - Components",
  "",
  "## Actions",
  "",
  "### Button (Primary)",
  "",
  "### Link",
  "",
  "## Navigation",
  "",
  "### Navbar",
  "",
].join("\n");

// The artefact case: a "Body" row far outside any plausible body size.
const IMPLAUSIBLE = [
  "# Alta Design System - Token Reference",
  "",
  "Alta is a light brand-studio template with an oversized editorial headline and quiet surfaces.",
  "",
  "## Typography",
  "",
  "Font family: **Inter, Switzer**, fallback `system-ui, sans-serif`.",
  "",
  "| Style | Size | Weight | Line Height | Spacing |",
  "|-------|------|--------|-------------|---------|",
  "| Display (H1) | 96px | 500-600 | 1.05 | -0.02em |",
  "| Body | 96px | 400 | 1.6 | 0 |",
  "| Label / Button | 16px | 500 | 1 | 0 |",
  "",
].join("\n");

describe("document profile", () => {
  it("reads colors, type, families, shape and motion from design.md", () => {
    const { profile } = buildDocumentProfile({
      name: "Achilles",
      design: DARK_MONO,
      components: DARK_COMPONENTS,
    });
    const color = (role: string): string | undefined =>
      profile.tokens.color.find((token) => token.role === role)?.value;
    expect(color("primary")).toBe("#00E07A");
    expect(color("background")).toBe("#141414");
    expect(color("ink")).toBe("#FFFFFF");
    expect(color("border")).toBe("#26292B");
    expect(profile.tokens.type.map((step) => [step.role, step.size])).toEqual([
      ["display", "40px"],
      ["body", "14px"],
    ]);
    expect(profile.tokens.families.map((token) => [token.role, token.value])).toEqual([
      ["display", "Geist Mono"],
      ["body", "Inter"],
    ]);
    expect(profile.tokens.radius.map((token) => [token.role, token.value])).toEqual([
      ["base", "0px"],
      ["button", "8px"],
    ]);
    expect(profile.tokens.space[0]?.value).toBe("4px");
    expect(profile.tokens.shadow.map((token) => token.value)).toEqual([
      "0 8px 32px rgb(0 0 0/.12)",
    ]);
    expect(profile.motion.map((recipe) => [recipe.name, recipe.params])).toEqual([
      ["ease-out", { timing: "cubic-bezier(0.16, 1, 0.3, 1)" }],
      ["duration-medium", { duration: "500ms" }],
    ]);
    expect(profile.components.map((component) => component.name)).toEqual([
      "Actions",
      "Navigation",
    ]);
    expect(profile.components[0]?.variants).toEqual(["Button (Primary)", "Link"]);
  });

  it("marks inferred rows as inferred and documented ones as observed", () => {
    const { profile, evidence } = buildDocumentProfile({ name: "Achilles", design: DARK_MONO });
    const border = profile.tokens.color.find((token) => token.role === "border");
    const background = profile.tokens.color.find((token) => token.role === "background");
    expect(border?.level).toBe("inferred");
    expect(background?.level).toBe("observed");
    const claim = evidence.find((entry) => entry.claim === "color.background = #141414");
    expect(claim?.level).toBe("observed");
    expect(claim?.source).toBe("design.md#colors");
  });

  it("takes constants and never-rules out of the guidelines", () => {
    const { profile } = buildDocumentProfile({
      name: "Achilles",
      design: DARK_MONO,
      guidelines: DARK_GUIDELINES,
      components: DARK_COMPONENTS,
    });
    expect(profile.rules.constants).toContain("Keep the mono headline on a single idea per line.");
    expect(profile.rules.constants).toContain("Contrast ratios sit at or above AA for all text.");
    expect(profile.rules.never).toEqual([
      "Never place two green CTAs in the same viewport.",
      "Don't mix pill and sharp corners in one row.",
      "Never set body text below 14px on dark ground.",
    ]);
  });

  it("drops an implausible body row and promotes the documented label size", () => {
    const { profile, evidence } = buildDocumentProfile({ name: "Alta", design: IMPLAUSIBLE });
    expect(profile.tokens.type.map((step) => [step.role, step.size])).toEqual([
      ["display", "96px"],
      ["body", "16px"],
    ]);
    expect(
      evidence.some((entry) => entry.claim === "type.body = 96px (verworfen, unplausibel)"),
    ).toBe(true);
    expect(
      evidence.some((entry) => entry.claim === "type.body = 16px (aus label uebernommen)"),
    ).toBe(true);
  });

  it("survives a document without tables and writes a style brief", () => {
    const { profile, evidence } = buildDocumentProfile({
      name: "Leer",
      design: "# Ohne Tabellen\n\nNur ein Satz ohne Messwerte, aber lang genug fuer den Brief.",
    });
    expect(profile.tokens.color).toEqual([]);
    expect(profile.tokens.type).toEqual([]);
    expect(evidence).toEqual([]);
    expect(profile.styleBrief).toContain("Reference Leer (Design.md) (documents");
    expect(profile.guardrails.length).toBeGreaterThan(0);
    expect(profile.reduced).toBe(false);
  });

  it("uses the source url in the brief and keeps the guardrails", () => {
    const { profile } = buildDocumentProfile({
      name: "Achilles",
      sourceUrl: "https://getachilles.framer.ai/",
      design: DARK_MONO,
      guidelines: DARK_GUIDELINES,
    });
    expect(profile.styleBrief.split("\n")[0]).toContain("https://getachilles.framer.ai/");
    expect(profile.guardrails.some((finding) => finding.code === "original-copy")).toBe(true);
  });
});
