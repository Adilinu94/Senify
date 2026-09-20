import { createHash } from "node:crypto";
import { SenifyError } from "@senify/core";
import { imageDimensions } from "./media.ts";
import { buildDocumentProfile } from "./references-documents.ts";
import {
  MANUAL_REFERENCE_MAX_BYTES,
  referenceDocumentsFrom,
  type ManualReferenceBody,
} from "./references-contract.ts";
import {
  persistReferenceSnapshots,
  type ReferenceContext,
} from "./references-lifecycle.ts";
import { REFERENCE_STYLE_CATALOG } from "./references-styles.ts";
import type { Store } from "./store.ts";
import type { Reference, ReferenceProvenance } from "./types.ts";

// The manually stored reference (Taste Vault "Add reference"): an uploaded
// screenshot becomes a ready reference with a snapshot and no analysis profile.
// The style catalog of the reference library is seeded from here as well.

const PNG_MAGIC = "89504e470d0a1a0a";

// What the style guide carries above the families: where the borrowed language
// comes from and how many families it has.
export function referenceStyleCatalogInfo(): {
  total: number;
  description: string;
  license: string;
  source: string;
} {
  return {
    total: REFERENCE_STYLE_CATALOG.styles.length,
    description: REFERENCE_STYLE_CATALOG.description,
    license: REFERENCE_STYLE_CATALOG.license,
    source: REFERENCE_STYLE_CATALOG.source,
  };
}

export type DecodedReferenceImage = {
  bytes: Buffer;
  mime: string;
  // Container of the stored snapshot; the preview URL serves it by extension.
  extension: "png" | "jpg" | "webp";
};

function tooLargeError(maxBytes: number): SenifyError {
  const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);
  return new SenifyError(
    "validation",
    `Das Bild ist zu groß. Erlaubt sind höchstens ${mb(maxBytes)} MB`,
    {
      field: "image",
      suggestion: "Das Bild verkleinern oder einen Ausschnitt hochladen.",
    },
  );
}

function sniffImage(bytes: Buffer): DecodedReferenceImage["mime"] | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).toString("hex") === PNG_MAGIC) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

const MIME_EXTENSIONS: Record<string, DecodedReferenceImage["extension"]> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// Decodes the uploaded image and names its container. The size cap is checked
// on the encoded string first, so an oversized payload never gets decoded.
export function decodeReferenceImage(
  image: string,
  maxBytes = MANUAL_REFERENCE_MAX_BYTES,
): DecodedReferenceImage {
  const encoded = image.trim().replace(/^data:image\/[a-z0-9+.-]+;base64,/i, "");
  if (encoded === "") {
    throw new SenifyError("validation", "Es wurde kein Bild übermittelt", {
      field: "image",
      suggestion: "Das Bild als Base64 (PNG, JPEG oder WebP) mitschicken.",
    });
  }
  if (encoded.length > Math.ceil(maxBytes / 3) * 4) throw tooLargeError(maxBytes);
  if (!/^[A-Za-z0-9+/=]+$/.test(encoded)) {
    throw new SenifyError("validation", "Das Bild ist kein gültiges Base64", {
      field: "image",
      suggestion: "Das Bild ohne Zeilenumbrüche und Zusätze als Base64 senden.",
    });
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > maxBytes) throw tooLargeError(maxBytes);
  const mime = sniffImage(bytes);
  const extension = mime === undefined ? undefined : MIME_EXTENSIONS[mime];
  if (mime === undefined || extension === undefined) {
    throw new SenifyError(
      "validation",
      "Nur PNG, JPEG und WebP werden als Referenz unterstützt",
      {
        field: "image",
        suggestion: "Das Bild als PNG, JPEG oder WebP senden.",
      },
    );
  }
  return { bytes, mime, extension };
}

function terms(values: string[]): string[] {
  const cleaned: string[] = [];
  for (const value of values) {
    const term = value.trim();
    if (term !== "" && !cleaned.includes(term)) cleaned.push(term);
  }
  return cleaned;
}

export async function createManualReference(
  context: ReferenceContext,
  input: ManualReferenceBody,
): Promise<Reference> {
  const name = input.name.trim();
  if (name === "") {
    throw new SenifyError("validation", "Der Name der Referenz fehlt", {
      field: "name",
      suggestion: "Der Name ist Pflicht, das Vorbild leitet ihn aus dem Dateinamen ab.",
    });
  }
  const collection =
    input.collectionId === undefined || input.collectionId === null
      ? null
      : await context.store.getReferenceCollection(input.collectionId);
  const image = decodeReferenceImage(input.image);
  const dimensions = imageDimensions(image.bytes, image.mime);
  if (dimensions === undefined) {
    throw new SenifyError("validation", "Die Bildgröße ließ sich nicht lesen", {
      field: "image",
      suggestion: "Ein vollständiges PNG, JPEG oder WebP senden.",
    });
  }
  const mobile =
    input.imageMobile === undefined ? null : decodeReferenceImage(input.imageMobile);
  const mobileDimensions =
    mobile === null ? undefined : imageDimensions(mobile.bytes, mobile.mime);
  if (mobile !== null && mobileDimensions === undefined) {
    throw new SenifyError("validation", "Die Bildgröße des Mobilbilds ließ sich nicht lesen", {
      field: "imageMobile",
      suggestion: "Ein vollständiges PNG, JPEG oder WebP senden.",
    });
  }
  // Imported documents turn the reference into a documented one: the profile is
  // read out of them, so theme derivation and the redesign package work without
  // a live capture. An upload without documents stays profile-less.
  const documents = referenceDocumentsFrom(input.documents);
  const documented =
    documents.design !== null ||
    documents.guidelines !== null ||
    documents.components !== null;
  const sourceUrl = input.sourceUrl?.trim() ?? "";
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const provenance: ReferenceProvenance = {
    url: sourceUrl,
    capturedAt,
    hash: createHash("sha256").update(image.bytes).digest("hex"),
    method: "manual",
    note: documented
      ? "Import mit Design-Dokumenten (Profil aus den Dokumenten gelesen)"
      : "Manuell abgelegte Referenz (Bild-Upload, kein Analyseprofil)",
    author: input.author,
  };
  const reference = await context.store.createReference({
    name,
    // A reference without a source carries its image; an import names the page.
    sourceUrl,
    method: "manual",
    origin: "manual",
    status: "ready",
    stage: "ready",
    progress: 100,
    collectionId: collection?.id ?? null,
    note: input.note === undefined ? null : input.note.trim(),
    imageRecipe:
      input.imageRecipe === undefined ? null : input.imageRecipe.trim(),
    heroUsage: input.heroUsage === undefined ? null : input.heroUsage.trim(),
    documents,
    provenance,
  });
  await context.store.updateReference(reference.id, {
    vocabulary: terms(input.vocabulary ?? []),
    ...(input.family === undefined ? {} : { family: input.family }),
    snapshots: persistReferenceSnapshots(context, reference.id, [
      {
        breakpoint: "manual",
        kind: "fullpage",
        bytes: image.bytes,
        width: dimensions.width,
        height: dimensions.height,
        extension: image.extension,
      },
      ...(mobile === null || mobileDimensions === undefined
        ? []
        : [
            {
              breakpoint: "mobile",
              kind: "fullpage" as const,
              bytes: mobile.bytes,
              width: mobileDimensions.width,
              height: mobileDimensions.height,
              extension: mobile.extension,
            },
          ]),
    ]),
  });
  if (documents.design !== null || documents.components !== null) {
    const built = buildDocumentProfile({
      name,
      sourceUrl: sourceUrl === "" ? null : sourceUrl,
      capturedAt,
      design: documents.design ?? "",
      guidelines: documents.guidelines,
      components: documents.components,
    });
    await context.store.createReferenceProfileRevision({
      referenceId: reference.id,
      profile: built.profile,
      evidence: built.evidence,
      provenance,
      author: input.author ?? { kind: "human", id: "import", label: "Import" },
      note: "Aus Design.md gelesen",
    });
    await context.store.updateReference(reference.id, {
      styleBrief: built.profile.styleBrief,
      families: built.profile.families,
      vocabulary: built.profile.vocabulary,
    });
  }
  return context.store.getReference(reference.id);
}

export type ReferenceStyleSeedResult = {
  created: number;
  existing: number;
  total: number;
};

// The style families are adopted once: an existing row (matched by its
// external id) is never overwritten, not even a renamed one.
export async function seedReferenceStyles(
  store: Store,
): Promise<ReferenceStyleSeedResult> {
  const styles = await store.listReferenceCollections({ kind: "style" });
  const known = new Set(styles.map((collection) => collection.externalId));
  let created = 0;
  for (const [position, family] of REFERENCE_STYLE_CATALOG.styles.entries()) {
    if (known.has(family.id)) continue;
    await store.createReferenceCollection({
      name: family.name,
      deployFor: family.deployFor,
      vocabulary: [...family.vocabulary],
      risk: family.risk,
      imageStyle: family.imageStyle ?? "",
      recognize: [...family.recognize],
      examples: family.canonical.map((entry) => ({ ...entry })),
      warning: family.warning ?? null,
      kind: "style",
      externalId: family.id,
      position,
    });
    created += 1;
  }
  return {
    created,
    existing: styles.length,
    total: REFERENCE_STYLE_CATALOG.styles.length,
  };
}
