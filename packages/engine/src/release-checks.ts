// Release pre-checks (ticket 17, O9): the mandatory curtain before a release
// goes live.
//
// The publish path already runs the structural hard checks (`checks.ts`) on the
// drafts. This module adds the checks that need the *baked output*: every local
// reference of a page must resolve to a file of the build (no 404s, styles and
// scripts present, images delivered), and the heading order must not skip
// levels. It is deliberately static — the browser-based expansion (overflow,
// mobile, real network) is Phase 5.
//
// The check runs after the bake and before the release exists: a failing check
// throws, nothing is created, the previous release keeps serving.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { CheckIssue } from "./types.ts";

export type ReleaseCheckResult = {
  hard: CheckIssue[];
  soft: CheckIssue[];
};

const REFERENCE = /(?:href|src)\s*=\s*"([^"]+)"/gi;
const HEADING = /<h([1-6])\b/gi;

function issue(
  code: string,
  severity: "hard" | "soft",
  message: string,
): CheckIssue {
  return { code, severity, message };
}

function listHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const info = statSync(full);
      if (info.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.endsWith(".html")) out.push(full);
    }
  };
  if (!existsSync(dir)) return out;
  walk(dir);
  return out;
}

// A reference that needs a file in the build: no scheme, no protocol-relative
// URL, no data URI, no fragment and no query-only link.
function localReference(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return undefined;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return undefined;
  if (trimmed.startsWith("//")) return undefined;
  const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? "";
  if (withoutQuery === "") return undefined;
  return withoutQuery;
}

export function runReleasePreChecks(input: { outDir: string }): ReleaseCheckResult {
  const hard: CheckIssue[] = [];
  const soft: CheckIssue[] = [];
  const files = listHtmlFiles(input.outDir);
  if (files.length === 0) {
    return {
      hard: [issue("release-empty", "hard", "Der Bake hat keine HTML-Seiten erzeugt.")],
      soft,
    };
  }

  for (const file of files) {
    const page = relative(input.outDir, file).split(sep).join("/");
    const html = readFileSync(file, "utf8");

    // Local references resolve against the build root.
    const references = new Set<string>();
    for (const match of html.matchAll(REFERENCE)) {
      const value = match[1];
      if (value === undefined) continue;
      const local = localReference(value);
      if (local !== undefined) references.add(local);
    }
    for (const reference of references) {
      const target = join(input.outDir, reference.replace(/^\//, ""));
      if (!existsSync(target)) {
        hard.push(
          issue(
            "release-missing-file",
            "hard",
            `${page}: Verweis "${reference}" zeigt auf keine Datei des Releases.`,
          ),
        );
      }
    }

    // At least one stylesheet must be linked: without it the page ships
    // unstyled (the parity gate would catch it, the check names it).
    if (!/<link[^>]+rel="stylesheet"/i.test(html)) {
      hard.push(issue("release-no-stylesheet", "hard", `${page}: kein Stylesheet verlinkt.`));
    }

    // Heading order: no level skips a step. A page that starts below h1 is
    // noted softly — most sections render h2 by design, so a missing h1 is a
    // hint, not a blocker.
    let previous = 0;
    let headings = 0;
    for (const match of html.matchAll(HEADING)) {
      const level = Number(match[1]);
      headings += 1;
      if (previous === 0 && level !== 1) {
        soft.push(
          issue(
            "release-heading-start",
            "soft",
            `${page}: erste Überschrift ist h${level}, empfohlen ist h1.`,
          ),
        );
      } else if (previous !== 0 && level > previous + 1) {
        hard.push(
          issue(
            "release-heading-order",
            "hard",
            `${page}: Überschrift springt von h${previous} auf h${level}.`,
          ),
        );
      }
      previous = level;
    }
    if (headings === 0) {
      soft.push(issue("release-no-heading", "soft", `${page}: keine Überschrift gefunden.`));
    }
  }

  return { hard, soft };
}
