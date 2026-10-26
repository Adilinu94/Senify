// The inline markup of the `body` primitive: a small, closed vocabulary that
// is sanitized at render time, whatever the author or an import stored.
//
// An allow-list tokenizer, not a regex scrub: every tag outside the list is
// dropped (its text stays), `script`/`style` content is dropped with the tag,
// attributes are rebuilt from scratch (only `href`, `target`, `rel` on `a`,
// and a `style` whose declarations pass the value grammar), and any `<` or
// bare `&` that is not part of an allowed construct is escaped. Nothing in the
// output can start a script or load a resource.

import { isSafeCssProperty, isSafeCssValue } from "./css/value-grammar.ts";

const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre",
  "a", "span", "strong", "em", "b", "i", "u", "s", "br", "code", "small", "sub", "sup", "mark", "del", "ins",
]);

// Their content is not text either: it is dropped together with the tag.
const DROPPED_WITH_CONTENT: ReadonlySet<string> = new Set([
  "script", "style", "noscript", "template", "iframe", "object", "embed", "svg", "math",
]);

const SAFE_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto", "tel"]);

// A link target the page may carry: a relative reference, an anchor, or one of
// the four plain schemes. `javascript:` and `data:` (also when split by
// whitespace or control characters) are not.
export function isSafeHref(href: string): boolean {
  // Whitespace and control characters are stripped before the scheme is read:
  // browsers ignore them inside a scheme (`java\tscript:`), so must the check.
  const compact = [...href].filter((char) => char.charCodeAt(0) > 0x20 && !(char.charCodeAt(0) >= 0x7f && char.charCodeAt(0) <= 0x9f)).join("");
  if (compact === "") return false;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact)?.[1];
  return scheme === undefined ? true : SAFE_SCHEMES.has(scheme.toLowerCase());
}

const ENTITY = /^(?:#\d{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/;

function escapeText(value: string): string {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (char === "<") out += "&lt;";
    else if (char === ">") out += "&gt;";
    else if (char === "&") out += ENTITY.test(value.slice(index + 1, index + 40)) ? "&" : "&amp;";
    else out += char;
  }
  return out;
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function attributeOf(raw: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(raw);
  return match === null ? undefined : (match[1] ?? match[2] ?? match[3] ?? "");
}

// A class the inline markup may carry: only the one the IMPORT writes on a word
// span to give it its own animation (`senify-inline-<id>`). The sanitizer is an
// allow-list, so a page cannot smuggle its own class through it — and the import
// needs exactly this one handle, because a Framer headline's words live inside
// this markup and each plays its own reveal.
const INLINE_CLASS = /^senify-inline-[A-Za-z0-9_-]+$/;

function openTag(name: string, rawAttrs: string): string {
  const parts: string[] = [name];
  if (name === "a") {
    const href = attributeOf(rawAttrs, "href");
    if (href !== undefined && isSafeHref(href)) parts.push(`href="${escapeAttr(href.trim())}"`);
    if (attributeOf(rawAttrs, "target")?.toLowerCase() === "_blank") {
      parts.push('target="_blank"', 'rel="noopener noreferrer"');
    }
  }
  const className = attributeOf(rawAttrs, "class");
  if (className !== undefined && INLINE_CLASS.test(className.trim())) {
    parts.push(`class="${escapeAttr(className.trim())}"`);
  }
  const style = safeStyleAttribute(attributeOf(rawAttrs, "style"));
  if (style !== undefined) parts.push(`style="${escapeAttr(style)}"`);
  return `<${parts.join(" ")}>`;
}

// A style attribute is CSS, so it goes through the same grammar as every
// other value (ADR-0005): the property name follows the ADR's pattern, the
// value passes the value grammar, and nothing may load a resource — the
// promise this module makes. A declaration that fails is dropped; the rest
// of the attribute stays. Every declaration that survives is checked on its
// own, so what is emitted is what was checked.
//
// The source uses it for the look of a single word inside a flowing text
// (the marked word of the testimonial). Without it, the word loses its
// background and the text reads different from the source.
function safeStyleAttribute(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const erlaubt: string[] = [];
  for (const deklaration of splitDeclarations(raw)) {
    const trimmed = deklaration.trim();
    if (trimmed === "") continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const name = trimmed.slice(0, colon).trim();
    const wert = trimmed.slice(colon + 1).trim();
    if (name === "" || wert === "") continue;
    if (!isSafeCssProperty(name)) continue;
    // A value that loads a resource breaks the promise of this module — the
    // grammar allows a `url()` with an https address.
    if (/url\s*\(/i.test(wert)) continue;
    if (!isSafeCssValue(wert)) continue;
    erlaubt.push(`${name}:${wert}`);
  }
  if (erlaubt.length === 0) return undefined;
  return erlaubt.join(";");
}

// The declarations of a style attribute. A `;` inside a string does not end
// a declaration (`content: "a;b"`).
function splitDeclarations(raw: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote = "";
  for (const char of raw) {
    if (quote !== "") {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

export function sanitizeInlineHtml(input: string): string {
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g;
  const open: string[] = [];
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(input)) !== null) {
    out += escapeText(input.slice(last, match.index));
    last = match.index + match[0].length;
    const closing = match[1] === "/";
    const name = (match[2] ?? "").toLowerCase();
    if (DROPPED_WITH_CONTENT.has(name)) {
      if (!closing) {
        const end = new RegExp(`</${name}\\s*>`, "i").exec(input.slice(last));
        last = end === null ? input.length : last + end.index + end[0].length;
        tag.lastIndex = last;
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(name)) continue;
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    if (name === "br") {
      out += "<br>";
      continue;
    }
    out += openTag(name, match[3] ?? "");
    open.push(name);
  }
  out += escapeText(input.slice(last));
  while (open.length > 0) out += `</${open.pop()}>`;
  return out;
}
