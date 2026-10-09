import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { SenifyError } from "@senify/core";
import { createRegistry } from "@senify/registry";
import type { PropSpec, Registry, SectionDefinition } from "@senify/section-sdk";
import type { PageSummaryInput } from "./outline.ts";
import type { ToolContext } from "./tools.ts";

// The machinery every tool goes through (P3-2 extraction from `tools.ts`):
// the argument readers, the schema helpers, paging and the shared HTTP calls.
//
// The tool definitions themselves stay in `tools.ts` - the manifest generator
// reads that file as text (`scripts/render-manifest.mjs`), so a tool moved out
// of it would silently vanish from the manifest. What moves is everything that
// is not a tool: this layer, which the tools call and the generator never
// parses. The output schemas (SITE_SCHEMA and friends) stay as well: they are
// named in the tool definitions, and a generator reading names is not helped
// by a value living elsewhere.

let cachedRegistry: Registry | undefined;

export function registry(): Registry {
  cachedRegistry ??= createRegistry();
  return cachedRegistry;
}

export function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

// The output schemas of the reading tools (P3-3, R8). They are written next to
// the handler that produces the value, and the server refuses to send
// `structuredContent` whose value does not validate - a schema the code does not
// keep is worse than no schema, because the client stops checking.
//
// Only the fields a client actually branches on are required; everything else
// is described but not demanded, so a later field addition does not break a
// client that validated against the older schema.
export function listSchema(key: string, item: unknown): Record<string, unknown> {
  return {
    type: "object",
    properties: { [key]: { type: "array", items: item } },
    required: [key],
    additionalProperties: true,
  };
}

// The engine cuts every list route to one page (default 50, cap 200). A list
// tool therefore has to pass `limit` and `offset` on, or an agent that sees
// `hasMore: true` has no way to ask for the next page. The values travel
// unchanged: the engine validates them and refuses what is out of range.
export function pagingQuery(
  args: Record<string, unknown>,
  params: URLSearchParams = new URLSearchParams(),
): string {
  const limit = optionalNumber(args, "limit");
  if (limit !== undefined) params.set("limit", String(limit));
  const offset = optionalNumber(args, "offset");
  if (offset !== undefined) params.set("offset", String(offset));
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new SenifyError("validation", `Missing or invalid "${key}"`, {
      field: key,
      suggestion: `Pass "${key}" as a non-empty string.`,
    });
  }
  return value;
}

export function requireNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SenifyError("validation", `Missing or invalid "${key}"`, {
      field: key,
      suggestion: `Pass "${key}" as a number.`,
    });
  }
  return value;
}

export function requireRecord(
  args: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = args[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SenifyError("validation", `Missing or invalid "${key}"`, {
      field: key,
      suggestion: `Pass "${key}" as an object.`,
    });
  }
  return value as Record<string, unknown>;
}

export function requireArray(args: Record<string, unknown>, key: string): unknown[] {
  const value = args[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new SenifyError("validation", `Missing or invalid "${key}"`, {
      field: key,
      suggestion: `Pass "${key}" as a non-empty array.`,
    });
  }
  return value;
}

export function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new SenifyError("validation", `"${key}" must be a string`, {
      field: key,
    });
  }
  return value;
}

export function optionalBoolean(
  args: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new SenifyError("validation", `"${key}" must be a boolean`, {
      field: key,
    });
  }
  return value;
}

export function optionalNumber(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SenifyError("validation", `"${key}" must be a number`, {
      field: key,
    });
  }
  return value;
}

export function optionalNullableString(
  args: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new SenifyError("validation", `"${key}" must be a string or null`, {
      field: key,
    });
  }
  return value;
}

export function optionalStringArray(
  args: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new SenifyError("validation", `"${key}" must be an array of strings`, {
      field: key,
    });
  }
  return value as string[];
}

export const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
};

export function readLocalFile(filePath: string): Buffer {
  try {
    return readFileSync(filePath);
  } catch {
    throw new SenifyError("not_found", `File "${filePath}" is not readable`, {
      field: "filePath",
      suggestion: "Pass an absolute path to an existing local file.",
    });
  }
}

export function mimeForPath(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension];
  if (mime === undefined) {
    throw new SenifyError(
      "validation",
      `Unsupported file extension "${extension}"`,
      {
        field: "filePath",
        suggestion: `Use one of: ${Object.keys(MIME_BY_EXTENSION).join(", ")}.`,
      },
    );
  }
  return mime;
}

// Signed upload, shared by upload_asset and replace_asset: ask the engine for a
// URL, then PUT the raw bytes to it.
export async function uploadLocalFile(
  context: ToolContext,
  input: { siteId: string; filePath: string; extra: Record<string, unknown> },
): Promise<unknown> {
  const bytes = readLocalFile(input.filePath);
  const mime = mimeForPath(input.filePath);
  const ticket = await context.client.request<{ uploadId: string; url: string }>(
    "POST",
    `/api/sites/${input.siteId}/assets/upload-url`,
    {
      filename: basename(input.filePath),
      mime,
      byteSize: bytes.length,
      ...input.extra,
    },
  );
  return context.client.uploadBytes("PUT", ticket.url, bytes, mime);
}

export function propInfo(spec: PropSpec): Record<string, unknown> {
  return {
    key: spec.key,
    label: spec.label,
    control: spec.control,
    ...(spec.group === undefined ? {} : { group: spec.group }),
    ...(spec.part === undefined ? {} : { part: spec.part }),
    ...(spec.tokenGroup === undefined ? {} : { tokenGroup: spec.tokenGroup }),
    ...(spec.options === undefined
      ? {}
      : { options: spec.options.map((option) => option.value) }),
    ...(spec.min === undefined ? {} : { min: spec.min }),
    ...(spec.max === undefined ? {} : { max: spec.max }),
    ...(spec.step === undefined ? {} : { step: spec.step }),
  };
}

export function sectionInfo(definition: SectionDefinition): Record<string, unknown> {
  return {
    type: definition.type,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    props: definition.props.map(propInfo),
    styleProps: (definition.styleProps ?? []).map(propInfo),
    variants: Object.entries(definition.variants ?? {}).map(([name, variant]) => ({
      name,
      label: variant.label,
    })),
    allowedChildren: definition.allowedChildren ?? "none",
    motionPresets: definition.motionPresets ?? [],
    ...(definition.slots === undefined ? {} : { slots: definition.slots }),
    goldenVersion: definition.version,
  };
}

export async function pageFor(
  context: ToolContext,
  pageId: string,
): Promise<PageSummaryInput> {
  return context.client.request<PageSummaryInput>("GET", `/api/pages/${pageId}`);
}
