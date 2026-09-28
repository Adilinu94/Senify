// The shape of a tool fact, and the order the documentation walks the groups.
//
// The FACTS themselves are generated into `tools.ts` from
// `packages/mcp/src/tools.ts` (`pnpm manifest:render`). The types live here
// because a generated file should contain data and nothing else - a generator
// that also owns the type would make every type change a regeneration, and a
// regeneration that fails mid-file would leave a half-typed module behind.
//
// See `tools.ts` for why this package exists at all. In short: it breaks the
// cycle in which the documentation imported the MCP server to document it.

export type ToolScope = "read" | "write" | "publish";

/** Which part of the manual a tool belongs to.
 *
 *  This is the one editorial decision in the manifest, and it lives in
 *  `scripts/render-manifest.mjs` rather than being derived. Which group a tool
 *  belongs to is a decision about how a human reads the manual; a regex cannot
 *  decide it, and a tool in the wrong group is a tool a reader cannot find.
 */
export type ToolGroup =
  | "katalog"
  | "seiten"
  | "medien"
  | "referenzen"
  | "redesign"
  | "review"
  | "release"
  | "einstellungen";

/** Everything the server, the docs and the route matrix need to know about one
 *  tool - and nothing else.
 *
 *  The list is deliberately short. A field here is a field three places have to
 *  keep in step, so every one of them has to be a fact about the tool itself
 *  rather than a fact about one caller. That is why the input schema is NOT
 *  here: it is a TypeBox object the engine contract owns, and re-exporting it
 *  would move ownership of the wire format into a package that has no business
 *  owning it.
 */
export type ToolFact = {
  name: string;
  title: string;
  scope: ToolScope;
  group: ToolGroup;
  description: string;
  /** The engine route the tool calls, e.g. `GET /api/sites/:siteId/pages`.
   *  `null` for a tool that needs no route. The route matrix is generated from
   *  this field, which is why it is here and not in a hand-written table. */
  route: string | null;
  /** The same route with `:param` written as `{param}` - what a reader of the
   *  documentation should type. */
  routeExample: string | null;
  /** Whether the tool changes state. Mirrors `scope`, but named for the
   *  question a reader of the manual asks: "what does this do to my site?". */
  writes: boolean;
  /** The input parameters, as NAMES and TYPES - not as the schema object.
   *
   *  This is the one place where the manifest could have taken the whole
   *  TypeBox schema and did not. A schema is a live object owned by the engine
   *  contract; a copy of it in the manifest would be a second place to update
   *  and would break the moment a schema grew a validator. What the docs
   *  actually render is a name, a type and whether it is required - and those
   *  three are facts about the tool, stable enough to belong here.
   *
   *  Extracted from the schema by the generator, so they cannot drift.
   */
  parameters: { name: string; type: string; required: boolean }[];
};
