// SVG as a data URL: the address carries the picture, so it is decoded, never
// fetched. The markup is cleaned before it becomes an asset: a file that
// reaches the media library may be opened directly, and an SVG can carry a
// script. What survives is what draws: shapes, fills, strokes, gradients.
//
// The rules (ADR-0005 keeps `data:image/svg+xml` out of CSS values, because
// SVG can carry a script; an imported picture is the same case):
//
// - no `<script>`, no `<foreignObject>` (it embeds HTML),
// - no `on*` event handlers,
// - no reference that leaves the file: `href` may only be a fragment (`#id`),
// - no `url(...)` in a style that points outside the file.

export type DataUrlContent = {
  mime: string;
  bytes: Buffer;
};

const DATA_URL = /^data:([^,]*),([\s\S]*)$/i;

// The media type of a data URL. Only the type itself counts; the parameters
// (`;base64`, `;charset=…`) are read separately.
export function dataUrlMime(url: string): string | null {
  const match = DATA_URL.exec(url);
  if (match === null) return null;
  return (match[1] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

// The bytes of a data URL. `data:` carries them, so nothing is fetched and
// no address check is needed: there is no host to reach.
export function decodeDataUrl(url: string): DataUrlContent | null {
  const match = DATA_URL.exec(url);
  if (match === null) return null;
  const meta = match[1] ?? "";
  const payload = match[2] ?? "";
  const mime = meta.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime === "") return null;
  if (/;base64/i.test(meta)) {
    return { mime, bytes: Buffer.from(payload.replace(/\s+/g, ""), "base64") };
  }
  try {
    return { mime, bytes: Buffer.from(decodeURIComponent(payload), "utf8") };
  } catch {
    return { mime, bytes: Buffer.from(payload, "utf8") };
  }
}

// --- the cleaner ----------------------------------------------------------

// Elements that carry code or embed a foreign document.
const FORBIDDEN_ELEMENTS = ["script", "foreignobject", "iframe", "object", "embed", "handler"];

const EVENT_HANDLER = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

// A reference that leaves the file: any scheme, a protocol-relative address
// or an absolute path to another document.
const EXTERNAL_REFERENCE = /^\s*(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i;

export function sanitizeSvg(markup: string): string {
  let out = markup;
  // The elements with their content.
  for (const element of FORBIDDEN_ELEMENTS) {
    out = out.replace(new RegExp(`<${element}\\b[\\s\\S]*?(?:</${element}\\s*>|$)`, "gi"), "");
  }
  // The event handlers.
  out = out.replace(EVENT_HANDLER, "");
  // The references that leave the file.
  out = out.replace(
    /(\s(?:xlink:)?href\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (whole, prefix: string, value: string) => {
      const unquoted = value.replace(/^["']|["']$/g, "");
      if (!unquoted.startsWith("#")) return "";
      return `${prefix}${value}`;
    },
  );
  // A style that points outside the file.
  out = out.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (whole, quote: string, target: string) => {
    if (target.trim().startsWith("#")) return whole;
    return "none";
  });
  // A style block that imports or points outside.
  out = out.replace(/@import[^;]*;?/gi, "");
  return out;
}

// Is this markup an SVG picture? The media type decides, not the shape: a
// file that claims to be an image but carries HTML is not a picture.
export function isSvgMarkup(mime: string, bytes: Buffer): boolean {
  if (mime !== "image/svg+xml") return false;
  const head = bytes.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<svg") || head.startsWith("<?xml") || head.includes("<svg");
}
