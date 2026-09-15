import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);

function packageRoot(packageName: string): string {
  // Direct dependencies are always linked into the package's own
  // node_modules; name-based resolution fails for packages like pagefind
  // that define no exports main.
  const linked = join(packageDir, "node_modules", packageName);
  if (existsSync(join(linked, "package.json"))) return linked;
  let dir = dirname(require.resolve(packageName, { paths: [packageDir] }));
  while (true) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
        name?: string;
      };
      if (parsed.name === packageName) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate the root of ${packageName}`);
    }
    dir = parent;
  }
}

function binPath(packageName: string, binName: string): string {
  const root = packageRoot(packageName);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const entry =
    typeof pkg.bin === "string"
      ? pkg.bin
      : (pkg.bin?.[binName] ?? Object.values(pkg.bin ?? {})[0]);
  if (!entry) throw new Error(`${packageName} exposes no bin entry`);
  return join(root, entry);
}

function run(tool: string, bin: string, args: string[]): void {
  const result = spawnSync(process.execPath, [binPath(tool, bin), ...args], {
    cwd: packageDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${tool} failed:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
}

describe("portal build (Prüfstelle Portal)", () => {
  let dist: string;

  beforeAll(() => {
    dist = join(packageDir, "dist");
    rmSync(dist, { recursive: true, force: true });
    run("astro", "astro", ["build"]);
    run("pagefind", "pagefind", ["--site", "dist"]);
  }, 240000);

  function read(path: string): string {
    return readFileSync(join(dist, path), "utf8");
  }

  it("builds every page and the agent exports statically", () => {
    expect(existsSync(join(dist, "index.html"))).toBe(true);
    expect(read("getting-started/index.html")).toContain("Getting Started");
    expect(read("reference/tools/index.html")).toContain("apply_mutations");
    expect(read("reference/sections/hero/index.html")).toContain("Golden Example");
    expect(read("reference/errors/index.html")).toContain("guardrail");
    expect(read("guides/site-aus-brief/index.html")).toContain("Master-Flow");
  });

  it("serves the markdown twin of every page", () => {
    expect(read("reference/tools.md").startsWith("# Tools\n")).toBe(true);
    expect(read("getting-started.md")).toContain("# Getting Started");
    expect(read("guides/assets.md")).toContain("# Assets beschaffen");
  });

  it("writes llms.txt and llms-full.txt from the same corpus", () => {
    const index = read("llms.txt");
    expect(index.startsWith("# Senify\n")).toBe(true);
    expect(index).toContain("## Reference");
    expect(index).toContain("- [Tools](/reference/tools.md)");
    const full = read("llms-full.txt");
    expect(full).toContain("# Hero");
    expect(full).toContain("# Getting Started");
  });

  it("ships the pagefind index and the client scripts", () => {
    expect(existsSync(join(dist, "pagefind", "pagefind.js"))).toBe(true);
    expect(existsSync(join(dist, "pagefind", "pagefind-ui.js"))).toBe(true);
    const chunks = readdirSync(join(dist, "_astro"));
    const bundled = chunks
      .filter((name) => name.endsWith(".js"))
      .map((name) => read(join("_astro", name)))
      .join("\n");
    expect(bundled).toContain("portal-config.json");
  });
});