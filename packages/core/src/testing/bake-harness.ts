import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type BakedSite = {
  rootDir: string;
  exists(relPath: string): Promise<boolean>;
  read(relPath: string): Promise<string>;
  readJson<T>(relPath: string): Promise<T>;
};

export function loadBakedSite(rootDir: string): BakedSite {
  return {
    rootDir,
    async exists(relPath: string): Promise<boolean> {
      try {
        await stat(join(rootDir, relPath));
        return true;
      } catch {
        return false;
      }
    },
    async read(relPath: string): Promise<string> {
      return readFile(join(rootDir, relPath), "utf8");
    },
    async readJson<T>(relPath: string): Promise<T> {
      return JSON.parse(await readFile(join(rootDir, relPath), "utf8")) as T;
    },
  };
}