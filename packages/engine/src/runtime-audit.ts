import type { NodeTree } from "@senify/section-sdk";

/**
 * Bewertet, ob eine gebaute Seite eine Framer-Runtime ausfuehren kann.
 *
 * `refuted` ist bewusst eng: kein seitenweiter Traeger, kein Framer-Host,
 * kein Framer-Global und jedes vorhandene Skript wurde geprueft und enthaelt
 * weder einen Framer-Marker noch eine dynamische Ladung. Das ist ein
 * Marker-Beleg, kein formaler Beweis gegen bewusst verschleierten Code.
 * Framer-Host-Abhaengigkeiten fuer Bilder, Schriften oder CSS werden als
 * offene Frage gefuehrt, aendern aber das Runtime-Ergebnis nicht.
 */
export type RuntimeAuditVerdict = "confirmed" | "refuted" | "unknown";

export type RuntimeAuditSignal = {
  kind: string;
  strength: "runtime" | "unknown" | "neutral" | "dependency";
  detail: string;
};

export type RuntimeAuditScript = {
  url: string;
  content?: string;
};

export type RuntimeAuditNetworkEntry = {
  url: string;
  resourceType?: string;
};

export type RuntimeAuditInput = {
  tree?: NodeTree;
  html: string;
  scripts?: RuntimeAuditScript[];
  network?: RuntimeAuditNetworkEntry[];
  globals?: string[];
};

export type RuntimeAuditResult = {
  verdict: RuntimeAuditVerdict;
  signals: RuntimeAuditSignal[];
  openQuestions: string[];
};

const FRAMER_HOSTS = ["framer.com", "framerusercontent.com", "framerstatic.com"] as const;
const FRAMER_MARKERS = [
  "__framer",
  "framer-runtime",
  "framer-motion",
  "data-framer-",
  "framerusercontent.com",
] as const;
const RUNTIME_RESOURCE_TYPES = new Set(["script", "worker", "fetch", "xhr", "document", "iframe"]);

type ScriptTag = {
  src?: string;
  inline: string;
};

function hostOf(url: string): string | undefined {
  try {
    return new URL(url, "http://senify.invalid").hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url, "http://senify.invalid").pathname;
  } catch {
    return url;
  }
}

function isFramerHost(host: string | undefined): boolean {
  if (host === undefined) return false;
  return FRAMER_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function hasFramerMarker(source: string): boolean {
  const lower = source.toLowerCase();
  return FRAMER_MARKERS.some((marker) => lower.includes(marker));
}

function hasDynamicLoading(source: string): boolean {
  return [
    /\bimport\s*\(/,
    /\bnew\s+Worker\s*\(/,
    /\bimportScripts\s*\(/,
    /\beval\s*\(/,
    /createElement\s*\(\s*["']script["']/,
  ].some((pattern) => pattern.test(source));
}

function scriptTags(html: string): ScriptTag[] {
  const tags: ScriptTag[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const srcMatch = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const src = srcMatch?.[1] ?? srcMatch?.[2] ?? srcMatch?.[3];
    tags.push(src === undefined ? { inline: body } : { src, inline: "" });
  }
  return tags;
}

function treeSignals(tree: NodeTree | undefined): RuntimeAuditSignal[] {
  if (tree === undefined) return [];
  const payloads = Object.values(tree.nodes).filter((node) => node.type === "payload");
  const signals: RuntimeAuditSignal[] = [];
  const pageCarrier = payloads.find(
    (node) => node.props["coversPage"] === true && node.props["active"] !== false,
  );
  if (pageCarrier !== undefined) {
    signals.push({
      kind: "page-carrier",
      strength: "runtime",
      detail: `Seitenweiter Framer-Traeger ${pageCarrier.id} ist aktiv.`,
    });
  }
  const island = payloads.find(
    (node) => !(node.props["coversPage"] === true && node.props["active"] !== false),
  );
  if (island !== undefined) {
    signals.push({
      kind: "payload-node",
      strength: "unknown",
      detail: `Payload-Knoten ${island.id} vorhanden; seine Ausfuehrung ist nicht abschliessend bewertet.`,
    });
  }
  return signals;
}

function contentSignals(content: string, label: string): RuntimeAuditSignal[] {
  if (hasFramerMarker(content)) {
    return [{ kind: "framer-script", strength: "runtime", detail: `Framer-Marker im Skript: ${label}` }];
  }
  if (hasDynamicLoading(content)) {
    return [
      {
        kind: "dynamic-loading",
        strength: "unknown",
        detail: `Skript laedt weiteren Code dynamisch: ${label}`,
      },
    ];
  }
  return [
    {
      kind: "script-inspected",
      strength: "neutral",
      detail: `Skript geprueft, ohne Framer-Marker und ohne dynamische Ladung: ${label}`,
    },
  ];
}

function scriptSignals(tags: ScriptTag[], provided: RuntimeAuditScript[]): RuntimeAuditSignal[] {
  const signals: RuntimeAuditSignal[] = [];
  for (const tag of tags) {
    if (tag.src !== undefined) {
      if (isFramerHost(hostOf(tag.src))) {
        signals.push({
          kind: "framer-host-script",
          strength: "runtime",
          detail: `Skript von einem Framer-Host: ${tag.src}`,
        });
        continue;
      }
      const local = provided.find((script) => pathOf(script.url) === pathOf(tag.src as string));
      if (local?.content === undefined) {
        signals.push({
          kind: "script-not-inspected",
          strength: "unknown",
          detail: `Skriptinhalt nicht geprueft: ${tag.src}`,
        });
        continue;
      }
      signals.push(...contentSignals(local.content, tag.src));
      continue;
    }
    const inline = tag.inline.trim();
    if (inline.length > 0) signals.push(...contentSignals(inline, "Inline-Skript"));
  }
  if (tags.length === 0) {
    signals.push({
      kind: "no-executable-content",
      strength: "neutral",
      detail: "Keine Script-Tags im HTML.",
    });
  }
  return signals;
}

function iframeSignals(html: string): RuntimeAuditSignal[] {
  const count = (html.match(/<iframe\b/gi) ?? []).length;
  if (count === 0) return [];
  return [
    {
      kind: "iframe",
      strength: "unknown",
      detail: `${count} iframe(s) koennen fremden Code ausfuehren.`,
    },
  ];
}

function networkSignals(network: RuntimeAuditNetworkEntry[]): {
  signals: RuntimeAuditSignal[];
  questions: string[];
} {
  const signals: RuntimeAuditSignal[] = [];
  const questions: string[] = [];
  for (const entry of network) {
    if (!isFramerHost(hostOf(entry.url))) continue;
    const resourceType = (entry.resourceType ?? "").toLowerCase();
    if (resourceType === "") {
      signals.push({
        kind: "framer-network-unclassified",
        strength: "unknown",
        detail: `Framer-Host-Anfrage ohne Typ: ${entry.url}`,
      });
      continue;
    }
    if (RUNTIME_RESOURCE_TYPES.has(resourceType)) {
      signals.push({
        kind: "framer-network-script",
        strength: "runtime",
        detail: `Framer-Host ${resourceType}: ${entry.url}`,
      });
      continue;
    }
    signals.push({
      kind: "framer-network-asset",
      strength: "dependency",
      detail: `Framer-Host ${resourceType}: ${entry.url}`,
    });
    questions.push(`Framer-Host-Abhaengigkeit (${resourceType}): ${entry.url}`);
  }
  return { signals, questions };
}

function globalSignals(globals: string[]): RuntimeAuditSignal[] {
  return globals
    .filter((key) => /^(__framer|framer)/i.test(key))
    .map((key) => ({
      kind: "framer-global",
      strength: "runtime" as const,
      detail: `Framer-Global im Browser: ${key}`,
    }));
}

export function auditFramerRuntime(input: RuntimeAuditInput): RuntimeAuditResult {
  const tags = scriptTags(input.html);
  const network = networkSignals(input.network ?? []);
  const signals = [
    ...treeSignals(input.tree),
    ...scriptSignals(tags, input.scripts ?? []),
    ...iframeSignals(input.html),
    ...globalSignals(input.globals ?? []),
    ...network.signals,
  ];
  const openQuestions = [
    ...signals.filter((signal) => signal.strength === "unknown").map((signal) => signal.detail),
    ...network.questions,
  ];
  const verdict: RuntimeAuditVerdict = signals.some((signal) => signal.strength === "runtime")
    ? "confirmed"
    : signals.some((signal) => signal.strength === "unknown")
      ? "unknown"
      : "refuted";
  return { verdict, signals, openQuestions };
}
