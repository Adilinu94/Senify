// S0-Messlauf (Framer-Import): wertet eine statische Framer-Ausgabe aus, ohne
// Browser und ohne Netz. Ziel sind Zahlen, nicht Meinungen:
//
//   - Elemente, Tags, data-framer-*-Marker, framer-Klassen (knotengebunden?)
//   - CSS: Regeln, Deklarationen, Property-Häufigkeit, @media, @keyframes
//   - Layout-Zensus: position:absolute vs. flex/grid
//   - Deklarations-Dubletten (Potenzial für class-Zusammenfassung)
//   - Farbe/Typo: Literale, Textstil-Presets
//   - Abbildungs-Schätzung: welche Knotenart wird welches Senify-Primitiv
//
// Aufruf:
//   node .scratch/framer-import/messlauf.mjs <index.html> [<index.html> ...]
// Ohne Argument werden die drei bekannten Beispielausgaben gelesen.

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const DEFAULT_SAMPLES = [
  "C:/Users/adini/FramerExport/framer-stupendous-football-158496/index.html",
  "C:/Users/adini/FramerExport/framer-fluffy-rectangle-418998/index.html",
  "C:/Users/adini/FramerExport/framer-easier-train-154753/index.html",
];

const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_SAMPLES;

/* ------------------------------------------------------------------ helpers */

function countBy(list) {
  const map = new Map();
  for (const entry of list) map.set(entry, (map.get(entry) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function topOf(entries, n) {
  return [...entries].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// Skripte und Kommentare raus: React-Bundles enthalten `<div`-Fragmente, die
// jede Tag-Zählung verfälschen würden.
function stripNoise(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
}

function styleBlocks(html) {
  const blocks = [];
  const re = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    blocks.push({ attrs: match[1] ?? "", css: match[2] ?? "" });
  }
  return blocks;
}

// Ein flacher CSS-Durchlauf: alles zwischen { und } ist eine Deklarationsliste,
// alles davor ein Selektor oder eine At-Regel-Einleitung. Framer liefert
// flaches CSS, verschachtelte Regeln sind die Ausnahme.
function parseCss(css) {
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const declarations = [];
  const atRules = new Map();
  let buf = "";
  let stack = [];
  for (const char of cleaned) {
    if (char === "{") {
      const head = buf.trim();
      stack.push(head);
      if (head.startsWith("@")) {
        const name = head.split(/[\s(]/)[0];
        atRules.set(name, (atRules.get(name) ?? 0) + 1);
      } else {
        rules.push(head);
      }
      buf = "";
      continue;
    }
    if (char === "}") {
      const head = stack.pop();
      const body = buf.trim();
      if (head !== undefined && !head.startsWith("@") && body !== "") {
        for (const part of body.split(";")) {
          const trimmed = part.trim();
          if (trimmed === "") continue;
          const colon = trimmed.indexOf(":");
          if (colon <= 0) continue;
          const property = trimmed.slice(0, colon).trim();
          if (property.includes("{") || property.startsWith("@")) continue;
          declarations.push({ property, value: trimmed.slice(colon + 1).trim() });
        }
      }
      buf = "";
      continue;
    }
    buf += char;
  }
  return { rules, declarations, atRules };
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/g;

/* ------------------------------------------------------------------- analyse */

function analyse(file) {
  const html = readFileSync(file, "utf8");
  const body = stripNoise(html);

  // --- Tags und Attribute
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  const tags = [];
  const attrs = [];
  let tagMatch;
  while ((tagMatch = tagRe.exec(body)) !== null) {
    tags.push(tagMatch[1].toLowerCase());
    attrs.push(tagMatch[2] ?? "");
  }
  const attrText = attrs.join(" ");

  const framerMarkers = new Map();
  for (const [, marker] of attrText.matchAll(/(data-framer-[a-z-]+)=/g)) {
    framerMarkers.set(marker, (framerMarkers.get(marker) ?? 0) + 1);
  }

  const classTokens = [];
  for (const [, value] of attrText.matchAll(/\bclass="([^"]*)"/g)) {
    for (const token of value.split(/\s+/)) if (token !== "") classTokens.push(token);
  }
  const framerClasses = classTokens.filter((token) => token.startsWith("framer-"));
  const classUse = countBy(framerClasses);
  const nodeScoped = classUse.filter(([, count]) => count === 1).length;
  const presetClasses = classUse.filter(([name]) => name.includes("framer-styles-preset-"));
  const variantClasses = classUse.filter(([name]) => /^framer-v-/.test(name));

  const componentTypes = countBy(
    [...attrText.matchAll(/data-framer-component-type="([^"]*)"/g)].map((m) => m[1]),
  );

  // --- CSS
  const blocks = styleBlocks(html);
  const allRules = [];
  const allDeclarations = [];
  const atRules = new Map();
  for (const block of blocks) {
    const parsed = parseCss(block.css);
    allRules.push(...parsed.rules);
    allDeclarations.push(...parsed.declarations);
    for (const [name, count] of parsed.atRules) {
      atRules.set(name, (atRules.get(name) ?? 0) + count);
    }
  }

  const propertyFrequency = countBy(allDeclarations.map((entry) => entry.property));
  const propertyCount = new Map(propertyFrequency);
  const layout = {
    absolute: propertyCount.get("position") === undefined ? 0 : 0,
    flex: allDeclarations.filter((entry) => entry.property === "display" && /flex/.test(entry.value)).length,
    grid: allDeclarations.filter((entry) => entry.property === "display" && /grid/.test(entry.value)).length,
    positionAbsolute: allDeclarations.filter((entry) => entry.property === "position" && /absolute/.test(entry.value)).length,
    positionRelative: allDeclarations.filter((entry) => entry.property === "position" && /relative/.test(entry.value)).length,
    transform: allDeclarations.filter((entry) => entry.property === "transform").length,
    filter: allDeclarations.filter((entry) => entry.property === "filter").length,
    clipPath: allDeclarations.filter((entry) => entry.property === "clip-path").length,
    backdropFilter: allDeclarations.filter((entry) => entry.property === "backdrop-filter").length,
  };

  // --- Deklarations-Dubletten: gleiche Deklarationsmenge in mehreren Regeln
  //     -> ein Kandidat für eine gemeinsame class-Regel (Plan §2/D3).
  const declarationSets = new Map();
  for (const rule of allRules) {
    declarationSets.set(rule, (declarationSets.get(rule) ?? 0) + 1);
  }
  const signaturMap = new Map();
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  for (const block of blocks) {
    let match;
    while ((match = blockRe.exec(block.css.replace(/\/\*[\s\S]*?\*\//g, ""))) !== null) {
      const selector = (match[1] ?? "").trim();
      if (selector === "" || selector.startsWith("@")) continue;
      const body = (match[2] ?? "").replace(/\s+/g, " ").trim();
      if (body === "") continue;
      const list = signaturMap.get(body) ?? [];
      list.push(selector);
      signaturMap.set(body, list);
    }
  }
  const duplicateGroups = [...signaturMap.values()].filter((list) => list.length > 1);
  const duplicateDeclarationCount = duplicateGroups.reduce((sum, list) => sum + (list.length - 1), 0);

  // --- Farbe / Typo
  const colors = countBy([...html.matchAll(COLOR_RE)].map((m) => m[0].toLowerCase()));
  const fontFaces = [...html.matchAll(/@font-face\s*\{([^}]*)\}/g)].length;

  // --- Marker für Animationen
  const animations = {
    appearIds: (attrText.match(/data-framer-appear-id=/g) ?? []).length,
    keyframes: atRules.get("@keyframes") ?? 0,
    hasScrollTimeline: /scroll-timeline|view-timeline/.test(html),
    hasFramerMotionRuntime: /framer-motion|motion\/react/.test(html),
  };

  // --- Abbildungs-Schätzung (Primitiv je Knotenart). Die Tags sind der
  //     verlässlichere Zensus: `data-framer-component-type` markiert nur einen
  //     Teil der Knoten (überwiegend RichText-Container).
  const tagCount = new Map(countBy(tags));
  const countTags = (names) => names.reduce((sum, tag) => sum + (tagCount.get(tag) ?? 0), 0);
  const estimate = {
    container: countTags(["div", "section", "nav", "header", "footer", "main", "aside"]),
    heading: countTags(["h1", "h2", "h3", "h4", "h5", "h6"]),
    text: countTags(["p", "span", "li"]),
    link: countTags(["a"]),
    button: countTags(["button"]),
    image: countTags(["img", "picture"]),
    svg: countTags(["svg", "use", "path", "g"]),
    video: countTags(["video"]),
    embed: countTags(["iframe", "canvas"]),
    form: countTags(["form", "input", "select", "textarea"]),
    list: countTags(["ul", "ol"]),
    componentTypeMarkers: componentTypes.reduce((sum, [, count]) => sum + count, 0),
  };

  return {
    file,
    name: basename(dirname(file)),
    bytes: Buffer.byteLength(html, "utf8"),
    elements: tags.length,
    tagHistogram: countBy(tags).slice(0, 15),
    framerMarkers: [...framerMarkers.entries()].sort((a, b) => b[1] - a[1]),
    classes: {
      total: classTokens.length,
      distinct: classUse.length,
      framerDistinct: classUse.length,
      usedOnce: nodeScoped,
      usedMultiple: classUse.length - nodeScoped,
      top: classUse.slice(0, 10),
      textPresets: presetClasses.length,
      variants: variantClasses.length,
    },
    componentTypes,
    css: {
      styleBlocks: blocks.length,
      rules: allRules.length,
      declarations: allDeclarations.length,
      atRules: [...atRules.entries()],
      topProperties: topOf(propertyFrequency, 30),
      duplicateDeclarationGroups: duplicateGroups.length,
      duplicateDeclarationCount,
      layout,
    },
    colors: { distinct: colors.length, top: colors.slice(0, 15) },
    fonts: { fontFaces },
    animations,
    estimate,
  };
}

/* --------------------------------------------------------------------- main */

const results = [];
for (const file of files) {
  try {
    results.push(analyse(resolve(file)));
  } catch (error) {
    results.push({ file, error: error instanceof Error ? error.message : String(error) });
  }
}

const out = resolve(import.meta.dirname, "messlauf.json");
writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`, "utf8");

for (const entry of results) {
  if (entry.error) {
    console.log(`\n!! ${entry.file}\n   ${entry.error}`);
    continue;
  }
  const { name, bytes, elements, classes, css, colors, fonts, animations, estimate } = entry;
  console.log(`\n=== ${name}`);
  console.log(`  HTML ${(bytes / 1024).toFixed(0)} KB · ${elements} Elemente`);
  console.log(
    `  Klassen: ${classes.distinct} verschieden, ${classes.usedOnce} einmal verwendet, ` +
      `${classes.textPresets} Textstil-Presets, ${classes.variants} Variantenklassen`,
  );
  console.log(
    `  CSS: ${css.styleBlocks} Blöcke · ${css.rules} Regeln · ${css.declarations} Deklarationen`,
  );
  console.log(
    `  Layout: ${css.layout.positionAbsolute}× position:absolute, ${css.layout.flex}× flex, ` +
      `${css.layout.grid}× grid, ${css.layout.transform}× transform, ${css.layout.clipPath}× clip-path`,
  );
  console.log(
    `  Dubletten: ${css.duplicateDeclarationGroups} Gruppen, ${css.duplicateDeclarationCount} überzählige Regeln (class-Potenzial)`,
  );
  console.log(`  Farben: ${colors.distinct} verschieden · @font-face: ${fonts.fontFaces}`);
  console.log(
    `  Animation: ${animations.appearIds} appear-Ids, ${animations.keyframes} @keyframes, ` +
      `motion-runtime=${animations.hasFramerMotionRuntime}`,
  );
  console.log(
    `  Abbildung: Container ${estimate.container} · Überschrift ${estimate.heading} · Text ${estimate.text} · ` +
      `Link ${estimate.link} · Bild ${estimate.image} · SVG ${estimate.svg} · Embed/Canvas ${estimate.embed} · Liste ${estimate.list}`,
  );
  console.log(`  Marker: ${entry.framerMarkers.slice(0, 8).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(
    `  Top-Properties: ${entry.css.topProperties
      .slice(0, 12)
      .map(([property, count]) => `${property} ${count}×`)
      .join(", ")}`,
  );
}
console.log(`\nJSON: ${out}`);
