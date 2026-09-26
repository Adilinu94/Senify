// MCP route matrix (E4 slice 2): every route in `http.ts` gets a conscious
// status — Tool, Workflow-gebündelt or Operator. The matrix is generated
// (`pnpm route-matrix`) into `docs/mcp-route-matrix.md` and verified by
// `packages/engine/test/route-matrix.test.ts`, so a new route without a
// matrix row turns the suite red.

export type MatrixStatus = "Tool" | "Workflow-gebündelt" | "Operator";

export type MatrixRoute = {
  method: string;
  path: string;
  scope: string;
  isPublic: boolean;
};

export type MatrixRow = MatrixRoute & {
  status: MatrixStatus;
  tools: string[];
  note: string;
};

// A path segment of a tool call: a string literal or a wildcard when the
// segment comes from an interpolation (`${siteId}`) or a route `:param`.
type PathSegment = { literal: string } | { wildcard: true };

function splitSegments(path: string): PathSegment[] {
  return path
    .split("?")[0]
    ?.split("/")
    .filter((segment) => segment !== "") 
    .map((segment) =>
      segment.startsWith(":") || segment === "" ? { wildcard: true } : { literal: segment },
    ) ?? [];
}

// Remove `${…}` interpolations (nesting-aware, they may contain ternaries
// with nested template literals) and mark the gap as a wildcard segment.
function normalizeToolPath(raw: string): PathSegment[] {
  let out = "";
  let index = 0;
  while (index < raw.length) {
    const start = raw.indexOf("${", index);
    if (start === -1) {
      out += raw.slice(index);
      break;
    }
    out += `${raw.slice(index, start)}/__PARAM__/`;
    let depth = 1;
    let cursor = start + 2;
    while (cursor < raw.length && depth > 0) {
      if (raw.startsWith("${", cursor)) {
        depth += 1;
        cursor += 2;
      } else if (raw[cursor] === "}") {
        depth -= 1;
        cursor += 1;
      } else {
        cursor += 1;
      }
    }
    index = cursor;
  }
  return out
    .split("?")[0]
    ?.split("/")
    .filter((segment) => segment !== "")
    .map((segment): PathSegment =>
      segment === "__PARAM__" ? { wildcard: true } : { literal: segment },
    ) ?? [];
}

function matchPath(route: PathSegment[], call: PathSegment[]): boolean {
  // A call matches when the route is a prefix of the call and every
  // remaining call segment is a wildcard: query suffixes
  // (`${query…}`, `${force…}`, `${kind…}`) sit behind the route path and
  // never address a longer route. A shorter call never reaches a route.
  if (route.length > call.length) return false;
  const prefix = route.every((segment, index) => {
    const other = call[index];
    if (segment === undefined || other === undefined) return false;
    if ("wildcard" in segment || "wildcard" in other) return true;
    return segment.literal === other.literal;
  });
  if (!prefix) return false;
  return call
    .slice(route.length)
    .every((segment) => segment !== undefined && "wildcard" in segment);
}

export function parseRoutes(httpSource: string): MatrixRoute[] {
  const routes: MatrixRoute[] = [];
  // No `{` anchor: entries may carry a comment between the brace and
  // `method` (e.g. above the events route). method+segments always sit on
  // adjacent lines inside ROUTES.
  const entry = /method:\s*"([A-Z]+)",\s*segments:\s*\[([^\]]*)\]/g;
  let found: RegExpExecArray | null;
  while ((found = entry.exec(httpSource)) !== null) {
    const method = found[1] ?? "";
    const segments = [...(found[2] ?? "").matchAll(/"([^"]+)"/g)].map(
      (part) => part[1] ?? "",
    );
    // method/segments/scope/public sit at the head of the entry; the handler
    // body starts thousands of characters later.
    const head = httpSource.slice(found.index, found.index + 800);
    const scope = /scope:\s*"(\w+)"/.exec(head)?.[1] ?? "read";
    const isPublic = /public:\s*true/.test(head.slice(0, 400));
    routes.push({
      method,
      path: `/${segments.join("/")}`,
      scope,
      isPublic,
    });
  }
  return routes;
}

// Extract `(method, path)` request calls with a brace/backtick-aware scan —
// paths are template literals that may nest ternaries with backticks.
export function parseRequestCalls(source: string): { method: string; path: string }[] {
  const calls: { method: string; path: string }[] = [];
  // Type arguments (`request<Page>`) are skipped: they never contain parens.
  const head = /\.request(?:<[^()]*>)?\(\s*"([A-Z]+)",\s*/g;
  let found: RegExpExecArray | null;
  while ((found = head.exec(source)) !== null) {
    const method = found[1] ?? "";
    let cursor = found.index + found[0].length;
    const quote = source[cursor];
    if (quote !== "`" && quote !== '"') continue;
    cursor += 1;
    let raw = "";
    if (quote === '"') {
      while (cursor < source.length && source[cursor] !== '"') {
        raw += source[cursor];
        cursor += 1;
      }
    } else {
      let depth = 0;
      while (cursor < source.length) {
        if (source.startsWith("${", cursor)) {
          depth += 1;
          raw += "${";
          cursor += 2;
        } else if (source[cursor] === "}" && depth > 0) {
          depth -= 1;
          raw += "}";
          cursor += 1;
        } else if (source[cursor] === "`" && depth === 0) {
          break;
        } else {
          raw += source[cursor];
          cursor += 1;
        }
      }
    }
    calls.push({ method, path: raw });
  }
  return calls;
}

// Split `tools.ts` into per-tool blocks at the array-element level.
export function parseToolCalls(toolsSource: string): Map<string, { method: string; path: string }[]> {
  const blocks = toolsSource.split(/\n {2}\{\n {4}name: "/);
  const byTool = new Map<string, { method: string; path: string }[]>();
  for (const block of blocks) {
    const name = /^([^"]+)"/.exec(block)?.[1];
    if (name === undefined) continue;
    byTool.set(name, parseRequestCalls(block));
  }
  return byTool;
}

type Override = { status: MatrixStatus; note: string };

// Curated statuses for routes whose caller says nothing about their role:
// public operator surfaces, the editor-only mutation path and the automatic
// MCP audit writer.
const OVERRIDES: Record<string, Override> = {
  "GET /api/health": { status: "Operator", note: "CLI/Dashboard (`senify doctor`)" },
  "GET /api/events": { status: "Operator", note: "SSE-Kanal (Editor/Dashboard)" },
  "POST /api/mcp/audit": {
    status: "Tool",
    note: "automatisch — der MCP-Server auditiert jeden Tool-Call",
  },
  "GET /api/mcp/audit": { status: "Operator", note: "Abfrage (Tests/Diagnose)" },
  "POST /api/pages/:pageId/editor-mutations": {
    status: "Operator",
    note: "Editor-UI (eigener Mutationspfad)",
  },
  "POST /api/tokens": { status: "Operator", note: "CLI-Bootstrap (`senify tokens create`)" },
  "GET /api/tokens": { status: "Operator", note: "CLI (`senify tokens list`)" },
  "DELETE /api/tokens/:tokenId": { status: "Operator", note: "CLI/Programm" },
  "GET /api/whoami": { status: "Operator", note: "auch CLI/Diagnose" },
  // Helper indirection (curated): these routes are called through local
  // helpers, not inline `client.request` — pageFor (get_page/get_nodes) and
  // uploadLocalFile (upload_asset: ticket route + byte sink via uploadBytes).
  "GET /api/pages/:pageId": {
    status: "Tool",
    note: "via get_page/get_nodes (pageFor-Helper)",
  },
  "POST /api/sites/:siteId/assets/upload-url": {
    status: "Tool",
    note: "via upload_asset (uploadLocalFile-Helper)",
  },
  "PUT /api/assets/upload/:uploadId": {
    status: "Workflow-gebündelt",
    note: "Byte-Sink des Upload-Flows (via upload_asset, signierte URL)",
  },
  "GET /api/references/:referenceId/snapshots/:filename": {
    status: "Operator",
    note: "Auslieferung der Referenz-Screenshots (signiert)",
  },
  "POST /api/forms/:formId/submit": {
    status: "Operator",
    note: "öffentlich — Website-Besucher (kein Token)",
  },
  "GET /api/newsletter/confirm": {
    status: "Operator",
    note: "öffentlich — Double-Opt-in-Link (kein Token)",
  },
  "GET /api/newsletter/unsubscribe": {
    status: "Operator",
    note: "öffentlich — Abmeldelink (kein Token)",
  },
  "GET /api/reviews/:reviewId/visuals/:filename": {
    status: "Operator",
    note: "Auslieferung der Review-Screenshots (signiert)",
  },
  "GET /api/motion-vendor/:name": {
    status: "Operator",
    note: "Auslieferung der Motion-Runtime (Editor/Preview)",
  },
  // Imported foreign code (ADR-0010): writing a payload is the import path
  // (CLI/editor today), reading it feeds the import report and the editor. The
  // MCP tools arrive with the component library (S6) — then the write route
  // needs the `write` scope in the tool set, which it already carries.
  "POST /api/sites/:siteId/code-payloads": {
    status: "Operator",
    note: "Import/CLI (MCP-Tools folgen mit der Bibliothek, S6)",
  },
  "GET /api/sites/:siteId/code-payloads": {
    status: "Operator",
    note: "Import-Bericht/Editor",
  },
  "GET /api/code-payloads/:payloadId": {
    status: "Operator",
    note: "Import-Bericht/Editor",
  },
  "DELETE /api/code-payloads/:payloadId": {
    status: "Operator",
    note: "CLI/Editor (destruktiv, mit Audit)",
  },
};

export function buildRouteMatrix(
  httpSource: string,
  toolsSource: string,
  serverSource: string,
): MatrixRow[] {
  const routes = parseRoutes(httpSource);
  const byTool = parseToolCalls(toolsSource);
  const serverCalls = parseRequestCalls(serverSource);
  const callers = new Map<string, Set<string>>();
  const remember = (key: string, tool: string): void => {
    const set = callers.get(key) ?? new Set<string>();
    set.add(tool);
    callers.set(key, set);
  };
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    const routeSegments = splitSegments(route.path);
    for (const [tool, calls] of byTool) {
      for (const call of calls) {
        if (call.method !== route.method) continue;
        if (matchPath(routeSegments, normalizeToolPath(call.path))) {
          remember(key, tool);
        }
      }
    }
    for (const call of serverCalls) {
      if (call.method !== route.method) continue;
      if (matchPath(routeSegments, normalizeToolPath(call.path))) {
        remember(key, "server (automatisch)");
      }
    }
  }
  return routes.map((route) => {
    const key = `${route.method} ${route.path}`;
    const tools = [...(callers.get(key) ?? [])].sort();
    const override = OVERRIDES[key];
    if (override !== undefined) {
      return { ...route, status: override.status, tools, note: override.note };
    }
    if (tools.length > 0) {
      return { ...route, status: "Tool" as MatrixStatus, tools, note: "" };
    }
    return {
      ...route,
      status: "Operator" as MatrixStatus,
      tools,
      note: route.isPublic ? "öffentlich" : "UI/CLI",
    };
  });
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

export function renderRouteMatrix(rows: MatrixRow[], stand: string): string {
  const counts = {
    Tool: rows.filter((row) => row.status === "Tool").length,
    gebuendelt: rows.filter((row) => row.status === "Workflow-gebündelt").length,
    Operator: rows.filter((row) => row.status === "Operator").length,
  };
  const lines = [
    "# MCP-Routen-Matrix",
    "",
    `Stand: ${stand} — generiert mit \`pnpm route-matrix\` aus \`packages/engine/src/http.ts\` (ROUTES) und \`packages/mcp/src/tools.ts\` (+ Server-Audit). Bei neuer Route die Matrix neu erzeugen; \`packages/engine/test/route-matrix.test.ts\` prüft Vollständigkeit.`,
    "",
    "**Regel (E4):** Jede Route hat einen bewussten Status. **Tool** — ein MCP-Tool ruft sie direkt auf. **Workflow-gebündelt** — nur als Teil eines Mehr-Routen-Workflows erreichbar (Via-Spalte nennt das bündelnde Tool). **Operator** — UI/CLI/öffentlich, bewusst ohne Tool.",
    "",
    `**Zahlen:** ${rows.length} Routen — ${counts.Tool} Tool, ${counts.gebuendelt} Workflow-gebündelt, ${counts.Operator} Operator.`,
    "",
    "| Methode | Route | Scope | Status | MCP-Tool(s) / Anmerkung |",
    "|---|---|---|---|---|",
  ];
  for (const row of rows) {
    const tools =
      row.tools.length > 0
        ? row.tools.map((tool) => `\`${tool}\``).join(", ")
        : "";
    const note =
      row.note === "" ? tools === "" ? "—" : tools : tools === "" ? row.note : `${tools} — ${row.note}`;
    lines.push(
      `| ${row.method} | \`${row.path}\` | ${row.scope} | ${row.status} | ${escapeCell(note)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
