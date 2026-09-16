import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createShortcut,
  disableStartup,
  enableStartup,
  removeShortcut,
  startupPlan,
  startupStatus,
  type StartupContext,
} from "@senify/app";

// System integration (T12): launcher script, startup folder entry and desktop
// shortcut. The plan is pure data — only the shortcut test touches the real
// shell (Windows), everything else works against a throwaway profile.

function context(root: string, platform: NodeJS.Platform = "win32"): StartupContext {
  return {
    platform,
    home: join(root, "home"),
    appData: join(root, "appdata"),
    localAppData: join(root, "localappdata"),
    repoDir: join(root, "repo"),
  };
}

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "senify-startup-"));
}

describe("system integration (T12)", () => {
  it("plans the launcher, the startup entry and the desktop shortcut", () => {
    const root = tempRoot();
    try {
      const ctx = context(root);
      const plan = startupPlan(ctx);
      expect(plan.launcher).toBe(join(root, "localappdata", "Senify", "senify-start.cmd"));
      expect(plan.startupEntry).toBe(
        join(
          root,
          "appdata",
          "Microsoft",
          "Windows",
          "Start Menu",
          "Programs",
          "Startup",
          "Senify.cmd",
        ),
      );
      expect(plan.shortcut).toBe(join(root, "home", "Desktop", "Senify.lnk"));
      expect(plan.launcherScript).toContain(`cd /d "${ctx.repoDir}"`);
      expect(plan.launcherScript).toContain("pnpm start");
      expect(plan.startupScript).toContain(plan.launcher);
      expect(plan.shortcutScript).toContain(`'${plan.launcher}'`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes the startup entry, reports it and removes it again", () => {
    const root = tempRoot();
    try {
      const ctx = context(root);
      const status0 = startupStatus(ctx);
      expect(status0.startupEntry).toBe(false);
      expect(status0.launcher).toBe(false);

      const { launcher, entry } = enableStartup(ctx);
      expect(existsSync(launcher)).toBe(true);
      expect(existsSync(entry)).toBe(true);
      expect(readFileSync(entry, "utf8")).toContain(launcher);

      const status1 = startupStatus(ctx);
      expect(status1.startupEntry).toBe(true);
      expect(status1.launcher).toBe(true);

      const { removed } = disableStartup(ctx);
      expect(removed).toContain(entry);
      expect(removed).toContain(launcher);
      expect(existsSync(entry)).toBe(false);
      expect(existsSync(launcher)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the launcher while a desktop shortcut still points at it", () => {
    const root = tempRoot();
    try {
      const ctx = context(root);
      const plan = startupPlan(ctx);
      enableStartup(ctx);
      mkdirSync(dirname(plan.shortcut), { recursive: true });
      writeFileSync(plan.shortcut, "dummy", "utf8");
      const { removed } = disableStartup(ctx);
      expect(removed).not.toContain(plan.launcher);
      expect(existsSync(plan.launcher)).toBe(true);
      expect(existsSync(plan.startupEntry)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects other platforms with a clear message", () => {
    const root = tempRoot();
    try {
      expect(() => startupPlan(context(root, "linux"))).toThrow(/nur für Windows/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  describe.skipIf(process.platform !== "win32")("desktop shortcut on Windows", () => {
    it("creates a real link that survives a status check", () => {
      const root = tempRoot();
      try {
        const ctx = context(root);
        const { shortcut } = createShortcut(ctx);
        expect(existsSync(shortcut)).toBe(true);
        expect(startupStatus(ctx).shortcut).toBe(true);
        const { removed } = removeShortcut(ctx);
        expect(removed).toBe(true);
        expect(existsSync(shortcut)).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
