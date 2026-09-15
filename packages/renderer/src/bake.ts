import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { SenifyError } from "@senify/core";
import { bundledSections } from "@senify/registry";
import { getSectionComponent } from "@senify/registry/components";
import type { NodeTree, SectionDefinition } from "@senify/section-sdk";
import {
  buildLlmsTxt,
  buildRobots,
  buildSitemap,
  collectJsonLd,
  pageToMarkdown,
} from "./aeo.ts";
import { islandsForTree } from "./islands.ts";
import {
  GSAP_CDN,
  LENIS_CDN,
  motionConfigsForTree,
  renderIslandsScript,
  renderPageScript,
  SCROLL_TRIGGER_CDN,
  SPLIT_TEXT_CDN,
  type MotionTokens,
} from "./motion.ts";
import { overridesCss } from "./style-css.ts";

export type BakePageInput = {
  id: string;
  path: string;
  title: string;
  description?: string;
  ogImage?: string;
  tree: NodeTree;
};

export type BakeInput = {
  siteName: string;
  baseUrl: string;
  pages: BakePageInput[];
  themeCss: string;
  motionTokens: MotionTokens;
  profile?: "clean" | "standard" | "showcase";
  assets?: Record<string, string>;
  fontPreloads?: { href: string }[];
  aeo?: boolean;
};

export type BakeWarning = {
  code?:
    | "pin-excess"
    | "char-split-excess"
    | "unimplemented-preset"
    | "invalid-jsonld"
    | "billing-silent"
    | "children-unrendered";
  page: string;
  nodeId?: string;
  message: string;
  suggestion?: string;
};

export type BakeResult = {
  outDir: string;
  pages: { path: string; file: string }[];
  warnings: BakeWarning[];
  jsBytes: number;
};

export type BakeOptions = {
  outDir?: string;
  keepWorkDir?: boolean;
  strict?: boolean;
};

export function jsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const rendererDir = dirname(fileURLToPath(import.meta.url));

function astroBin(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("astro/package.json", { paths: [rendererDir] });
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const entry =
    typeof pkg.bin === "string"
      ? pkg.bin
      : (pkg.bin?.astro ?? Object.values(pkg.bin ?? {})[0]);
  if (!entry) throw new Error("Astro package exposes no bin entry");
  return join(dirname(pkgPath), entry);
}

function assertBakeable(pages: BakePageInput[]): BakeWarning[] {
  const warnings: BakeWarning[] = [];
  if (pages.length === 0) {
    throw new SenifyError("validation", "Bake needs at least one page", {
      field: "pages",
      suggestion: "Pass the site pages with their draft trees.",
    });
  }
  const seen = new Set<string>();
  for (const page of pages) {
    if (!page.path.startsWith("/")) {
      throw new SenifyError("validation", `Invalid page path "${page.path}"`, {
        field: "pages.path",
        suggestion: 'Page paths start with "/".',
      });
    }
    if (seen.has(page.path)) {
      throw new SenifyError("validation", `Duplicate page path "${page.path}"`, {
        field: "pages.path",
        suggestion: "Page paths must be unique per site.",
      });
    }
    seen.add(page.path);
    if (page.title.trim() === "") {
      throw new SenifyError("validation", `Page "${page.path}" has an empty title`, {
        field: "pages.title",
        suggestion: "Every page needs a title for <title> and navigation.",
      });
    }
    const root = page.tree.nodes[page.tree.rootNodeId];
    if (!root) {
      throw new SenifyError(
        "validation",
        `Page "${page.path}" has a missing root node`,
        { field: "pages.tree" },
      );
    }
    for (const node of Object.values(page.tree.nodes)) {
      if (node.id === page.tree.rootNodeId) continue;
      if (!getSectionComponent(node.type)) {
        throw new SenifyError(
          "validation",
          `Page "${page.path}" uses unknown section "${node.type}"`,
          {
            field: "pages.tree",
            suggestion: "Use a registered section type from the catalog.",
          },
        );
      }
      if (
        node.id !== page.tree.rootNodeId &&
        (node.children?.length ?? 0) > 0
      ) {
        warnings.push({
          code: "children-unrendered",
          page: page.path,
          nodeId: node.id,
          message: `Node "${node.id}" (${node.type}) has children that no component renders`,
          suggestion: "Move the children to the page root or a slot.",
        });
      }
      if (
        node.type === "pricing" &&
        node.props.billingToggle === true &&
        !hasYearlyPrice(node)
      ) {
        warnings.push({
          code: "billing-silent",
          page: page.path,
          nodeId: node.id,
          message: `Pricing "${node.id}" enables the billing toggle without any yearly price`,
          suggestion: "Add priceYearly to at least one plan, or disable the toggle.",
        });
      }
    }
  }
  return warnings;
}

function hasYearlyPrice(node: { props: Record<string, unknown> }): boolean {
  const plans = node.props.plans;
  if (!Array.isArray(plans)) return false;
  return plans.some(
    (plan) =>
      typeof plan === "object" &&
      plan !== null &&
      typeof (plan as Record<string, unknown>).priceYearly === "string",
  );
}

function mdFileName(path: string): string {
  return path === "/" ? "index.md" : `${path.slice(1)}.md`;
}

function htmlFileName(path: string): string {
  return path === "/" ? "index.html" : `${path.slice(1)}/index.html`;
}

export async function bakeSite(
  input: BakeInput,
  options: BakeOptions = {},
): Promise<BakeResult> {
  const warnings: BakeWarning[] = [...assertBakeable(input.pages)];
  const pagePaths: Record<string, string> = {};
  for (const page of input.pages) pagePaths[page.id] = page.path;
  const ctx = { pagePaths, assets: input.assets ?? {} };

  const definitions = new Map(
    bundledSections.map((section) => [section.type, section]),
  );

  const manifestPages = [];
  let anyMotion = false;
  const islandKinds = new Set<string>();
  for (const page of input.pages) {
    const { configs, warnings: motionWarnings } = motionConfigsForTree(
      page.tree,
      input.motionTokens,
    );
    for (const warning of motionWarnings) {
      warnings.push({
        code: warning.code,
        page: page.path,
        nodeId: warning.nodeId,
        message: warning.message,
        suggestion: warning.suggestion,
      });
    }
    const islands = islandsForTree(page.tree);
    for (const kind of islands) islandKinds.add(kind);
    if (configs.length > 0) anyMotion = true;
    const { entities, warnings: jsonLdWarnings } = collectJsonLd(page.tree);
    for (const message of jsonLdWarnings) {
      warnings.push({ code: "invalid-jsonld", page: page.path, message });
    }
    const needsSplitText = configs.some(
      (config) => config.preset === "masked-headline" || config.preset === "char-split",
    );
    manifestPages.push({
      path: page.path,
      title: page.title,
      description: page.description ?? "",
      ogImage: page.ogImage ?? "",
      tree: page.tree,
      motion: jsonForHtml(configs),
      jsonLd:
        entities.length > 0
          ? jsonForHtml(entities.length === 1 ? entities[0] : { "@context": "https://schema.org", "@graph": entities })
          : null,
      flags: {
        hasMotion: configs.length > 0,
        needsSplitText,
        islands: [...islands],
      },
    });
  }

  if (options.strict === true) {
    const hard = warnings.find(
      (warning) => warning.code === "pin-excess" || warning.code === "invalid-jsonld",
    );
    if (hard) {
      throw new SenifyError(
        "guardrail",
        `Strict bake blocked: ${hard.message}`,
        {
          field: hard.nodeId ? `pages.${hard.page}.${hard.nodeId}` : `pages.${hard.page}`,
          suggestion: hard.suggestion,
        },
      );
    }
  }

  const stageDir = await stageTemplate(
    {
      site: { name: input.siteName, baseUrl: input.baseUrl, lang: "de" },
      ctx,
      pages: manifestPages,
      fontPreloads: input.fontPreloads ?? [],
      cdn: {
        gsap: GSAP_CDN,
        scrollTrigger: SCROLL_TRIGGER_CDN,
        splitText: SPLIT_TEXT_CDN,
        lenis: LENIS_CDN,
      },
    },
    input.themeCss,
  );
  try {
    const outDir = options.outDir ?? join(tmpdir(), `senify-bake-${Date.now()}`);
    runAstroBuild(stageDir, outDir);
    mkdirSync(join(outDir, "assets"), { recursive: true });
    writeFileSync(join(outDir, "assets", "theme.css"), input.themeCss);
    writeFileSync(
      join(outDir, "assets", "components.css"),
      readFileSync(join(stageDir, "src", "styles", "components.css"), "utf8"),
    );
    writeFileSync(
      join(outDir, "assets", "sections.css"),
      overridesCss(input.pages),
    );
    if (anyMotion) {
      writeFileSync(
        join(outDir, "assets", "page.js"),
        renderPageScript({ lenis: input.profile !== "clean" }),
      );
    }
    if (islandKinds.size > 0) {
      writeFileSync(join(outDir, "assets", "islands.js"), renderIslandsScript(islandKinds));
    }
    if (input.aeo !== false) {
      writeAeoFiles(outDir, input, definitions);
    }
    return {
      outDir,
      pages: input.pages.map((page) => ({ path: page.path, file: htmlFileName(page.path) })),
      warnings,
      jsBytes: jsBytesIn(outDir),
    };
  } finally {
    if (!options.keepWorkDir) rmSync(stageDir, { recursive: true, force: true });
  }
}

async function stageTemplate(manifest: unknown, themeCss: string): Promise<string> {
  // Staged inside the workspace (not tmpdir) so Astro resolves workspace
  // packages and root node_modules by walking up the directory tree.
  const stageDir = join(
    rendererDir,
    "..",
    ".bake",
    `stage-${Date.now()}-${Math.floor(Math.random() * 0xffff)}`,
  );
  cpSync(join(rendererDir, "..", "astro-template"), stageDir, { recursive: true });
  mkdirSync(join(stageDir, "src", "generated"), { recursive: true });
  writeFileSync(
    join(stageDir, "src", "generated", "manifest.json"),
    JSON.stringify(manifest),
  );
  writeFileSync(join(stageDir, "src", "generated", "theme.css"), themeCss);
  return stageDir;
}

function runAstroBuild(stageDir: string, outDir: string): void {
  const result = spawnSync(
    process.execPath,
    [astroBin(), "build", "--root", stageDir, "--outDir", outDir],
    {
      cwd: stageDir,
      env: {
        ...process.env,
        ASTRO_TELEMETRY_DISABLED: "1",
        FORCE_COLOR: "0",
      },
      encoding: "utf8",
      timeout: 180000,
    },
  );
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.slice(-2000);
    const cause = result.error ? ` (${(result.error as Error).message})` : "";
    throw new Error(
      `Astro build failed (exit ${result.status ?? "signal"}${cause}):\n${output}`,
    );
  }
}

function writeAeoFiles(
  outDir: string,
  input: BakeInput,
  definitions: Map<string, SectionDefinition>,
): void {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  for (const page of input.pages) {
    const file = join(outDir, mdFileName(page.path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      pageToMarkdown(
        {
          path: page.path,
          title: page.title,
          description: page.description,
          tree: page.tree,
        },
        definitions,
      ),
    );
  }
  writeFileSync(
    join(outDir, "llms.txt"),
    buildLlmsTxt(
      input.siteName,
      baseUrl,
      input.pages.map((page) => ({
        path: page.path,
        title: page.title,
        description: page.description,
      })),
    ),
  );
  writeFileSync(
    join(outDir, "sitemap.xml"),
    buildSitemap(
      baseUrl,
      input.pages.map((page) => page.path),
    ),
  );
  writeFileSync(join(outDir, "robots.txt"), buildRobots(baseUrl));
}

function jsBytesIn(outDir: string): number {
  let total = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) total += statSync(full).size;
    }
  };
  walk(outDir);
  return total;
}
