import { describe, expect, it } from "vitest";
import { skillFiles, skillsDir } from "@senify/skills";

describe("senify skill pack", () => {
  it("ships the router, the master flow and the asset guide", () => {
    const files = skillFiles();
    const names = files.map((file) => file.name);
    expect(names).toEqual(["assets.md", "motion.md", "router.md", "workflow.md"]);
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
  });

  it("keeps the master flow in stage order", () => {
    const workflow = skillFiles().find((file) => file.name === "workflow.md");
    expect(workflow?.content).toContain("## 1. Brief verstehen");
    expect(workflow?.content).toContain("## 4. Seiten bauen");
    expect(workflow?.content).toContain("submit_for_review");
    expect(workflow?.content).toContain("## 8. Übergabe");
  });
});
