// The value grammar of the open style space (ADR-0005, ticket 07 stage 0).
//
// Decision O13 opens the style property space: the property table describes the
// editor's controls, it is no longer a write gate. That removes the whitelist
// which — until now — was the *de facto* security boundary of the style path
// (there is no CSS sanitizer in this repository). This module is the named
// replacement: an **allowlist on the value form**, not a denylist on
// substrings.
//
// Why an allowlist: CSS lets a value carry escapes (`\61`), comments
// (`java/**/script`), arbitrary casing (`URL( JAVASCRIPT:…)`) and whitespace.
// A check for the literal text `javascript:` is bypassed by every one of these.
// The only reliable order is:
//
//   1. normalize (resolve escapes, drop comments, collapse whitespace),
//   2. parse the normalized text against a grammar,
//   3. emit exactly the text that was validated.
//
// Step 3 matters as much as step 2: validating one string and emitting another
// is how bypasses survive. `parseCssValue` returns the normalized, validated
// form and that is what the compiler writes out.
//
// The module is pure (no SenifyError, no DOM) so the widget engine keeps its
// dependency-free position; callers turn a `problem` into their own error type.

export type CssValueResult =
  | { ok: true; value: string }
  | { ok: false; problem: string };

// ------------------------------------------------------------------ normalize

// `\61` -> `a`, `\000061` -> `a`, `\ ` -> a literal space. Six hex digits are
// the maximum; the space after a hex escape belongs to the escape.
export function resolveCssEscapes(input: string): string {
  return input.replace(/\\([0-9a-fA-F]{1,6}[ \t\n\r\f]?|[\s\S])/g, (_match, escape: string) => {
    if (/^[0-9a-fA-F]/.test(escape)) {
      const hex = escape.replace(/[ \t\n\r\f]$/, "");
      const code = Number.parseInt(hex, 16);
      if (!Number.isFinite(code) || code === 0 || code > 0x10ffff) return "\uFFFD";
      return String.fromCodePoint(code);
    }
    return escape;
  });
}

// A comment is a token separator in CSS, so it becomes a space — not nothing.
export function stripCssComments(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, " ");
}

// The text every check runs on. Control characters that are not whitespace stay
// in place: the parser rejects them, which is the correct outcome.
export function normalizeCssText(input: string): string {
  const withoutComments = stripCssComments(input);
  const resolved = resolveCssEscapes(withoutComments);
  return resolved.replace(/[ \t\n\r\f]+/g, " ").trim();
}

// ------------------------------------------------------------------ allowlist

// Length and time units, plus the container-query and viewport variants. A bare
// number needs no unit; a number followed by a letter is a dimension and its
// unit must be in this list.
const UNITS = new Set([
  "px", "rem", "em", "%", "vw", "vh", "vmin", "vmax", "dvh", "dvw", "svh", "svw",
  "lvh", "lvw", "ch", "ex", "cap", "ic", "lh", "rlh", "fr", "s", "ms", "deg",
  "rad", "grad", "turn", "dpi", "dpcm", "dppx", "q", "cm", "mm", "in", "pt",
  "pc", "cqw", "cqh", "cqi", "cqb", "cqmin", "cqmax", "vi", "vb", "x",
]);

// Functions a value may call. Everything else is rejected: an unknown function
// is either a typo or an attempt to smuggle an unparsed construct through.
// `url` is handled separately because its content is not a value.
const FUNCTIONS = new Set([
  // variables and math
  "var", "calc", "min", "max", "clamp", "minmax", "repeat", "fit-content",
  "abs", "sign", "round", "mod", "rem", "pow", "sqrt", "hypot", "log", "exp",
  // colors
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color",
  "color-mix", "device-cmyk", "light-dark",
  // gradients and images
  "linear-gradient", "radial-gradient", "conic-gradient",
  "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient",
  "image-set", "cross-fade", "element", "paint",
  // transforms
  "translate", "translatex", "translatey", "translatez", "translate3d",
  "rotate", "rotatex", "rotatey", "rotatez", "rotate3d",
  "scale", "scalex", "scaley", "scalez", "scale3d",
  "skew", "skewx", "skewy", "matrix", "matrix3d", "perspective",
  // filters and shapes
  "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate",
  "invert", "opacity", "saturate", "sepia", "inset", "circle", "ellipse",
  "polygon", "path",
  // timing and environment
  "cubic-bezier", "steps", "linear", "env", "attr", "counter", "counters", "symbols",
]);

const PROPERTY_PATTERN = /^(--[a-zA-Z0-9_-]+|-?[a-zA-Z][a-zA-Z0-9-]*)$/;
const NUMBER_PATTERN = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?/;

export function isSafeCssProperty(name: string): boolean {
  return PROPERTY_PATTERN.test(name);
}

// -------------------------------------------------------------------- scanner

class Problem extends Error {}

class Scanner {
  readonly #text: string;
  #at = 0;

  constructor(text: string) {
    this.#text = text;
  }

  get done(): boolean {
    return this.#at >= this.#text.length;
  }

  rest(): string {
    return this.#text.slice(this.#at);
  }

  peek(offset = 0): string {
    return this.#text[this.#at + offset] ?? "";
  }

  take(): string {
    return this.#text[this.#at++] ?? "";
  }

  skipSpaces(): boolean {
    let skipped = false;
    while (!this.done && this.peek() === " ") {
      this.take();
      skipped = true;
    }
    return skipped;
  }
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isHex(char: string): boolean {
  return /[0-9a-fA-F]/.test(char);
}

function isIdentStart(char: string): boolean {
  return /[a-zA-Z_-]/.test(char);
}

function isIdentChar(char: string): boolean {
  return /[a-zA-Z0-9_-]/.test(char);
}

function isOperator(char: string): boolean {
  return char === "+" || char === "*" || char === "-";
}

// Joins validated components. Comma and slash attach to their left neighbour,
// operators keep spaces — the canonical spelling the compiler emits.
function render(parts: readonly string[]): string {
  const joined = parts.join(" ").replace(/ ,/g, ",");
  return joined.replace(/ {2,}/g, " ").trim();
}

// ------------------------------------------------------------------ the parse

function parseString(s: Scanner): string {
  const quote = s.take();
  let out = quote;
  while (!s.done) {
    const char = s.take();
    if (char === "\n" || char === "\r") throw new Problem("newline in a string");
    if (char === quote) return out + quote;
    out += char;
  }
  throw new Problem("unterminated string");
}

function parseHash(s: Scanner): string {
  s.take();
  let hex = "";
  while (!s.done && isHex(s.peek())) hex += s.take();
  if (hex.length !== 3 && hex.length !== 4 && hex.length !== 6 && hex.length !== 8) {
    throw new Problem(`invalid hex colour "#${hex}"`);
  }
  return `#${hex}`;
}

function parseNumberOrDimension(s: Scanner): string {
  const match = NUMBER_PATTERN.exec(s.rest());
  if (match === null) throw new Problem("invalid number");
  const number = match[0];
  for (let index = 0; index < number.length; index += 1) s.take();
  if (s.peek() === "%") {
    s.take();
    return `${number}%`;
  }
  if (isIdentStart(s.peek())) {
    let unit = "";
    while (!s.done && isIdentChar(s.peek())) unit += s.take();
    const lower = unit.toLowerCase();
    if (!UNITS.has(lower)) throw new Problem(`unit "${unit}" is not allowed`);
    return `${number}${lower}`;
  }
  return number;
}

// The content of `url(...)`: not a value, a reference. Relative paths, `/`
// paths, `https:` and `data:image/*` are allowed; every other scheme falls
// through — including all escape variants, because the text is already
// normalized when this runs.
function parseUrl(s: Scanner): string {
  let content = "";
  let depth = 0;
  while (!s.done) {
    const char = s.peek();
    if (char === ")" && depth === 0) break;
    if (char === '"' || char === "'") {
      content += parseString(s);
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    content += s.take();
  }
  if (s.done) throw new Problem("unterminated url(");
  s.take();

  const trimmed = content.trim();
  if (trimmed === "") throw new Problem("empty url()");
  let url = trimmed;
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    if (trimmed.length < 2 || trimmed[trimmed.length - 1] !== trimmed[0]) {
      throw new Problem("unterminated string in url()");
    }
    url = trimmed.slice(1, -1);
  } else if (/\s/.test(trimmed)) {
    throw new Problem("an unquoted url() must not contain spaces");
  }
  if (!isSafeUrl(url)) throw new Problem(`url scheme is not allowed: ${url}`);
  return `url(${trimmed})`;
}

function isSafeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (url.includes("\\") || /[\n\r\t]/.test(url)) return false;
  const colon = lower.indexOf(":");
  if (colon < 0) {
    // No scheme: a relative path. `//host/x` is scheme-relative — not relative.
    return !lower.startsWith("//");
  }
  if (lower.startsWith("https://")) return true;
  // ADR-0005: only raster images may travel as a data URL. An SVG can carry a
  // script, so it is excluded — it becomes an asset (cleaned up) instead.
  return /^data:image\/(png|jpeg|jpg|gif|webp|avif)[;,]/.test(lower);
}

// A bare `(` group, used inside `calc((100% - 20px) / 2)`.
function parseGroup(s: Scanner): string {
  s.take();
  const body = parseSequence(s, ")");
  s.take();
  return `(${body})`;
}

// Components, operators and separators up to (not including) the terminator.
function parseSequence(s: Scanner, terminator: string): string {
  const parts: string[] = [];
  s.skipSpaces();
  while (!s.done && s.peek() !== terminator) {
    const char = s.peek();
    if (char === "," || char === "/") {
      s.take();
      parts.push(char);
      s.skipSpaces();
      continue;
    }
    // `-` opens an identifier when a name character follows directly
    // (`--token-1f29`, `-webkit-box`): CSS requires whitespace around the
    // arithmetic minus, so `a - b` is an operator and `--x` is a name. Reading
    // `--x` as two operators wrote `var(- - x)`, which no browser accepts.
    if (isOperator(char) && !isDigit(s.peek(1)) && !(char === "-" && isIdentStart(s.peek(1)))) {
      s.take();
      parts.push(char);
      s.skipSpaces();
      continue;
    }
    parts.push(parseComponent(s));
    s.skipSpaces();
  }
  if (s.done) throw new Problem("unterminated group or function");
  return render(parts);
}

function parseFunction(s: Scanner, name: string): string {
  s.take();
  if (name === "url") return parseUrl(s);
  if (!FUNCTIONS.has(name)) throw new Problem(`function "${name}" is not allowed`);
  const body = parseSequence(s, ")");
  s.take();
  return `${name}(${body})`;
}

function parseComponent(s: Scanner): string {
  const char = s.peek();
  if (char === '"' || char === "'") return parseString(s);
  if (char === "#") return parseHash(s);
  if (char === "(") return parseGroup(s);
  if (
    isDigit(char) ||
    ((char === "+" || char === "-" || char === ".") &&
      (isDigit(s.peek(1)) || (s.peek(1) === "." && isDigit(s.peek(2)))))
  ) {
    return parseNumberOrDimension(s);
  }
  if (isIdentStart(char)) {
    let name = "";
    while (!s.done && isIdentChar(s.peek())) name += s.take();
    if (s.peek() === "(") return parseFunction(s, name.toLowerCase());
    if (name === "" || name === "-") throw new Problem("a bare dash is not a value");
    return name;
  }
  throw new Problem(`unexpected "${char}" in a value`);
}

// The whole value: a list of components with `,`, `/` and whitespace between.
function parseValue(s: Scanner): string {
  const parts: string[] = [];
  s.skipSpaces();
  while (!s.done) {
    const char = s.peek();
    if (char === "," || char === "/") {
      s.take();
      parts.push(char);
      s.skipSpaces();
      if (s.done) throw new Problem("a value must not end with a separator");
      continue;
    }
    parts.push(parseComponent(s));
    if (!s.skipSpaces() && !s.done && s.peek() !== "," && s.peek() !== "/") {
      throw new Problem(`unexpected "${s.peek()}" after a value`);
    }
  }
  if (parts.length === 0) throw new Problem("empty value");
  return render(parts);
}

// The one entry point. Returns the normalized, validated text — the caller
// emits exactly this, never the original input.
export function parseCssValue(raw: string): CssValueResult {
  const normalized = normalizeCssText(raw);
  if (normalized === "") return { ok: false, problem: "empty value" };
  // `<` is how a value leaves its <style> element: `</style>` ends it, `<!--`
  // opens an HTML comment. A quoted string is otherwise free-form, so the check
  // runs on the normalized text - `\3c` has already become `<` by now - and no
  // value form needs the character (`isSafeRawCss` makes the same cut).
  if (normalized.includes("<")) {
    return { ok: false, problem: 'a value must not contain "<" (it could close the style element)' };
  }
  try {
    return { ok: true, value: parseValue(new Scanner(normalized)) };
  } catch (error) {
    return {
      ok: false,
      problem: error instanceof Problem ? error.message : "invalid value",
    };
  }
}

export function isSafeCssValue(raw: string): boolean {
  return parseCssValue(raw).ok;
}

// --------------------------------------------------------------- raw at-rules

// `rawCss` is deliberately narrow (ADR-0005): the only at-rule the editor may
// carry verbatim is `@keyframes`. It has a block grammar of its own, so it is
// checked separately: the head must be an animation name, the braces must
// balance, and nothing may smuggle an import or markup in.
export function isSafeRawCss(raw: string): boolean {
  const text = resolveCssEscapes(stripCssComments(raw)).trim();
  const head = /^@keyframes\s+-?[a-zA-Z_][a-zA-Z0-9_-]*\s*\{/.exec(text);
  if (head === null) return false;
  if (text.includes("<") || text.includes("@import")) return false;
  // Scan from the opening brace of the keyframes block: declarations inside may
  // carry `;` (they must), but nothing may follow the block.
  let depth = 0;
  for (let index = head[0].length - 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth < 0) return false;
      if (depth === 0) return text.slice(index + 1).trim() === "";
    }
  }
  return false;
}

export function normalizeRawCss(raw: string): string {
  return resolveCssEscapes(stripCssComments(raw)).trim();
}
