import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EngineApiError, EngineClient } from "./client.ts";
import { clientTargets } from "./clients.ts";

// senify doctor (E12, L43): the status per capability with a concrete fix and
// an honest "not verified" instead of a green guess. The pattern follows
// Agent-Reach: every line either proves itself against the running system or
// says why it cannot.

export type DoctorStatus = "ok" | "warn" | "fail" | "unverified";

export type DoctorCheck = {
  id: string;
  label: string;
  status: DoctorStatus;
  detail: string;
  fix: string | null;
};

export type DoctorReport = {
  apiUrl: string;
  appUrl: string;
  checks: DoctorCheck[];
  summary: { ok: number; warn: number; fail: number; unverified: number };
};

export type DoctorInput = {
  apiUrl: string;
  appUrl?: string;
  home?: string;
};

const DEFAULT_APP_URL = "http://127.0.0.1:4322";

function programTokenSecret(home: string): string | undefined {
  try {
    const parsed = JSON.parse(
      readFileSync(join(home, ".senify", "program-token.json"), "utf8"),
    ) as { secret?: unknown };
    return typeof parsed.secret === "string" ? parsed.secret : undefined;
  } catch {
    return undefined;
  }
}

async function checkEngine(apiUrl: string): Promise<DoctorCheck> {
  try {
    const health = await new EngineClient({ apiUrl }).request<{
      ok: boolean;
      version: string;
      maintenance: boolean;
    }>("GET", "/api/health");
    return {
      id: "engine",
      label: "Engine",
      status: "ok",
      detail: `${apiUrl} — Version ${health.version}${
        health.maintenance ? " · Wartung aktiv" : ""
      }`,
      fix: null,
    };
  } catch (error) {
    return {
      id: "engine",
      label: "Engine",
      status: "fail",
      detail: error instanceof Error ? error.message : "nicht erreichbar",
      fix: "senify start",
    };
  }
}

async function checkDashboard(appUrl: string): Promise<DoctorCheck> {
  try {
    const response = await fetch(appUrl, { method: "GET" });
    return {
      id: "dashboard",
      label: "Dashboard",
      status: response.ok ? "ok" : "warn",
      detail: `${appUrl} — HTTP ${response.status}`,
      fix: response.ok ? null : "senify start (oder --app-port prüfen)",
    };
  } catch {
    return {
      id: "dashboard",
      label: "Dashboard",
      status: "warn",
      detail: `${appUrl} nicht erreichbar`,
      fix: "senify start",
    };
  }
}

type TokenState =
  | { kind: "missing" }
  | { kind: "present"; secret: string };

async function checkToken(input: {
  apiUrl: string;
  home: string;
}): Promise<{ check: DoctorCheck; token: TokenState }> {
  const secret = programTokenSecret(input.home);
  if (secret === undefined) {
    return {
      check: {
        id: "token",
        label: "Programm-Token",
        status: "warn",
        detail: "kein ~/.senify/program-token.json gefunden",
        fix: "senify start (legt das Programm-Token an)",
      },
      token: { kind: "missing" },
    };
  }
  try {
    const who = await new EngineClient({
      apiUrl: input.apiUrl,
      token: secret,
    }).request<{ name: string; kind: string; scopes: string[] }>(
      "GET",
      "/api/whoami",
    );
    return {
      check: {
        id: "token",
        label: "Programm-Token",
        status: "ok",
        detail: `"${who.name}" (${who.kind}, ${who.scopes.join(",")})`,
        fix: null,
      },
      token: { kind: "present", secret },
    };
  } catch (error) {
    return {
      check: {
        id: "token",
        label: "Programm-Token",
        status: "fail",
        detail:
          error instanceof EngineApiError && error.status === 401
            ? "Token abgelehnt (widerrufen?)"
            : error instanceof Error
              ? error.message
              : "Prüfung fehlgeschlagen",
        fix: "senify setup (neues Token erzeugen)",
      },
      token: { kind: "missing" },
    };
  }
}

async function checkDatabase(input: {
  apiUrl: string;
  token: TokenState;
}): Promise<{ check: DoctorCheck; siteId: string | null }> {
  if (input.token.kind === "missing") {
    return {
      check: {
        id: "database",
        label: "Datenbank",
        status: "unverified",
        detail: "nicht geprüft (kein gültiges Programm-Token)",
        fix: "senify start",
      },
      siteId: null,
    };
  }
  try {
    const sites = await new EngineClient({
      apiUrl: input.apiUrl,
      token: input.token.secret,
    }).request<{ sites: { id: string }[] }>("GET", "/api/sites");
    return {
      check: {
        id: "database",
        label: "Datenbank",
        status: "ok",
        detail: `Postgres über die Engine erreichbar — ${sites.sites.length} Site(s)`,
        fix: null,
      },
      siteId: sites.sites[0]?.id ?? null,
    };
  } catch (error) {
    return {
      check: {
        id: "database",
        label: "Datenbank",
        status: "fail",
        detail: error instanceof Error ? error.message : "Abfrage fehlgeschlagen",
        fix: "Postgres starten (docker compose up -d) und die URL in ~/.senify/config.json prüfen",
      },
      siteId: null,
    };
  }
}

function checkMcpClients(home: string): DoctorCheck {
  const configured: string[] = [];
  const broken: string[] = [];
  for (const target of clientTargets(home)) {
    if (!existsSync(target.configPath)) continue;
    try {
      const parsed = JSON.parse(readFileSync(target.configPath, "utf8")) as {
        mcpServers?: Record<string, unknown>;
        mcp?: Record<string, unknown>;
      };
      const servers = target.format === "opencode" ? parsed.mcp : parsed.mcpServers;
      if (servers !== undefined && servers["senify"] !== undefined) {
        configured.push(target.label);
      }
    } catch {
      broken.push(target.label);
    }
  }
  if (configured.length > 0) {
    return {
      id: "mcp",
      label: "MCP-Client",
      status: "ok",
      detail: `konfiguriert: ${configured.join(", ")}${
        broken.length > 0 ? ` · defekte Config: ${broken.join(", ")}` : ""
      }`,
      fix: null,
    };
  }
  return {
    id: "mcp",
    label: "MCP-Client",
    status: "warn",
    detail:
      broken.length > 0
        ? `Config nicht lesbar: ${broken.join(", ")}`
        : "kein MCP-Client mit Senify-Eintrag gefunden",
    fix: "senify setup",
  };
}

function checkData(home: string): DoctorCheck {
  const configPath = join(home, ".senify", "config.json");
  if (!existsSync(configPath)) {
    return {
      id: "data",
      label: "Daten",
      status: "warn",
      detail: "~/.senify/config.json fehlt",
      fix: "senify start (oder SENIFY_DATABASE_URL setzen)",
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
      databaseUrl?: unknown;
    };
    const hasDatabase = typeof parsed.databaseUrl === "string" && parsed.databaseUrl !== "";
    return {
      id: "data",
      label: "Daten",
      status: "ok",
      detail: hasDatabase
        ? "Konfiguration vorhanden (Datenbank-URL gesetzt)"
        : "Konfiguration vorhanden (Datenbank-URL kommt aus der Umgebung)",
      fix: null,
    };
  } catch {
    return {
      id: "data",
      label: "Daten",
      status: "warn",
      detail: "~/.senify/config.json ist kein gültiges JSON",
      fix: "Datei korrigieren oder löschen und senify start erneut ausführen",
    };
  }
}

async function checkBake(input: {
  apiUrl: string;
  token: TokenState;
  siteId: string | null;
}): Promise<DoctorCheck> {
  if (input.token.kind === "missing" || input.siteId === null) {
    return {
      id: "bake",
      label: "Bake",
      status: "unverified",
      detail: "nicht geprüft (kein Token oder keine Site)",
      fix: "senify start",
    };
  }
  try {
    const result = await new EngineClient({
      apiUrl: input.apiUrl,
      token: input.token.secret,
    }).request<{ jobs: { status: string }[] }>(
      "GET",
      `/api/sites/${input.siteId}/bake-jobs`,
    );
    const failed = result.jobs.filter((job) => job.status === "failed").length;
    if (failed > 0) {
      return {
        id: "bake",
        label: "Bake",
        status: "warn",
        detail: `${failed} fehlgeschlagene(r) Bake-Job(s) von ${result.jobs.length}`,
        fix: "Dashboard → Aufträge ansehen; Job erneut auslösen",
      };
    }
    return {
      id: "bake",
      label: "Bake",
      status: "ok",
      detail:
        result.jobs.length === 0
          ? "keine Bake-Jobs (noch nichts neu zu bauen)"
          : `${result.jobs.length} Bake-Job(s), keine Fehler`,
      fix: null,
    };
  } catch (error) {
    return {
      id: "bake",
      label: "Bake",
      status: "warn",
      detail: error instanceof Error ? error.message : "Abfrage fehlgeschlagen",
      fix: "Dashboard → Aufträge prüfen",
    };
  }
}

export async function runDoctor(input: DoctorInput): Promise<DoctorReport> {
  const home = input.home ?? homedir();
  const appUrl = input.appUrl ?? DEFAULT_APP_URL;
  const engine = await checkEngine(input.apiUrl);
  const [dashboard, token] = await Promise.all([
    checkDashboard(appUrl),
    checkToken({ apiUrl: input.apiUrl, home }),
  ]);
  const database = await checkDatabase({
    apiUrl: input.apiUrl,
    token: token.token,
  });
  const checks: DoctorCheck[] = [
    engine,
    dashboard,
    database.check,
    token.check,
    checkMcpClients(home),
    checkData(home),
    await checkBake({
      apiUrl: input.apiUrl,
      token: token.token,
      siteId: database.siteId,
    }),
  ];
  return {
    apiUrl: input.apiUrl,
    appUrl,
    checks,
    summary: {
      ok: checks.filter((check) => check.status === "ok").length,
      warn: checks.filter((check) => check.status === "warn").length,
      fail: checks.filter((check) => check.status === "fail").length,
      unverified: checks.filter((check) => check.status === "unverified").length,
    },
  };
}

const MARKS: Record<DoctorStatus, string> = {
  ok: "✓",
  warn: "!",
  fail: "✗",
  unverified: "–",
};

export function formatDoctor(report: DoctorReport): string[] {
  const lines = report.checks.map(
    (check) =>
      `${MARKS[check.status]} ${check.label.padEnd(16)} ${check.detail}${
        check.fix === null ? "" : `  → ${check.fix}`
      }`,
  );
  const { ok, warn, fail, unverified } = report.summary;
  lines.push(
    `${ok} ok · ${warn} Hinweis(e) · ${fail} Fehler · ${unverified} nicht verifiziert`,
  );
  return lines;
}

export function doctorExitCode(report: DoctorReport): number {
  return report.summary.fail > 0 ? 1 : 0;
}
