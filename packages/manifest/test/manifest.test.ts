import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_GROUP_ORDER, TOOL_MANIFEST, toolsByName } from "../src/index.ts";

const TOOLS_BY_NAME = toolsByName(TOOL_MANIFEST);

// The manifest is a promise: three places consume it (the server registers from
// it, the docs render from it, the route matrix is generated from it), and a
// promise nobody checks is a comment.
//
// The check has two halves, and the second is the one that matters:
//
//   1. Every tool in `tools.ts` appears in the manifest, with the same scope and
//      title. A tool added without regenerating fails here.
//   2. The manifest contains nothing that `tools.ts` does not. The other
//      direction: a leftover entry would send a client to a tool that no longer
//      exists, and a client cannot tell that from a working call.
//
// The route is checked for a handful of tools rather than all of them: a route
// is a convenience for the docs, and a template-built path (`/api/pages/${…}`)
// normalises to `:param` - which is correct and not worth pinning per tool.
//
// The path is derived from `import.meta.url` rather than `import.meta.dirname`,
// which the test transform does not guarantee. `fileURLToPath` yields the FILE;
// two `dirname` calls land on `packages/manifest/`, a third on the repo root.
const root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const quelle = readFileSync(join(root, "packages", "mcp", "src", "tools.ts"), "utf8");

function werkzeugNamen(): Set<string> {
  return new Set([...quelle.matchAll(/^\s{4}name: "([a-z_]+)",$/gm)].map((m) => m[1]!));
}

describe("Tool-Manifest (Fahrplan P3-3 Punkt 4, R8)", () => {
  it("kennt jedes Werkzeug des Servers", () => {
    const imServer = werkzeugNamen();
    const imManifest = new Set(TOOL_MANIFEST.map((fact) => fact.name));
    const fehlend = [...imServer].filter((name) => !imManifest.has(name));
    expect(
      fehlend,
      `Im Manifest fehlt: ${fehlend.join(", ")}. Neu generieren: pnpm manifest:render`,
    ).toEqual([]);
    // A manifest that is LONGER than the server is just as wrong: a client
    // would call a tool that does not exist and read the refusal as a bug.
    const ueberzaehlig = [...imManifest].filter((name) => !imServer.has(name));
    expect(ueberzaehlig, `Im Manifest zu viel: ${ueberzaehlig.join(", ")}`).toEqual([]);
  });

  it("trägt für jedes Werkzeug die vier Angaben, die die Doku braucht", () => {
    for (const fact of TOOL_MANIFEST) {
      expect(fact.title.length, `${fact.name}: title`).toBeGreaterThan(0);
      expect(fact.description.length, `${fact.name}: description`).toBeGreaterThan(20);
      expect(["read", "write", "publish"], `${fact.name}: scope`).toContain(fact.scope);
      expect(TOOL_GROUP_ORDER, `${fact.name}: group`).toContain(fact.group);
    }
  });

  it("meldet `writes` genau dann, wenn der Eingriff es ändert", () => {
    // A read tool that claims to write would make a human hesitate before
    // calling it; a write tool that claims to read would make one trust it.
    for (const fact of TOOL_MANIFEST) {
      expect(fact.writes, `${fact.name}: writes`).toBe(fact.scope !== "read");
    }
  });

  it("nennt die Routen der Werkzeugtypen, die eine Route haben", () => {
    // Spot checks, not a full table: the route comes from a regex over a
    // template literal, and pinning every one of 106 would break on a rename
    // that did not change what the tool does. These cover each shape: a flat
    // path, a path with a parameter, a two-parameter path, and a path built from
    // a template.
    expect(TOOLS_BY_NAME.get("list_sites")?.route).toBe("GET /api/sites");
    expect(TOOLS_BY_NAME.get("get_site")?.routeExample).toBe("GET /api/sites/{param}");
    expect(TOOLS_BY_NAME.get("list_pages")?.routeExample).toBe(
      "GET /api/sites/{param}/pages",
    );
    expect(TOOLS_BY_NAME.get("create_page")?.route).toBe("POST /api/sites/:param/pages");
    expect(TOOLS_BY_NAME.get("create_page")?.routeExample).toBe(
      "POST /api/sites/{param}/pages",
    );
    // A `${…}` right behind a path segment is the query string (limit, offset,
    // filters), not a path parameter: it must not end up as `assets:param`.
    expect(TOOLS_BY_NAME.get("list_assets")?.route).toBe("GET /api/sites/:param/assets");
    expect(TOOLS_BY_NAME.get("list_entries")?.route).toBe("GET /api/sites/:param/entries");
    expect(TOOLS_BY_NAME.get("list_image_jobs")?.route).toBe(
      "GET /api/sites/:param/images/jobs",
    );

    // Some tools read or write the STORE directly instead of going over HTTP -
    // `get_page` builds an outline from `pageFor(...)`, `upload_asset` reads a
    // file path. Their route is `null`, and that is a fact about the tool, not a
    // gap in the manifest. The pair below says so explicitly, because a `null`
    // that means "not extracted" and a `null` that means "no route" are
    // different claims and only one of them belongs in the documentation.
    expect(TOOLS_BY_NAME.get("get_page")?.route).toBeNull();
    expect(TOOLS_BY_NAME.get("upload_asset")?.route).toBeNull();
    // And when there is no route, there is no example: the pair is kept
    // consistent everywhere, so a renderer never shows an example for a route
    // that does not exist.
    for (const fact of TOOL_MANIFEST) {
      if (fact.route === null) expect(fact.routeExample, fact.name).toBeNull();
    }
  });

  it("trägt die Parameter als Namen, Typ und Pflicht", () => {
    // A tool that takes a siteId says so, and says it is required: a client that
    // omits it should learn that from the table, not from a runtime error.
    const mitSite = TOOLS_BY_NAME.get("get_site");
    expect(mitSite?.parameters).toEqual([
      { name: "siteId", type: "string", required: true },
    ]);
    // A tool with no parameters says so with an empty list, not with missing
    // rows - the docs render both the same way.
    expect(TOOLS_BY_NAME.get("whoami")?.parameters).toEqual([]);
    // The paged lists take `limit` and `offset`, both optional: without them an
    // agent could not get past the first page (see paging.test.ts in `mcp`).
    expect(TOOLS_BY_NAME.get("list_sites")?.parameters).toEqual([
      { name: "limit", type: "number", required: false },
      { name: "offset", type: "number", required: false },
    ]);
  });

  it("findet jedes Werkzeug über den Namen, auch nach den verbotenen", () => {
    // `TOOLS_BY_NAME` is a Map on purpose. A plain object would answer
    // `TOOLS_BY_NAME["constructor"]` with a function, and "this tool does not
    // exist" has to be a miss everywhere - including for the names nobody would
    // think to type.
    expect(TOOLS_BY_NAME.get("constructor")).toBeUndefined();
    expect(TOOLS_BY_NAME.get("__proto__")).toBeUndefined();
    expect(TOOLS_BY_NAME.get("list_sites")?.name).toBe("list_sites");
  });
});
