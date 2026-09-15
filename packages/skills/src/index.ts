import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type SkillFile = {
  name: string;
  path: string;
  content: string;
};

const skillsPath = fileURLToPath(new URL("../skills", import.meta.url));

export function skillsDir(): string {
  return skillsPath;
}

// The skill pack ships as plain markdown: agents read it directly, the CLI
// copies it next to the local config during `senify setup`.
export function skillFiles(): SkillFile[] {
  return readdirSync(skillsPath)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const path = join(skillsPath, name);
      return { name, path, content: readFileSync(path, "utf8") };
    });
}
