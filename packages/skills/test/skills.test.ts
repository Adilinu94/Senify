import { describe, expect, it } from "vitest";
import { skillFiles, skillsDir } from "@senify/skills";

describe("senify skill pack", () => {
  it("ships the router, the master flow and the asset guide", () => {
    const files = skillFiles();
    const names = files.map((file) => file.name);
    // Der Router darf neue Referenzdateien bekommen, ohne dass dieser Test
    // mitwachsen muss: der Vertrag prueft die Kernbestandteile, nicht die
    // vollstaendige Liste.
    expect(names).toEqual(
      expect.arrayContaining([
        "assets.md",
        "images.md",
        "motion.md",
        "router.md",
        "senify-referenz-redesign.md",
        "workflow.md",
      ]),
    );
    expect(skillsDir()).toContain("skills");
  });

  it("routes agents to the core tools and ground rules", () => {
    const router = skillFiles().find((file) => file.name === "router.md");
    expect(router?.content).toContain("apply_mutations");
    expect(router?.content).toContain("get_section");
    expect(router?.content).toContain("Tokens before literals");
    expect(router?.content).toContain("Drafts first");
  });

  it("documents the asset workflow with licence and alt-text rules", () => {
    const assets = skillFiles().find((file) => file.name === "assets.md");
    expect(assets?.content).toContain("upload_asset");
    expect(assets?.content).toContain("Alt-Text");
    expect(assets?.content).toContain("Lizenz");
    expect(assets?.content).toContain("image-use");
    expect(assets?.content).toContain("generate_image");
  });

  it("documents the image flow end to end (prompt → job → poll → assetRef)", () => {
    const images = skillFiles().find((file) => file.name === "images.md");
    expect(images?.content).toContain("get_reference_brief");
    expect(images?.content).toContain("generate_image");
    expect(images?.content).toContain("get_image_job");
    expect(images?.content).toContain("providerUsed");
    expect(images?.content).toContain("assetRef");
    expect(images?.content).toContain("image-use");
    expect(images?.content).toContain("Vielfache von 32");
    expect(images?.content).toContain("Qwen Research License");
    const router = skillFiles().find((file) => file.name === "router.md");
    expect(router?.content).toContain("generate_image");
    expect(router?.content).toContain("images.md");
  });

  it("keeps the reference redesign workflow executable and bounded", () => {
    const redesign = skillFiles().find((file) => file.name === "senify-referenz-redesign.md");
    expect(redesign).toBeDefined();
    for (const tool of [
      "search_references",
      "get_reference",
      "plan_redesign",
      "create_redesign_proposal",
      "get_redesign_proposal",
      "get_page",
      "get_section",
      "apply_mutations",
      "diff_reference",
      "get_design_report",
      "create_preview",
      "submit_for_review",
    ]) {
      expect(redesign?.content).toContain(tool);
    }
    // The direction is a human decision: the skill must say so and must not
    // hand the agent a way to confirm it.
    expect(redesign?.content).toContain("Die Richtung selbst wählt **ein Mensch**");
    expect(redesign?.content).toContain("kein** Bestätigungs-Werkzeug");
    expect(redesign?.content).not.toContain("referenceIds: [chosenReferenceId]");
    expect(redesign?.content).toContain("idempotencyKey");
    expect(redesign?.content).toContain("## Fertig, wenn");
    expect(redesign?.content).toContain("publish_release` erst nach ausdrücklicher menschlicher Freigabe");
    const router = skillFiles().find((file) => file.name === "router.md");
    expect(router?.content).toContain("senify-referenz-redesign.md");
  });

  it("keeps the master flow in stage order", () => {
    const workflow = skillFiles().find((file) => file.name === "workflow.md");
    expect(workflow?.content).toContain("## 1. Brief verstehen");
    expect(workflow?.content).toContain("## 4. Seiten bauen");
    expect(workflow?.content).toContain("submit_for_review");
    expect(workflow?.content).toContain("## 8. Übergabe");
  });
});
