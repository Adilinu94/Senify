// Import der lokalen Referenzsammlung `Referenzsites/` in die Bibliothek des
// Portals: Sammlungen je Kategorie, Referenzen mit Design-Dokumenten und beiden
// Hero-Screenshots. Das Originalverzeichnis wird nur gelesen; die Bilder landen
// ausschliesslich im lokalen Datenverzeichnis der Engine.
//
// Aufruf:
//   pnpm exec tsx packages/engine/scripts/import-referenzsites.ts --dry-run
//   pnpm exec tsx packages/engine/scripts/import-referenzsites.ts
//   ... --only achilles,alta      nur diese Ordner
//   ... --limit 20                Stopp nach 20 Referenzen (Testlauf)
//   ... --pause 50                Pause je Referenz in Millisekunden (Default
//                                 1100 gegen die Drossel des Programms)
//   ... --cleanup                 Referenzen dieser Sammlung entfernen, die im
//                                 Verzeichnis nicht mehr vorkommen (fremde
//                                 Referenzen, etwa aus Taste Vault, bleiben)
//
// Der Lauf ist wiederholbar: Sammlungen werden ueber ihren Namen gefunden,
// Referenzen ueber ihren Namen aktualisiert (Metadaten und Dokumente).

import { request as httpRequest } from "node:http";
import { MANUAL_REFERENCE_MAX_BYTES } from "../src/references-contract.ts";
import {
  planReferenzsites,
  readReferenzsites,
} from "../src/references-referenzsites.ts";

type ApiCollection = {
  id: string;
  name: string;
  kind: string;
  externalId: string | null;
  referenceCount?: number;
};

type ApiReference = {
  id: string;
  name: string;
  collectionId: string | null;
};

const AUTHOR = { kind: "human" as const, id: "referenzsites", label: "Referenzsites" };

type Options = {
  from: string;
  api: string;
  dryRun: boolean;
  cleanup: boolean;
  only: string[];
  limit: number | null;
  pauseMs: number;
};

function parseOptions(argv: string[]): Options {
  const options: Options = {
    from: "Referenzsites",
    api: process.env["SENIFY_API_URL"] ?? "http://127.0.0.1:4322",
    dryRun: false,
    cleanup: false,
    only: [],
    limit: null,
    pauseMs: 1100,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--from") options.from = argv[++index] ?? options.from;
    else if (arg === "--api") options.api = argv[++index] ?? options.api;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--cleanup") options.cleanup = true;
    else if (arg === "--only") {
      options.only = (argv[++index] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value !== "");
    } else if (arg === "--limit") {
      const value = Number.parseInt(argv[++index] ?? "", 10);
      if (Number.isFinite(value) && value > 0) options.limit = value;
    } else if (arg === "--pause") {
      const value = Number.parseInt(argv[++index] ?? "", 10);
      if (Number.isFinite(value) && value >= 0) options.pauseMs = value;
    } else if (arg !== undefined && arg.startsWith("--")) {
      throw new Error(`Unbekannte Option "${arg}"`);
    }
  }
  return options;
}

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Eine einzelne Anfrage ohne Verbindungspool: der Lauf endet danach von
// selbst, statt auf offene Sockets von `fetch` zu warten (auf Windows brach der
// erzwungene Abschluss sonst gelegentlich mit einem libuv-Fehler ab).
async function once(
  api: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  const url = new URL(path, api);
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: url.hostname,
        port: url.port === "" ? 80 : Number.parseInt(url.port, 10),
        path: `${url.pathname}${url.search}`,
        method,
        headers:
          payload === null
            ? {}
            : { "content-type": "application/json", "content-length": String(payload.length) },
        agent: false,
        timeout: 120_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Zeitüberschreitung")));
    if (payload !== null) req.write(payload);
    req.end();
  });
}

// Die Engine drosselt auf 60 Anfragen je Minute und bricht bei grossen
// Bildpaketen gelegentlich die Verbindung ab: beides wird hier abgefangen.
async function request(
  options: Options,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: { status: number; text: string };
    try {
      response = await once(options.api, method, path, body);
    } catch (error) {
      lastError = new Error(`${method} ${path}: ${(error as Error).message}`);
      await pause(2000 * (attempt + 1));
      continue;
    }
    const text = response.text;
    let parsed: unknown = null;
    if (text !== "") {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (response.status >= 200 && response.status < 300) {
      return { status: response.status, body: parsed };
    }
    const message =
      typeof parsed === "object" && parsed !== null && "error" in parsed
        ? JSON.stringify((parsed as { error: unknown }).error)
        : text.slice(0, 300);
    if (response.status === 429) {
      lastError = new Error(`${method} ${path} -> 429: ${message}`);
      await pause(3000 * (attempt + 1));
      continue;
    }
    throw new Error(`${method} ${path} -> ${response.status}: ${message}`);
  }
  throw lastError ?? new Error(`${method} ${path}: unbekannter Fehler`);
}

// Wie im Vorbild: die Kategorien der Sammlung nach Groesse, dann alphabetisch.
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const read = readReferenzsites(options.from, {
    ...(options.only.length === 0 ? {} : { only: options.only }),
    ...(options.limit === null ? {} : { limit: options.limit }),
  });
  const plan = planReferenzsites(read.records);
  process.stdout.write(
    `${plan.entries.length} Referenzen gelesen, ${plan.collections.length} Kategorien, ` +
      `${read.issues.length} unvollstaendig\n`,
  );
  for (const issue of read.issues.slice(0, 20)) {
    process.stdout.write(`  ! ${issue.slug}: ${issue.reason}\n`);
  }

  const collectionsAnswer = await request(options, "GET", "/api/reference-collections");
  const existingCollections =
    (collectionsAnswer.body as { collections: ApiCollection[] }).collections ?? [];
  const collectionByName = new Map(existingCollections.map((entry) => [entry.name, entry]));

  let collectionsCreated = 0;
  let collectionsUpdated = 0;
  const collectionIds = new Map<string, string>();
  for (const collection of plan.collections) {
    const fields = {
      name: collection.name,
      description: collection.description,
      deployFor: "",
      vocabulary: [],
      risk: "",
      accent: "",
      imageStyle: "",
      position: collection.position,
    };
    const existing = collectionByName.get(collection.name);
    if (existing === undefined) {
      if (options.dryRun) {
        collectionsCreated += 1;
        collectionIds.set(collection.name, `dry-run:${collection.name}`);
        continue;
      }
      const created = await request(options, "POST", "/api/reference-collections", {
        ...fields,
        kind: "collection",
      });
      const id = (created.body as { collection: { id: string } }).collection.id;
      collectionIds.set(collection.name, id);
      collectionsCreated += 1;
      continue;
    }
    collectionIds.set(collection.name, existing.id);
    if (!options.dryRun) {
      await request(options, "PATCH", `/api/reference-collections/${existing.id}`, fields);
    }
    collectionsUpdated += 1;
  }

  const referencesAnswer = await request(options, "GET", "/api/references");
  const existingReferences =
    (referencesAnswer.body as { references: ApiReference[] }).references ?? [];
  const referenceByName = new Map(existingReferences.map((entry) => [entry.name, entry]));

  let referencesCreated = 0;
  let referencesUpdated = 0;
  const failures: string[] = [];
  const importedNames = new Set<string>();

  for (const [index, entry] of plan.entries.entries()) {
    importedNames.add(entry.name);
    const collectionId = collectionIds.get(entry.category) ?? null;
    const fields = {
      name: entry.name,
      sourceUrl: entry.sourceUrl,
      collectionId,
      note: entry.note,
      vocabulary: [],
      imageRecipe: "",
      heroUsage: "",
      family: entry.family,
      documents: entry.documents,
    };
    const existing = referenceByName.get(entry.name);
    if (existing !== undefined) {
      if (!options.dryRun) {
        try {
          await request(options, "PATCH", `/api/references/${existing.id}`, {
            sourceUrl: fields.sourceUrl,
            collectionId,
            note: fields.note,
            family: fields.family,
            documents: fields.documents,
          });
        } catch (error) {
          failures.push(`${entry.name}: ${(error as Error).message}`);
          continue;
        }
      }
      referencesUpdated += 1;
      if ((index + 1) % 25 === 0) {
        process.stdout.write(`  ${index + 1}/${plan.entries.length} geprueft\n`);
      }
      continue;
    }
    if (options.dryRun) {
      referencesCreated += 1;
      continue;
    }
    if (entry.desktop.bytes.length > MANUAL_REFERENCE_MAX_BYTES) {
      failures.push(`${entry.name}: Desktop-Bild groesser als das Upload-Limit`);
      continue;
    }
    try {
      // Die Engine nimmt 60 Anfragen je Minute an: ein Paket je Taktung.
      if (options.pauseMs > 0) await pause(options.pauseMs);
      await request(options, "POST", "/api/references/manual", {
        ...fields,
        capturedAt: entry.capturedAt,
        image: entry.desktop.bytes.toString("base64"),
        ...(entry.mobile === null || entry.mobile.bytes.length > MANUAL_REFERENCE_MAX_BYTES
          ? {}
          : { imageMobile: entry.mobile.bytes.toString("base64") }),
        author: AUTHOR,
      });
      referencesCreated += 1;
    } catch (error) {
      failures.push(`${entry.name}: ${(error as Error).message}`);
    }
    if ((index + 1) % 5 === 0 || index + 1 === plan.entries.length) {
      process.stdout.write(
        `  ${index + 1}/${plan.entries.length} uebertragen, ${referencesCreated} neu\n`,
      );
    }
  }

  let removed = 0;
  if (options.cleanup) {
    const managed = new Set(collectionIds.values());
    for (const reference of existingReferences) {
      if (importedNames.has(reference.name)) continue;
      if (reference.collectionId === null || !managed.has(reference.collectionId)) continue;
      if (!options.dryRun) {
        await request(options, "DELETE", `/api/references/${reference.id}?force=true`);
      }
      removed += 1;
    }
  }

  const summary = {
    dryRun: options.dryRun,
    collections: { created: collectionsCreated, updated: collectionsUpdated },
    references: {
      created: referencesCreated,
      updated: referencesUpdated,
      total: plan.entries.length,
    },
    cleanup: { removed },
    issues: read.issues,
    failures,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (read.issues.length > 0) {
    process.stdout.write(
      `${read.issues.length} Ordner sind unvollstaendig und wurden uebersprungen (siehe issues).\n`,
    );
  }
  // Nur echte Fehler lassen den Lauf scheitern; unvollstaendige Quellordner
  // stehen im Bericht und aendern den Exit-Code nicht.
  if (failures.length > 0) process.exitCode = 1;
}

// Ohne Verbindungspool endet der Prozess von selbst; der Exit-Code steht in
// process.exitCode (1 nur bei echten Fehlern).
await main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
