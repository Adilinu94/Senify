import { describe, expect, it } from "vitest";
import {
  bootEngine,
  createTestSite,
  type BootEnv,
  type ErrorResponse,
} from "./helpers.ts";

// R12 Schritt 53 hat die elf Asset-Routen aus `http-routes-sites.ts` in
// `http-routes-assets.ts` gezogen und das neue Modul sofort in die
// Coverage-Schwelle gesetzt (80/68/88/80). Die Routen liefen, aber die
// Fehlerpfade waren ungesichert: gemessen 100 % Statements, 62,5 % Branches -
// das Tor war rot, und zwar zu Recht.
//
// Die drei offenen Branches sind die `(await readJsonBody(req)) ?? {}`-Zweige:
// ein Request OHNE Body darf nicht in einen rohen Parser-TypeError laufen,
// sondern muss die Vertragsantwort des Schemas geben (400 mit Kategorie
// `validation`). Dazu kommt der vierte Branch in `createAssetFolder`
// (`parentId ?? null`).

// Header-only: die Upload-Prüfung liest die Maße aus dem Dateikopf.
function pngBytes(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

async function uploadAsset(
  api: BootEnv["api"],
  siteId: string,
): Promise<string> {
  const data = pngBytes(16, 16);
  const ticket = await api.request<{ url: string }>({
    method: "POST",
    path: `/api/sites/${siteId}/assets/upload-url`,
    body: { filename: "bild.png", mime: "image/png", byteSize: data.length },
  });
  expect(ticket.status).toBe(201);
  // Die Antwort nennt den Pfad relativ; der Server-Ursprung steht am Harness.
  const uploaded = await fetch(`${api.origin}${ticket.body.url}`, {
    method: "PUT",
    headers: { "content-type": "image/png" },
    body: new Uint8Array(data),
  });
  expect(uploaded.status).toBe(201);
  const body = (await uploaded.json()) as { asset: { id: string } };
  return body.asset.id;
}

describe("Asset-Routen: die Fehlerpfade ohne Body", () => {
  it("PATCH ohne Body ist ein leerer Patch und antwortet mit 200", async () => {
    // Alle Felder des Patches sind optional: ein Request ohne Body ist damit
    // ein leerer Patch, kein Fehler. Der Branch `?? {}` verhindert nur, dass
    // `parseBody` an `undefined` scheitert - er ändert die Antwort nicht.
    const env = await bootEngine();
    try {
      const siteId = (await createTestSite(env.api, "Ohne Body")).id;
      const assetId = await uploadAsset(env.api, siteId);
      const response = await env.api.request<{ id: string; altText: string | null }>({
        method: "PATCH",
        path: `/api/sites/${siteId}/assets/${assetId}`,
      });
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(assetId);
    } finally {
      await env.close();
    }
  }, 120_000);

  it("POST assets/bulk ohne Body antwortet mit 400", async () => {
    const env = await bootEngine();
    try {
      const siteId = (await createTestSite(env.api, "Bulk ohne Body")).id;
      const response = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${siteId}/assets/bulk`,
      });
      expect(response.status).toBe(400);
      expect(response.body.error.category).toBe("validation");
    } finally {
      await env.close();
    }
  }, 120_000);

  it("POST asset-folders ohne Body antwortet mit 400", async () => {
    const env = await bootEngine();
    try {
      const siteId = (await createTestSite(env.api, "Ordner ohne Body")).id;
      const response = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${siteId}/asset-folders`,
      });
      expect(response.status).toBe(400);
      expect(response.body.error.category).toBe("validation");
    } finally {
      await env.close();
    }
  }, 120_000);

  it("POST asset-folders ohne parentId legt einen Wurzelordner an", async () => {
    // Der vierte Branch: `input.parentId ?? null`. Ohne ihn wäre ein Ordner
    // ohne Elternangabe nicht anlegbar - der häufigste Fall.
    const env = await bootEngine();
    try {
      const siteId = (await createTestSite(env.api, "Wurzelordner")).id;
      const response = await env.api.request<{ id: string; name: string }>({
        method: "POST",
        path: `/api/sites/${siteId}/asset-folders`,
        body: { name: "Referenzen" },
      });
      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Referenzen");
    } finally {
      await env.close();
    }
  }, 120_000);
});
