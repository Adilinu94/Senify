import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SenifyError } from "@senify/core";

// System integration of the local program (T12): one launcher script plus two
// links into it — a desktop shortcut and an entry in the Windows startup
// folder. Only Windows is implemented; other platforms get a clear error
// instead of files that silently do nothing. Everything is planned as pure
// data first (`startupPlan`), so the tests never need the real shell folders.

export type StartupContext = {
  platform: NodeJS.Platform;
  home: string;
  appData: string;
  localAppData: string;
  // The directory the program starts from (the repo root).
  repoDir: string;
};

export type StartupPlan = {
  launcher: string;
  launcherScript: string;
  startupEntry: string;
  startupScript: string;
  shortcut: string;
  shortcutScript: string;
};

const LAUNCHER_NAME = "senify-start.cmd";
const SHORTCUT_NAME = "Senify.lnk";
const STARTUP_NAME = "Senify.cmd";

export function repoRoot(): string {
  return fileURLToPath(new URL("../../..", import.meta.url));
}

export function startupContext(overrides?: Partial<StartupContext>): StartupContext {
  const env = process.env;
  return {
    platform: process.platform,
    home: homedir(),
    appData: env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
    localAppData: env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
    repoDir: repoRoot(),
    ...overrides,
  };
}

function requireWindows(context: StartupContext): void {
  if (context.platform !== "win32") {
    throw new SenifyError(
      "validation",
      "Desktop-Verknüpfung und System-Start sind nur für Windows umgesetzt",
      {
        field: "platform",
        suggestion: "Starte das Programm auf diesem System weiterhin über `pnpm start`.",
      },
    );
  }
}

// OneDrive redirects the known folder; the plain Desktop is the fallback.
function desktopDir(context: StartupContext): string {
  const candidates = [
    join(context.home, "OneDrive", "Desktop"),
    join(context.home, "Desktop"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[1]!;
}

function quote(value: string): string {
  return value.replace(/'/g, "''");
}

export function startupPlan(context: StartupContext): StartupPlan {
  requireWindows(context);
  const launcher = join(context.localAppData, "Senify", LAUNCHER_NAME);
  const startupEntry = join(
    context.appData,
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
    STARTUP_NAME,
  );
  const shortcut = join(desktopDir(context), SHORTCUT_NAME);
  // The launcher is the single source of the start command; both links only
  // point at it. `pnpm start` keeps the program's Autostart setting in charge
  // of the browser (default off).
  const launcherScript = [
    "@echo off",
    `cd /d "${context.repoDir}"`,
    "pnpm start",
    "",
  ].join("\r\n");
  const startupScript = ["@echo off", `start "" /min "${launcher}"`, ""].join("\r\n");
  const shortcutScript = [
    "$shell = New-Object -ComObject WScript.Shell",
    `$link = $shell.CreateShortcut('${quote(shortcut)}')`,
    `$link.TargetPath = '${quote(launcher)}'`,
    `$link.WorkingDirectory = '${quote(context.repoDir)}'`,
    "$link.WindowStyle = 7",
    "$link.Description = 'Senify - lokales Programm starten'",
    "$link.Save()",
  ].join("\r\n");
  return { launcher, launcherScript, startupEntry, startupScript, shortcut, shortcutScript };
}

export type StartupStatus = {
  launcher: boolean;
  startupEntry: boolean;
  shortcut: boolean;
  paths: StartupPlan;
};

export function startupStatus(context: StartupContext): StartupStatus {
  const plan = startupPlan(context);
  return {
    launcher: existsSync(plan.launcher),
    startupEntry: existsSync(plan.startupEntry),
    shortcut: existsSync(plan.shortcut),
    paths: plan,
  };
}

// Writes the launcher once; both links depend on it.
function ensureLauncher(plan: StartupPlan): void {
  mkdirSync(dirname(plan.launcher), { recursive: true });
  writeFileSync(plan.launcher, plan.launcherScript, "utf8");
}

export function enableStartup(context: StartupContext): { launcher: string; entry: string } {
  const plan = startupPlan(context);
  ensureLauncher(plan);
  mkdirSync(dirname(plan.startupEntry), { recursive: true });
  writeFileSync(plan.startupEntry, plan.startupScript, "utf8");
  return { launcher: plan.launcher, entry: plan.startupEntry };
}

export function disableStartup(context: StartupContext): { removed: string[] } {
  const plan = startupPlan(context);
  const removed: string[] = [];
  if (existsSync(plan.startupEntry)) {
    rmSync(plan.startupEntry, { force: true });
    removed.push(plan.startupEntry);
  }
  // The launcher is shared with the desktop shortcut; keep it when the
  // shortcut still points at it.
  if (!existsSync(plan.shortcut) && existsSync(plan.launcher)) {
    rmSync(plan.launcher, { force: true });
    removed.push(plan.launcher);
  }
  return { removed };
}

export function createShortcut(context: StartupContext): { shortcut: string } {
  const plan = startupPlan(context);
  ensureLauncher(plan);
  mkdirSync(dirname(plan.shortcut), { recursive: true });
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", plan.shortcutScript],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !existsSync(plan.shortcut)) {
    throw new SenifyError(
      "conflict",
      "Die Verknüpfung konnte nicht angelegt werden",
      {
        field: "shortcut",
        suggestion: result.stderr?.trim() || "PowerShell nicht verfügbar?",
      },
    );
  }
  return { shortcut: plan.shortcut };
}

export function removeShortcut(context: StartupContext): { removed: boolean } {
  const plan = startupPlan(context);
  if (!existsSync(plan.shortcut)) return { removed: false };
  rmSync(plan.shortcut, { force: true });
  return { removed: true };
}
