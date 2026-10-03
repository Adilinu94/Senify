// The inline markup of the `body` primitive: a small, closed vocabulary that
// is sanitized at render time, whatever the author or an import stored.
//
// An allow-list tokenizer, not a regex scrub: every tag outside the list is
// dropped (its text stays), `script`/`style` content is dropped with the tag,
// attributes are rebuilt from scratch (only `href`, `target`, `rel` on `a`),
// and any `<` or bare `&` that is not part of an allowed construct is escaped.
// Nothing in the output can start a script or load a resource.

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

function openTag(name: string, rawAttrs: string): string {
  if (name !== "a") return `<${name}>`;
  const href = attributeOf(rawAttrs, "href");
  const parts = ["a"];
  if (href !== undefined && isSafeHref(href)) parts.push(`href="${escapeAttr(href.trim())}"`);
  if (attributeOf(rawAttrs, "target")?.toLowerCase() === "_blank") {
    parts.push('target="_blank"', 'rel="noopener noreferrer"');
  }
  return `<${parts.join(" ")}>`;
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
