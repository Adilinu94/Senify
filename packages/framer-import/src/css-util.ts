// CSS-aware splitting for the capture. A declaration list cannot be split on
// every `;` (`url(data:image/png;base64,…)`) and a shorthand value cannot be
// split on every space (`calc(10px + 2%)`, `var(--p, 8px 4px)`): both break
// the value silently. Depth and quotes are tracked instead.

function splitTopLevel(input: string, isSeparator: (char: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index);
    if (quote !== null) {
      current += char;
      if (char === "\\") {
        current += input.charAt(index + 1);
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")" && depth > 0) depth -= 1;
    if (depth === 0 && isSeparator(char)) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

// `a: 1; b: url(x;y)` → ["a: 1", " b: url(x;y)"]
export function splitDeclarations(body: string): string[] {
  return splitTopLevel(body, (char) => char === ";");
}

// `10px calc(1px + 2%) 0` → ["10px", "calc(1px + 2%)", "0"]
export function splitSpaces(value: string): string[] {
  return splitTopLevel(value.trim(), (char) => /\s/.test(char)).filter((part) => part !== "");
}

export function splitCommas(value: string): string[] {
  return splitTopLevel(value, (char) => char === ",").map((part) => part.trim());
}

// One declaration → [property, value] or null when it has no usable pair.
export function parseDeclaration(declaration: string): [string, string] | null {
  const colon = declaration.indexOf(":");
  if (colon <= 0) return null;
  const property = declaration.slice(0, colon).trim();
  const value = declaration.slice(colon + 1).trim();
  if (property === "" || value === "") return null;
  return [property, value];
}

// The CSS shorthand expansion for `padding`/`margin`-like 1–4 value lists.
export function expandBox(value: string): { top: string; right: string; bottom: string; left: string } {
  const parts = splitSpaces(value);
  const top = parts[0] ?? "0";
  const right = parts[1] ?? top;
  const bottom = parts[2] ?? top;
  const left = parts[3] ?? right;
  return { top, right, bottom, left };
}
