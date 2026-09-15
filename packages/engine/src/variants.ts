import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { encode as encodeBlurhash } from "blurhash";
import sharp from "sharp";
import { variantFilePath, variantStorageRef } from "./storage.ts";

export type VariantFormat = "avif" | "webp";

// Fixed ladder rungs; anything above the original width is dropped (no
// upscaling), so a 480 px photo only yields 64 and 320.
export const VARIANT_WIDTHS: readonly number[] = [64, 320, 640, 1024, 1600, 2048];
export const VARIANT_FORMATS: readonly VariantFormat[] = ["avif", "webp"];

export type GeneratedVariant = {
  width: number;
  format: VariantFormat;
  storageRef: string;
  byteSize: number;
};

export type ImageDerivatives = {
  variants: GeneratedVariant[];
  blurhash: string | null;
};

// Raster formats sharp re-encodes safely. SVG is resolution independent and an
// animated GIF would lose its frames, so both keep the original file only.
const VARIANT_MIMES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
];

const BLURHASH_SAMPLE_WIDTH = 32;
const BLURHASH_COMPONENTS_X = 4;
const BLURHASH_COMPONENTS_Y = 3;

export function supportsVariants(mime: string): boolean {
  return VARIANT_MIMES.includes(mime.trim().toLowerCase());
}

export function variantWidthsFor(originalWidth: number): number[] {
  return VARIANT_WIDTHS.filter((width) => width <= originalWidth);
}

async function encodeVariant(
  data: Buffer,
  width: number,
  format: VariantFormat,
): Promise<Buffer> {
  const resized = sharp(data, { failOn: "none" }).resize({
    width,
    withoutEnlargement: true,
  });
  return (
    format === "avif" ? resized.avif({ quality: 55 }) : resized.webp({ quality: 78 })
  ).toBuffer();
}

// The placeholder only needs rough colour fields: a 32 px sample keeps the
// blurhash cheap and independent of the variant ladder.
async function buildBlurhash(data: Buffer): Promise<string> {
  const { data: pixels, info } = await sharp(data, { failOn: "none" })
    .resize({ width: BLURHASH_SAMPLE_WIDTH, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(
    pixels.buffer,
    pixels.byteOffset,
    pixels.length,
  );
  return encodeBlurhash(
    rgba,
    info.width,
    info.height,
    BLURHASH_COMPONENTS_X,
    BLURHASH_COMPONENTS_Y,
  );
}

// Writes the AVIF/WebP rungs to <dataDir>/assets/<siteId>/<assetId>/variants/
// and returns their refs plus the blurhash. A failing blurhash must not lose
// already written variants, so it degrades to null on its own.
export async function buildImageDerivatives(input: {
  dataDir: string;
  siteId: string;
  assetId: string;
  data: Buffer;
  width: number | null;
}): Promise<ImageDerivatives> {
  const widths = input.width === null ? [] : variantWidthsFor(input.width);
  const variants: GeneratedVariant[] = [];
  for (const width of widths) {
    for (const format of VARIANT_FORMATS) {
      const encoded = await encodeVariant(input.data, width, format);
      const storageRef = variantStorageRef(input.siteId, input.assetId, width, format);
      const path = variantFilePath(
        input.dataDir,
        input.siteId,
        input.assetId,
        width,
        format,
      );
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, encoded);
      variants.push({ width, format, storageRef, byteSize: encoded.length });
    }
  }
  let blurhash: string | null = null;
  try {
    blurhash = await buildBlurhash(input.data);
  } catch {
    blurhash = null;
  }
  return { variants, blurhash };
}
