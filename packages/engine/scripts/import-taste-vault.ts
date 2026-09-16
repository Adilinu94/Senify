// Import des Referenz-Vorbilds (Taste Vault) in die eigene Bibliothek: Sammlungen,
// Referenzen und die Originalbilder. Das Vorbild liegt als Referenzkopie neben dem
// Repo und wird nur gelesen; die Bilder landen ausschliesslich im lokalen Datenverzeichnis
// der Engine (die Aufnahmen zeigen fremde Websites und gehoeren nicht ins Repo).
//
// Aufruf:
//   pnpm exec tsx packages/engine/scripts/import-taste-vault.ts --from Repos/taste-vault
//   ... --dry-run    nur zaehlen, nichts schreiben
//   ... --cleanup    die sechs erfundenen Beispielsammlungen samt Referenzen entfernen
//
// Der Lauf ist wiederholbar: Vorhandene Sammlungen werden ueber ihre externe Kennung
// aktualisiert, vorhandene Referenzen ueber ihren Namen. Bilder werden nur beim ersten
// Anlegen uebertragen, damit ein zweiter Lauf schnell bleibt.

import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

type VaultCollection = {
  id: string;
  name: string;
  description?: string;
  deployFor?: string;
  vocabulary?: string[];
  risk?: string;
  accent?: string;
  imageStyle?: string;
};

type VaultEntry = {
  id: string;
  file: string;
  title: string;
  collection: string;
  family?: string;
  vocabulary?: string[];
  note?: string;
  imageRecipe?: string;
  heroUsage?: string;
  added?: string;
};

type Vault = {
  collections: VaultCollection[];
  entries: VaultEntry[];
  dna?: { constants?: string[]; never?: string[] };
};

type ApiCollection = {
  id: string;
  name: string;
  externalId: string | null;
  kind: string;
  referenceCount?: number;
};

type ApiReference = {
  id: string;
  name: string;
  collectionId: string | null;
};

const AUTHOR = { kind: "human" as const, id: "taste-vault", label: "Taste Vault" };
const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;

type Options = {
  from: string;
  api: string;
  dryRun: boolean;
  cleanup: boolean;
};

function parseOptions(argv: string[]): Options {
  const options: Options = {
    from: "Repos/taste-vault",
    api: process.env["SENIFY_API_URL"] ?? "http://127.0.0.1:4322",
    dryRun: false,
    cleanup: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--from") options.from = argv[++index] ?? options.from;
    else if (arg === "--api") options.api = argv[++index] ?? options.api;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--cleanup") options.cleanup = true;
    else if (arg !== undefined && arg.startsWith("--")) {
      throw new Error(`Unbekannte Option "${arg}"`);
    }
  }
  return options;
}

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Die Engine drosselt auf 60 Anfragen je Minute und bricht bei sehr grossen
// Bildpaketen gelegentlich die Verbindung ab: beides wird hier abgefangen.
async function request(
  options: Options,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${options.api}${path}`, {
        method,
        headers: body === undefined ? {} : { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      lastError = new Error(`${method} ${path}: ${(error as Error).message}`);
      await pause(2000 * (attempt + 1));
      continue;
    }
    const text = await response.text();
    let parsed: unknown = null;
    if (text !== "") {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (response.ok) return { status: response.status, body: parsed };
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

async function loadVault(dir: string): Promise<Vault> {
  const file = join(resolve(dir), "data", "gallery.json");
  const raw = await readFile(file, "utf8");
  const parsed = JSON.parse(raw) as Vault;
  if (!Array.isArray(parsed.collections) || !Array.isArray(parsed.entries)) {
    throw new Error(`"${file}" enthaelt keine collections/entries`);
  }
  return parsed;
}

// Bilder groesser als das Upload-Limit werden als JPEG in guter Qualitaet
// uebertragen; alles darunter geht unveraendert als Original durch.
async function encodeImage(path: string): Promise<string> {
  const bytes = await readFile(path);
  if (bytes.length <= MAX_UPLOAD_BYTES) return bytes.toString("base64");
  const { default: sharp } = await import("sharp");
  const smaller = await sharp(bytes)
    .resize({ width: 2600, withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  if (smaller.length > MAX_UPLOAD_BYTES) {
    throw new Error(`${basename(path)} bleibt auch als JPEG zu gross`);
  }
  return smaller.toString("base64");
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const vault = await loadVault(options.from);
  const imagesDir = join(resolve(options.from), "images");

  const collectionsAnswer = await request(options, "GET", "/api/reference-collections");
  const existingCollections =
    (collectionsAnswer.body as { collections: ApiCollection[] }).collections ?? [];
  const collectionByExternalId = new Map<string, ApiCollection>();
  const collectionByName = new Map<string, ApiCollection>();
  for (const collection of existingCollections) {
    if (collection.externalId !== null) {
      collectionByExternalId.set(collection.externalId, collection);
    }
    collectionByName.set(collection.name, collection);
  }

  let collectionsCreated = 0;
  let collectionsUpdated = 0;
  const collectionIds = new Map<string, string>();
  for (const [position, collection] of vault.collections.entries()) {
    const fields = {
      name: collection.name,
      description: collection.description ?? "",
      deployFor: collection.deployFor ?? "",
      vocabulary: collection.vocabulary ?? [],
      risk: collection.risk ?? "",
      accent: collection.accent ?? "",
      imageStyle: collection.imageStyle ?? "",
      position,
    };
    const existing =
      collectionByExternalId.get(collection.id) ?? collectionByName.get(collection.name);
    if (existing === undefined) {
      if (options.dryRun) {
        collectionsCreated += 1;
        collectionIds.set(collection.id, `dry-run:${collection.id}`);
        continue;
      }
      const created = await request(options, "POST", "/api/reference-collections", {
        ...fields,
        kind: "collection",
      });
      const id = (created.body as { collection: { id: string } }).collection.id;
      collectionIds.set(collection.id, id);
      collectionsCreated += 1;
      continue;
    }
    collectionIds.set(collection.id, existing.id);
    // A second run updates the values of the collections it created before; the
    // identity of a collection is its name (the API sets no external id), and
    // kind is fixed at creation, so it stays out of the update.
    if (!options.dryRun) {
      await request(
        options,
        "PATCH",
        `/api/reference-collections/${existing.id}`,
        fields,
      );
    }
    collectionsUpdated += 1;
  }

  const referencesAnswer = await request(options, "GET", "/api/references?limit=500");
  const existingReferences =
    (referencesAnswer.body as { references: ApiReference[] }).references ?? [];
  const referenceByName = new Map<string, ApiReference>();
  for (const reference of existingReferences) referenceByName.set(reference.name, reference);

  let referencesCreated = 0;
  let referencesUpdated = 0;
  const failures: string[] = [];
  const importedNames = new Set<string>();

  for (const [index, entry] of vault.entries.entries()) {
    importedNames.add(entry.title);
    const collectionId = collectionIds.get(entry.collection) ?? null;
    const fields = {
      name: entry.title,
      collectionId,
      note: entry.note ?? "",
      vocabulary: entry.vocabulary ?? [],
      imageRecipe: entry.imageRecipe ?? "",
      heroUsage: entry.heroUsage ?? "",
      family: entry.family ?? null,
    };
    const existing = referenceByName.get(entry.title);
    if (existing !== undefined) {
      if (!options.dryRun) {
        try {
          await request(options, "PATCH", `/api/references/${existing.id}`, fields);
        } catch (error) {
          failures.push(`${entry.title}: ${(error as Error).message}`);
          continue;
        }
      }
      referencesUpdated += 1;
      if ((index + 1) % 10 === 0) {
        process.stdout.write(`  ${index + 1}/${vault.entries.length} geprueft\n`);
      }
      continue;
    }
    if (options.dryRun) {
      referencesCreated += 1;
      continue;
    }
    try {
      const image = await encodeImage(join(imagesDir, entry.file));
      // Die Engine nimmt 60 Anfragen je Minute an: ein Bild je Taktung.
      await pause(1100);
      await request(options, "POST", "/api/references/manual", {
        ...fields,
        ...(entry.added === undefined ? {} : { capturedAt: entry.added }),
        image,
        author: AUTHOR,
      });
      referencesCreated += 1;
    } catch (error) {
      failures.push(`${entry.title}: ${(error as Error).message}`);
    }
    if ((index + 1) % 5 === 0 || index + 1 === vault.entries.length) {
      process.stdout.write(
        `  ${index + 1}/${vault.entries.length} uebertragen, ${referencesCreated} neu\n`,
      );
    }
  }

  let removedReferences = 0;
  let removedCollections = 0;
  if (options.cleanup) {
    for (const reference of existingReferences) {
      if (importedNames.has(reference.name)) continue;
      if (!options.dryRun) {
        await request(options, "DELETE", `/api/references/${reference.id}?force=true`);
      }
      removedReferences += 1;
    }
    const answer = await request(options, "GET", "/api/reference-collections");
    const current = (answer.body as { collections: ApiCollection[] }).collections ?? [];
    for (const collection of current) {
      if (collection.externalId !== null) continue;
      if (collection.referenceCount !== undefined && collection.referenceCount > 0) {
        continue;
      }
      if (!options.dryRun) {
        await request(options, "DELETE", `/api/reference-collections/${collection.id}`);
      }
      removedCollections += 1;
    }
  }

  const summary = {
    dryRun: options.dryRun,
    collections: {
      created: collectionsCreated,
      updated: collectionsUpdated,
      total: vault.collections.length,
    },
    references: {
      created: referencesCreated,
      updated: referencesUpdated,
      total: vault.entries.length,
    },
    cleanup: { references: removedReferences, collections: removedCollections },
    failures,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

await main();
