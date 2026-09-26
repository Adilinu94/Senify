import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Content hash of a baked build (E2, release manifest): every file with its
// relative path and bytes, sorted, folded into one SHA-256. The manifest
// records it so a rollback can prove it delivered the same output for the same
// renderer version. Form pages carry freshly signed tokens per bake, so the
// guarantee is exact for static pages and semantic for form pages (documented).
export function hashBuildDir(dir: string): string {
  const hash = createHash("sha256");
  if (!existsSync(dir)) return hash.digest("hex");
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      files.push(full);
    }
  };
  walk(dir);
  files.sort();
  for (const file of files) {
    const rel = relative(dir, file).split(sep).join("/");
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}
