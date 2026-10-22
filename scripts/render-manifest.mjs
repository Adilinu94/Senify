import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Reads the tool facts out of `packages/mcp/src/tools.ts` and writes them into
// `packages/manifest/src/tools.ts` (Fahrplan P3-3 Punkt 4).
//
// Why a generator instead of a hand-written manifest: the manifest is consumed
// by three places - the MCP server registers from it, the docs render from it,
// the route matrix is generated from it - and a hand-written copy of 106 tools is
// a copy that drifts on the first rename. The generator runs from the source of
// truth and the test (`manifest.test.ts`) compares the two, so drift fails
// instead of misleading.
//
// What is EXTRACTED and what is not:
//
//   - name, title, scope, description: read verbatim.
//   - route: read from the handler's `request("GET", "/api/...")` call. A tool
//     that makes no request (none today) gets `null`.
//   - group: NOT derivable. Which group a tool belongs to is a decision about
//     how a human reads the manual, and a regex cannot decide it. The group
//     table below is the hand-written part, and it is small and reviewable - one
//     word per tool.
//
// Everything the generator writes carries a header saying it was generated. A
// reader who wants to change a description changes it in `tools.ts`, where the
// handler lives, because a description next to no behaviour is a description
// nobody keeps true.

// `scripts/` -> repo root. Two levels up from the file, not three: the file is
// `<root>/scripts/render-manifest.mjs`, so `<root>` is `dirname(dirname(file))`.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS_SRC = join(ROOT, "packages", "mcp", "src", "tools.ts");
const MANIFEST = join(ROOT, "packages", "manifest", "src", "tools.ts");

// The group per tool. This is the one editorial decision in the manifest, and it
// is here rather than in a comment because it has to be REVIEWED: a tool in the
// wrong group is a tool a reader cannot find.
const GRUPPEN = {
  whoami: "katalog",
  list_sites: "katalog",
  get_site: "katalog",
  create_site: "katalog",
  duplicate_site: "katalog",
  list_pages: "seiten",
  get_page: "seiten",
  get_nodes: "seiten",
  list_sections: "seiten",
  get_section: "seiten",
  get_theme: "seiten",
  list_widgets: "seiten",
  get_widget: "seiten",
  search_docs: "katalog",
  read_docs: "katalog",
  apply_mutations: "seiten",
  undo_batch: "seiten",
  set_motion: "seiten",
  clear_motion: "seiten",
  list_components: "referenzen",
  get_component: "referenzen",
  set_component_override: "referenzen",
  set_component_variant: "referenzen",
  bump_component_version: "referenzen",
  update_component_instances: "referenzen",
  set_styles: "seiten",
  create_style_rule: "seiten",
  create_page: "seiten",
  set_page_template: "seiten",
  update_theme: "seiten",
  create_preview: "review",
  submit_for_review: "review",
  get_review_feedback: "review",
  publish_release: "release",
  rollback_release: "release",
  list_releases: "release",
  get_release: "release",
  list_bake_jobs: "release",
  deploy_site: "release",
  get_deploy_settings: "release",
  set_deploy_settings: "release",
  list_deployments: "release",
  restore_revision: "seiten",
  delete_page: "seiten",
  list_assets: "medien",
  upload_asset: "medien",
  update_asset: "medien",
  replace_asset: "medien",
  delete_asset: "medien",
  restore_asset: "medien",
  generate_image: "medien",
  get_image_job: "medien",
  list_image_jobs: "medien",
  list_collections: "medien",
  get_collection: "medien",
  list_entries: "medien",
  get_entry: "medien",
  create_entry: "medien",
  update_entry: "medien",
  publish_entry: "medien",
  delete_entry: "medien",
  restore_entry: "medien",
  restore_entry_version: "medien",
  search_entries: "medien",
  list_submissions: "medien",
  analyze_reference: "referenzen",
  list_references: "referenzen",
  search_references: "referenzen",
  find_duplicate_references: "referenzen",
  get_reference: "referenzen",
  apply_reference: "referenzen",
  list_reference_collections: "referenzen",
  create_reference_collection: "referenzen",
  assign_reference_to_collection: "referenzen",
  get_reference_brief: "referenzen",
  plan_redesign: "redesign",
  create_redesign_proposal: "redesign",
  get_redesign_proposal: "redesign",
  apply_redesign: "redesign",
  import_design_system: "redesign",
  get_design_report: "redesign",
  diff_reference: "referenzen",
  get_reference_docs: "referenzen",
  update_reference_doc: "referenzen",
  create_manual_reference: "referenzen",
  update_reference: "referenzen",
  delete_reference: "referenzen",
  edit_reference_profile: "referenzen",
  list_reference_revisions: "referenzen",
  unassign_reference: "referenzen",
  reference_tick: "referenzen",
  update_reference_collection: "referenzen",
  delete_reference_collection: "referenzen",
  get_reference_settings: "referenzen",
  set_reference_settings: "referenzen",
  get_design_contract: "seiten",
  set_design_contract: "seiten",
  list_library_components: "referenzen",
  get_library_component: "referenzen",
  promote_to_library: "referenzen",
  update_library_component: "referenzen",
  install_library_component: "referenzen",
  uninstall_library_component: "referenzen",
  reattach_library_component: "referenzen",
  update_library_instances: "referenzen",
  find_similar_library_components: "referenzen",
  library_audit: "referenzen",
  import_framer_page: "seiten",
  get_import_report: "seiten",
};

const quelle = readFileSync(TOOLS_SRC, "utf8");

/** The block that describes one tool: from its `name` to the closing brace of
 *  the object, so a regex never has to guess where a description ends. */
function werkzeugBloecke(text) {
  const bloecke = [];
  const start = /\{\s*\n\s*name: "([a-z_]+)"/g;
  let treffer;
  while ((treffer = start.exec(text)) !== null) {
    // Walk forward by counting braces: the tool objects contain no braces in a
    // string literal, and a regex that guesses the end is a regex that will
    // guess wrong on the first description containing a backtick pair.
    let tiefe = 0;
    let ende = treffer.index;
    for (; ende < text.length; ende += 1) {
      if (text[ende] === "{") tiefe += 1;
      else if (text[ende] === "}") {
        tiefe -= 1;
        if (tiefe === 0) {
          ende += 1;
          break;
        }
      }
    }
    bloecke.push({ name: treffer[1], text: text.slice(treffer.index, ende) });
  }
  return bloecke;
}

/** A string field, allowing for the multi-line form
 *  (`description:\n  "…",`) that the formatter produces - and for BOTH quote
 *  styles, because a description containing an apostrophe is written with
 *  single quotes and a regex that only knew double quotes would read it as
 *  empty. A tool with a description that reads as blank is worse than a tool
 *  with no description at all: the documentation would look complete. */
function feld(block, schluessel) {
  // Only the tool's own header counts: a parameter may carry a field of the
  // same name (`value: { description: "…" }`), and a regex that searched the
  // whole block would read the parameter's text as the tool's. Everything
  // tool-level sits before `inputSchema:`.
  const bereich = block.split("inputSchema:")[0] ?? block;
  const kurz = new RegExp(`${schluessel}: "([^"]*)"`);
  const treffer = bereich.match(kurz);
  if (treffer !== null) return treffer[1];
  const einfach = new RegExp(`${schluessel}: '([^']*)'`);
  const nurEinfach = bereich.match(einfach);
  if (nurEinfach !== null) return nurEinfach[1].replace(/\\'/g, "'");
  const mehrzeilig = new RegExp(
    `${schluessel}:\\s*\\n\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)')`,
    "s",
  );
  const lang = bereich.match(mehrzeilig);
  if (lang === null) return "";
  return (lang[1] ?? lang[2] ?? "")
    .replace(/\\(["'])/g, "$1")
    .replace(/\\n/g, "\n");
}

/** Every `request("GET", "/api/…")` call of one tool, in source order.
 *
 *  The scan is brace/backtick-aware because paths are template literals that
 *  may nest ternaries with backticks - a regex stopping at the first backtick
 *  would read `` `/api/references${query === "" ? "" : …` `` as the route and
 *  bake JavaScript into the documentation (exactly what the old single-match
 *  regex did for `list_references`).
 */
function routeAnfragen(block) {
  const anfragen = [];
  // Type arguments (`request<Page>`) are skipped: they never contain parens.
  const kopf = /request(?:<[^()]*>)?\(\s*"(GET|POST|PATCH|PUT|DELETE)"\s*,?\s*/g;
  let treffer;
  while ((treffer = kopf.exec(block)) !== null) {
    const methode = treffer[1];
    let position = treffer.index + treffer[0].length;
    const zeichen = block[position];
    if (zeichen !== "`" && zeichen !== '"') continue;
    position += 1;
    let roh = "";
    if (zeichen === '"') {
      while (position < block.length && block[position] !== '"') {
        roh += block[position];
        position += 1;
      }
    } else {
      let tiefe = 0;
      while (position < block.length) {
        if (block.startsWith("${", position)) {
          tiefe += 1;
          roh += "${";
          position += 2;
        } else if (block[position] === "}" && tiefe > 0) {
          tiefe -= 1;
          roh += "}";
          position += 1;
        } else if (block[position] === "`" && tiefe === 0) {
          break;
        } else {
          roh += block[position];
          position += 1;
        }
      }
    }
    anfragen.push({ methode, pfad: roh });
  }
  return anfragen;
}

/** One raw path into `METHOD /api/…/:param` form.
 *
 *  Interpolations are removed nesting-aware (they may contain ternaries with
 *  nested templates): a `${…}` directly behind a segment name or another
 *  interpolation is the query string (paging, filters), not a path
 *  parameter. Behind `/`, `=` or `?` it becomes `:param` - there it is a
 *  path segment or a value, and `?q=:param` is a usable example.
 */
function normalisiereRoute(methode, pfad) {
  let aus = "";
  let index = 0;
  while (index < pfad.length) {
    const start = pfad.indexOf("${", index);
    if (start === -1) {
      aus += pfad.slice(index);
      break;
    }
    const davor = pfad[start - 1] ?? "";
    let tiefe = 1;
    let cursor = start + 2;
    while (cursor < pfad.length && tiefe > 0) {
      if (pfad.startsWith("${", cursor)) {
        tiefe += 1;
        cursor += 2;
      } else if (pfad[cursor] === "}") {
        tiefe -= 1;
        cursor += 1;
      } else {
        cursor += 1;
      }
    }
    aus += pfad.slice(index, start);
    if (!/[A-Za-z0-9_}-]/.test(davor)) aus += ":param";
    index = cursor;
  }
  const normalisiert = aus
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ":param")
    // A repeated parameter (`:param/pages/:param`) is not a useful example; the
    // first one carries the meaning, the rest are noise.
    .replace(/(:param\/):param/g, "$1param");
  return `${methode} ${normalisiert}`;
}

/** The route from the handler's `request("GET", "/api/…")` call, and the same
 *  path with `:param` rewritten to `{param}` for a documentation example.
 *
 *  A tool whose path is built from a template (`` `/api/sites/${id}` ``) still
 *  yields a usable route: the `${…}` part becomes `:param`, because that is what
 *  it is. Guessing the parameter's NAME would be fiction - `get_page` calls
 *  `/api/pages/${requireString(args, "pageId")}`, and the name really is in the
 *  source, but a tool that interpolates a helper call would leave the reader
 *  with a bare `:param`. The name is a detail the route matrix already knows.
 *
 *  The primary route is the tool's FIRST request; every request lands in
 *  `routes`, because the matrix matches callers per route, not per tool.
 */
function route(block) {
  const anfragen = routeAnfragen(block);
  if (anfragen.length === 0) return { route: null, beispiel: null, routen: [] };
  const erste = normalisiereRoute(anfragen[0].methode, anfragen[0].pfad);
  const gesehen = new Set();
  const routen = [];
  for (const anfrage of anfragen) {
    const normalisiert = normalisiereRoute(anfrage.methode, anfrage.pfad);
    if (!gesehen.has(normalisiert)) {
      gesehen.add(normalisiert);
      routen.push(normalisiert);
    }
  }
  const [methode, ...rest] = erste.split(" ");
  const pfad = rest.join(" ");
  return {
    route: erste,
    beispiel: `${methode} ${pfad.replace(/:param/g, "{param}")}`,
    routen,
  };
}

/** The input parameters as plain data, read from the tool's schema.
 *
 *  The schema is a TypeBox object, so its shape is a plain JSON tree even
 *  though the type is not. Reading `properties` and `required` out of the
 *  SOURCE TEXT is deliberate: the tool list is never executed here, and a
 *  generator that imported the server to read live objects would be exactly
 *  the dependency this package exists to remove.
 *
 *  The braces are counted rather than matched by a pattern, because the tools
 *  write their schemas BOTH ways - `objectSchema({ siteId: … }, ["siteId"])` on
 *  one line and a multi-line form for the bigger tools. A regex that assumed
 *  one of them would silently produce an empty parameter list for the other,
 *  and a documentation table with missing rows is worse than one that fails.
 */
function parameter(block) {
  const start = block.text.indexOf("inputSchema:");
  if (start < 0) return [];
  const klammer = block.text.indexOf("(", start);
  let tiefe = 0;
  let ende = klammer;
  for (; ende < block.text.length; ende += 1) {
    if (block.text[ende] === "(") tiefe += 1;
    else if (block.text[ende] === ")") {
      tiefe -= 1;
      if (tiefe === 0) break;
    }
  }
  const aufruf = block.text.slice(klammer + 1, ende);
  // `objectSchema(properties, required)`: the FIRST argument is the property
  // map, the SECOND the list of required names. Splitting on the TOP-LEVEL
  // comma is what keeps the two apart - the property map is full of commas of
  // its own, and a naive split would read a property's `type: "string"` as the
  // required list.
  const teile = topLevelSplit(aufruf);
  const eigenschaften = teile[0] ?? "";
  const required = new Set(
    (teile[1] ?? "")
      .replace(/^\s*\[/, "")
      .replace(/\]\s*$/, "")
      .split(",")
      .map((stueck) => stueck.trim().replace(/^["'`]|["'`]$/g, ""))
      .filter((stueck) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(stueck)),
  );
  // The property names are the keys of the FIRST argument only, at its own top
  // level, so a nested object's keys are not mistaken for the tool's.
  const namen = topLevelEntries(eigenschaften);
  return namen.map((name) => ({
    name,
    type: typeLabel(eigenschaften, name),
    required: required.has(name),
  }));
}

/** Splits on commas that are not inside braces, brackets or parentheses. */
function topLevelSplit(text) {
  const teile = [];
  let tiefe = 0;
  let letzte = 0;
  for (let index = 0; index < text.length; index += 1) {
    const zeichen = text[index];
    if (zeichen === "{" || zeichen === "[" || zeichen === "(") tiefe += 1;
    else if (zeichen === "}" || zeichen === "]" || zeichen === ")") tiefe -= 1;
    else if (zeichen === "," && tiefe === 0) {
      teile.push(text.slice(letzte, index));
      letzte = index + 1;
    }
  }
  teile.push(text.slice(letzte));
  return teile;
}

/** The keys of a property map, at its own top level only. */
function topLevelEntries(text) {
  const innen = text.trim().replace(/^\{/, "").replace(/\}$/, "");
  const namen = [];
  for (const stueck of topLevelSplit(innen)) {
    const name = stueck.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (name !== null) namen.push(name[1]);
  }
  return namen;
}

/** The label for one parameter, from the `Type.…` constructor under its name.
 *
 *  A tool may also write a schema by hand (`{ type: "string" }` instead of
 *  `Type.String()`), so both spellings are read. The first one found wins, and
 *  "any" is the answer when neither is - a documentation table that says
 * `any` is dull, a table that lies is worse. */
function typeLabel(rohtext, name) {
  const stelle = new RegExp(`(?:^|[{,\\s])${name}:\\s*(?:Type\\.(\\w+)|\\{\\s*type:\\s*"([^"]+)")`, "m").exec(
    rohtext,
  );
  if (stelle === null) return "any";
  if (stelle[2] !== undefined) {
    // A hand-written schema (`{ type: "array", items: { type: "object" } }`). The
    // item type is read rather than dropped: a reader who sees "array" does not
    // know what is in it, and the old documentation table said `array<object>`.
    if (stelle[2] !== "array") return stelle[2];
    const rest = rohtext.slice(stelle.index + stelle[0].length);
    const item = rest.match(/items:\s*\{\s*type:\s*"([^"]+)"/);
    return item === null ? "array" : `array<${item[1]}>`;
  }
  const basis = stelle[1];
  if (basis === "Union") {
    const werte = [...stelle[0].matchAll(/Type\.Literal\("([^"]+)"\)/g)].map((m) => m[1]);
    return werte.length > 0 ? werte.join(" | ") : "string";
  }
  if (basis === "Array") {
    // `array<object>` and not `array`: a reader who sees "array" does not know
    // what is in it, and the old docs table said the more precise thing. The
    // item type is read from the first constructor after `Type.Array(`.
    const rest = rohtext.slice(stelle.index + stelle[0].length);
    const item = rest.match(/Type\.(\w+)|type:\s*"([^"]+)"/);
    if (item === null) return "array<any>";
    const name = item[1] ?? item[2] ?? "any";
    return `array<${name.toLowerCase() === "string" ? "string" : name.toLowerCase()}>`;
  }
  if (basis === "Optional") return "any";
  return basis.toLowerCase();
}

const bloecke = werkzeugBloecke(quelle);
const fehlendeGruppe = [];
const faktoren = bloecke.map((block) => {
  const gruppe = GRUPPEN[block.name];
  if (gruppe === undefined) fehlendeGruppe.push(block.name);
  const { route: pfad, beispiel, routen } = route(block.text);
  const scope = feld(block.text, "scope");
  return {
    name: block.name,
    title: feld(block.text, "title"),
    scope,
    group: gruppe ?? "katalog",
    description: feld(block.text, "description"),
    route: pfad,
    routeExample: beispiel,
    routes: routen,
    writes: scope === "write" || scope === "publish",
    parameters: parameter(block),
  };
});

if (fehlendeGruppe.length > 0) {
  console.error(
    `Keine Gruppe für: ${fehlendeGruppe.join(", ")}\n` +
      "Jedes Werkzeug braucht eine Gruppe - sie entscheidet, wo ein Mensch es im Handbuch findet.",
  );
  process.exit(1);
}

const koerper = faktoren
  .map(
    (fakt) => `  {
    name: ${JSON.stringify(fakt.name)},
    title: ${JSON.stringify(fakt.title)},
    scope: ${JSON.stringify(fakt.scope)},
    group: ${JSON.stringify(fakt.group)},
    description: ${JSON.stringify(fakt.description)},
    route: ${fakt.route === null ? "null" : JSON.stringify(fakt.route)},
    routeExample: ${fakt.routeExample === null ? "null" : JSON.stringify(fakt.routeExample)},
    routes: [${fakt.routes.map((r) => JSON.stringify(r)).join(", ")}],
    writes: ${fakt.writes},
    parameters: [
${fakt.parameters.map((p) => `      { name: ${JSON.stringify(p.name)}, type: ${JSON.stringify(p.type)}, required: ${p.required} },`).join("\n")}
    ],
  },`,
  )
  .join("\n");

const kopf = `// The tool manifest (Fahrplan P3-3 Punkt 4, R8) - GENERATED, do not edit.
//
// Run \`pnpm manifest:render\` after changing a tool in
// \`packages/mcp/src/tools.ts\`. The source of truth is the tool itself: a
// description next to no behaviour is a description nobody keeps true.
//
// What this package is FOR: it breaks the cycle in which \`docs-portal\` imported
// the MCP server to document it. The FACTS about the tools are data, and data
// belongs somewhere the server, the docs and the skills can all depend on
// without any of them depending on another. Schemas and handlers stay in
// \`@senify/mcp\` - moving those here would move ownership of the wire format
// into a package with no business owning it.
//
// ${faktoren.length} Werkzeuge.
import type { ToolFact } from "./types.ts";`;

// The repository keeps CRLF in the working tree on Windows and LF in the
// index. The generator writes the line endings the file already has, so
// regenerating never turns into a whole-file diff. The CHECK compares
// normalised, because the line endings are the repository's business, not the
// generator's.
const vorhanden = existsSync(MANIFEST) ? readFileSync(MANIFEST, "utf8") : "";
const zeilenenden = vorhanden.includes("\r\n") ? "\r\n" : "\n";

const ausgabe = `${kopf}
export const TOOL_MANIFEST: ToolFact[] = [
${koerper}
];
`.split("\n").join(zeilenenden);

// `--check` compares instead of writing: it is the mode the CI and the test
// use. A generated file nobody checks is a file that drifts silently - the
// manifest would name a tool that no longer exists, and the client cannot
// tell that from a working call.
if (process.argv.includes("--check")) {
  const normalisieren = (text) => text.replace(/\r\n/g, "\n");
  if (normalisieren(vorhanden) === normalisieren(ausgabe)) {
    console.log(`manifest: unveraendert (${faktoren.length} Werkzeuge)`);
    process.exit(0);
  }
  console.error(
    `manifest: ${MANIFEST} weicht vom Generator ab.\n` +
      "Neu erzeugen: pnpm manifest:render",
  );
  process.exit(1);
}

writeFileSync(MANIFEST, ausgabe, "utf8");
console.log(`manifest: ${faktoren.length} Werkzeuge geschrieben (${MANIFEST})`);
