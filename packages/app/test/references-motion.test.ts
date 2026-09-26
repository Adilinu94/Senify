import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import type { ReferenceDeps } from "@senify/engine";
import { memoryDb } from "./support.ts";

// Motion-Aufnahme der Live-Analyse (T14): Die Engine legt die Scrollfahrt als
// .webm-Snapshot ab und liefert sie über die Snapshot-Route aus. Das
// Referenz-Fenster zeigt sie seit dem 24.09.2026 nicht mehr — die Aufnahme ist
// Agenten- und API-Daten. Der Test prüft deshalb Ablage und Auslieferung statt
// der Oberfläche; er braucht keinen Browser.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const WEBM = Buffer.from("1a45dfa3a3", "hex");
const author = { kind: "human", id: "programm", label: "Programm" };

const deps: ReferenceDeps = {
  capture: async () => ({
    markup: "<html><body><h1>Motion Studio</h1></body></html>",
    screenshots: [
      { breakpoint: "1440", kind: "fullpage", bytes: PNG, width: 1440, height: 900 },
    ],
    video: { bytes: WEBM, durationMs: 3840 },
  }),
};

describe("reference motion recording (T14)", () => {
  it("stores the recorded scroll pass as a servable snapshot", async () => {
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-refs-motion-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      referenceDeps: deps,
    });
    try {
      const created = await fetch(`${running.dashboardUrl}/api/references`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://motion-studio.test", wait: true, author }),
      });
      const text = await created.text();
      expect(created.status, text).toBe(201);
      const reference = (JSON.parse(text) as {
        reference: {
          id: string;
          snapshots: { kind: string; durationMs?: number; previewPath?: string }[];
        };
      }).reference;
      const motion = reference.snapshots.find((shot) => shot.kind === "motion");
      expect(motion?.durationMs).toBe(3840);
      expect(motion?.previewPath).toContain(`/api/references/${reference.id}/snapshots/`);

      // Die Aufnahme liegt als Video bereit (Agenten holen sie über diese Route).
      const served = await fetch(`${running.dashboardUrl}${motion?.previewPath}`);
      expect(served.status).toBe(200);
      expect(served.headers.get("content-type")).toBe("video/webm");
    } finally {
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
