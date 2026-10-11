// Style rule registry (Phase 2, first slice). The data shape of a style rule
// and its tolerant parser.
//
// Every user-authored style rule lives in one registry per site. The shape
// follows the reference implementation (`Repos/instatic`,
// `docs/reference/css-class-registry.md`) because that model already resolves
// three cases Senify needs: reusable classes, selector-matched rules that are
// never written to `class=`, and rules pinned to a single node.
//
// Three kinds:
// - `class`   — a reusable, named rule the editor assigns through
//               `node.classIds`. The name is the class token, the selector is
//               `.name`.
// - `ambient` — attaches by CSS selector matching (`h1`, `a:hover`), never by
//               assignment. The `selector` is the source of truth.
// - `scoped`  — owned by exactly one node (`scope.nodeId`); used for "only this
//               element", so the palette stays clean.
//
// Values and contexts. `styles` carries the base declarations in the widget
// engine's device shape (`DeviceValueMap`, `../device.ts`): a value lives in
// the base key and is overridden per device through the `_tablet` / `_mobile`
// suffixes. That keeps a rule compilable by the existing compiler
// (`./compile.ts`) without translation.
//
// `contextStyles` is the *extra* capability of the reference model: named
// contexts beyond the two built-in breakpoints. Because the device suffixes
// already express tablet and mobile, those two context ids are reserved and
// rejected here — two representations of the same override would drift. Use
// the suffix form for the built-in devices and a context id for everything
// else (`@media`, `@container`, `@supports` conditions).
//
// Order. `order` is the cascade position, ascending. It is normalized to the
// array position on every write (`normalizeRuleOrder`), so the stored order
// can never drift from the registry. The cascade itself does not read `kind`
// (decision O1, `.scratch/editor-v2-rebuild/map.md`): the compiler's fixed
// stages decide, and `order` breaks the tie inside the class stage.

import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { PropValue } from "../types.ts";
import type { DeviceValueMap } from "../device.ts";
import { STATE_ORDER, type StateName } from "./cascade.ts";
import type { CssClassRule } from "./compile.ts";

export const STYLE_RULE_KINDS = ["class", "ambient", "scoped"] as const;
export type StyleRuleKind = (typeof STYLE_RULE_KINDS)[number];

// Who authored a rule (O13/ADR-0005). This is *not* `origin`: `origin` is the
// import provenance (`{ source, ordinal }`) a re-import reconciles against.
// `authoredBy` is the write-path fence — ticket 18 rejects raw values from an
// agent while a token exists. Absent means `user`.
export const STYLE_RULE_AUTHORS = ["user", "agent", "preset"] as const;
export type StyleRuleAuthor = (typeof STYLE_RULE_AUTHORS)[number];

// Context ids the device suffixes already own. Storing them again under
// `contextStyles` would create two sources for one override.
export const RESERVED_CONTEXT_IDS: readonly string[] = ["desktop", "tablet", "mobile"];

export type StyleRuleScope = {
  type: "node";
  nodeId: string;
  role: "module-style";
};

// Import provenance: the stylesheet a rule came from and its ordinal there.
// The identity a re-import reconciles against; user-authored rules have none.
export type StyleRuleOrigin = {
  source: string;
  ordinal: number;
};

export type StyleRule = {
  // Stable internal identifier. Nodes reference the rule by id, never by name,
  // so a rename cannot break an assignment.
  id: string;
  // Class token for `class` rules; a mirror of the selector for `ambient`.
  name: string;
  kind: StyleRuleKind;
  // The CSS selector this rule emits (`[data-node-id="x"].hero-button` for an
  // assigned class, the verbatim selector for an ambient rule).
  selector: string;
  order: number;
  description?: string;
  scope?: StyleRuleScope;
  styles: DeviceValueMap;
  stylePriorities?: Record<string, "important">;
  // Pseudo states at the rule (O11: hover, focus, active, disabled). A class
  // can style its own hover without a second ambient rule, and the inspector
  // shows the four state tabs on the rule.
  states?: Partial<Record<StateName, DeviceValueMap>>;
  statePriorities?: Partial<Record<StateName, Record<string, "important">>>;
  contextStyles: Record<string, DeviceValueMap>;
  contextStylePriorities?: Record<string, Record<string, "important">>;
  rawCss?: string;
  origin?: StyleRuleOrigin;
  authoredBy?: StyleRuleAuthor;
  createdAt?: string;
  updatedAt?: string;
};

const CLOSED = { additionalProperties: false } as const;

const PropValueSchema = Type.Unsafe<PropValue>(Type.Any());

// The base bag keeps the device suffixes; its keys are style property names.
const DeviceValueMapSchema = Type.Record(Type.String(), PropValueSchema);

const StyleRuleScopeSchema = Type.Object(
  {
    type: Type.Literal("node"),
    nodeId: Type.String({ minLength: 1 }),
    role: Type.Literal("module-style"),
  },
  CLOSED,
);

const StyleRuleOriginSchema = Type.Object(
  {
    source: Type.String({ minLength: 1 }),
    ordinal: Type.Integer({ minimum: 0 }),
  },
  CLOSED,
);

const PriorityMapSchema = Type.Record(Type.String(), Type.Literal("important"));

const StatesSchema = Type.Object(
  {
    hover: Type.Optional(DeviceValueMapSchema),
    focus: Type.Optional(DeviceValueMapSchema),
    "focus-visible": Type.Optional(DeviceValueMapSchema),
    "focus-within": Type.Optional(DeviceValueMapSchema),
    active: Type.Optional(DeviceValueMapSchema),
    disabled: Type.Optional(DeviceValueMapSchema),
  },
  CLOSED,
);

const StatePrioritiesSchema = Type.Object(
  {
    hover: Type.Optional(PriorityMapSchema),
    focus: Type.Optional(PriorityMapSchema),
    "focus-visible": Type.Optional(PriorityMapSchema),
    "focus-within": Type.Optional(PriorityMapSchema),
    active: Type.Optional(PriorityMapSchema),
    disabled: Type.Optional(PriorityMapSchema),
  },
  CLOSED,
);

export const StyleRuleSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
    kind: Type.Union([
      Type.Literal("class"),
      Type.Literal("ambient"),
      Type.Literal("scoped"),
    ]),
    selector: Type.String({ minLength: 1 }),
    order: Type.Integer({ minimum: 0 }),
    description: Type.Optional(Type.String()),
    scope: Type.Optional(StyleRuleScopeSchema),
    styles: DeviceValueMapSchema,
    stylePriorities: Type.Optional(PriorityMapSchema),
    states: Type.Optional(StatesSchema),
    statePriorities: Type.Optional(StatePrioritiesSchema),
    contextStyles: Type.Record(Type.String(), DeviceValueMapSchema),
    contextStylePriorities: Type.Optional(
      Type.Record(Type.String(), PriorityMapSchema),
    ),
    rawCss: Type.Optional(Type.String()),
    origin: Type.Optional(StyleRuleOriginSchema),
    authoredBy: Type.Optional(
      Type.Union([Type.Literal("user"), Type.Literal("agent"), Type.Literal("preset")]),
    ),
    createdAt: Type.Optional(Type.String()),
    updatedAt: Type.Optional(Type.String()),
  },
  CLOSED,
);

export type StyleRuleRegistry = StyleRule[];

export const StyleRuleRegistrySchema = Type.Array(StyleRuleSchema);

// ---------------------------------------------------------------- selectors

// A class token as the editor accepts it: a leading letter, then letters,
// digits, `-` and `_`. No whitespace, no control characters, no leading dot.
const CLASS_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function isValidCssClassName(name: string): boolean {
  return CLASS_NAME_PATTERN.test(name);
}

export function assertValidCssClassName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new Error("Style class name is required");
  }
  if (!isValidCssClassName(trimmed)) {
    throw new Error(
      `Invalid style class name "${trimmed}": use a letter, then letters, digits, "-" or "_"`,
    );
  }
  return trimmed;
}

// Conservative selector check, not a full CSS parser: it rejects the shapes
// that would break the emitted stylesheet (empty, braces, at-rules, dangling
// combinators) and accepts the rest. The verbose-but-safe direction is
// deliberate — a false rejection is visible, a false acceptance is a broken
// release.
export function isValidCssSelector(selector: string): boolean {
  const trimmed = selector.trim();
  if (trimmed === "") return false;
  // A declaration body or an at-rule would break out of the rule block. `>` is
  // deliberately allowed: it is the child combinator (`h1 > span`).
  if (/[{};<]/.test(trimmed)) return false;
  if (trimmed.startsWith("@")) return false;
  // A selector may not begin or end with a combinator or a comma.
  if (/^[>+~,]/.test(trimmed) || /[>+~,]$/.test(trimmed)) return false;
  return true;
}

// Escape a class token for use inside a selector (`hero:button` -> `hero\:button`).
function escapeClassToken(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

// The selector of a class-kind rule: a plain class selector — the form the
// compiler emits since ticket 14 (`.cls`, once per class, `globalClassSelector`
// in `./cascade.ts`); the registry keeps the portable form.
export function classKindSelector(name: string): string {
  return `.${escapeClassToken(assertValidCssClassName(name))}`;
}

// The selector of a scoped rule. A generated scope name is not a user class
// name (it starts with `_`), so it is escaped without the class-name gate;
// still, the token is built only from the node id and a fixed prefix.
export function scopeSelectorFor(nodeId: string): string {
  return `.${escapeClassToken(scopeNameFor(nodeId))}`;
}

// What the selector UI shows: the emitted selector for a class rule, the
// verbatim selector for an ambient rule, the scope name for a scoped rule.
export function styleRuleSelector(rule: StyleRule): string {
  if (rule.kind === "class" && rule.scope === undefined) {
    return classKindSelector(rule.name);
  }
  return rule.selector;
}

// ----------------------------------------------------------- construction

export function scopeNameFor(nodeId: string): string {
  return `__senify_scope_${nodeId}`;
}

// A fresh class-kind rule. `id` is injected so the caller owns identity (the
// engine uses its id factory, tests use a counter).
export function createClassRule(input: {
  id: string;
  name: string;
  styles?: DeviceValueMap;
  order?: number;
  description?: string;
}): StyleRule {
  const name = assertValidCssClassName(input.name);
  return {
    id: input.id,
    name,
    kind: "class",
    selector: classKindSelector(name),
    order: input.order ?? 0,
    ...(input.description === undefined ? {} : { description: input.description }),
    styles: { ...(input.styles ?? {}) },
    contextStyles: {},
  };
}

// A rule pinned to one node: the "only this element" case. The generated name
// is never user-facing.
export function createScopedRule(input: {
  id: string;
  nodeId: string;
  styles?: DeviceValueMap;
  order?: number;
}): StyleRule {
  const name = scopeNameFor(input.nodeId);
  return {
    id: input.id,
    name,
    kind: "scoped",
    selector: scopeSelectorFor(input.nodeId),
    order: input.order ?? 0,
    scope: { type: "node", nodeId: input.nodeId, role: "module-style" },
    styles: { ...(input.styles ?? {}) },
    contextStyles: {},
  };
}

// An ambient rule: attaches by selector matching, never assigned to a node.
export function createAmbientRule(input: {
  id: string;
  selector: string;
  styles?: DeviceValueMap;
  order?: number;
  description?: string;
}): StyleRule {
  const selector = input.selector.trim();
  if (!isValidCssSelector(selector)) {
    throw new Error(`Invalid CSS selector "${input.selector}"`);
  }
  return {
    id: input.id,
    name: selector,
    kind: "ambient",
    selector,
    order: input.order ?? 0,
    ...(input.description === undefined ? {} : { description: input.description }),
    styles: { ...(input.styles ?? {}) },
    contextStyles: {},
  };
}

// ------------------------------------------------------- tolerant parsing

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asDeviceValueMap(value: unknown): DeviceValueMap {
  if (!isRecord(value)) return {};
  const out: DeviceValueMap = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = entry as PropValue;
  }
  return out;
}

function asPriorityMap(value: unknown): Record<string, "important"> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, "important"> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === "important") out[key] = "important";
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asContextStyles(value: unknown): Record<string, DeviceValueMap> {
  if (!isRecord(value)) return {};
  const out: Record<string, DeviceValueMap> = {};
  for (const [contextId, bag] of Object.entries(value)) {
    out[contextId] = asDeviceValueMap(bag);
  }
  return out;
}

function asScope(value: unknown): StyleRuleScope | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type !== "node" || typeof value.nodeId !== "string") return undefined;
  if (value.role !== "module-style") return undefined;
  return { type: "node", nodeId: value.nodeId, role: "module-style" };
}

function asOrigin(value: unknown): StyleRuleOrigin | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.source !== "string") return undefined;
  if (typeof value.ordinal !== "number" || !Number.isFinite(value.ordinal)) {
    return undefined;
  }
  return { source: value.source, ordinal: Math.trunc(value.ordinal) };
}

// Only the known states survive a tolerant read; an unknown key is
// dropped rather than emitted as a broken pseudo class.
function asStates(value: unknown): StyleRule["states"] | undefined {
  if (!isRecord(value)) return undefined;
  const out: Partial<Record<StateName, DeviceValueMap>> = {};
  for (const state of STATE_ORDER) {
    const bag = value[state];
    if (bag === undefined) continue;
    out[state] = asDeviceValueMap(bag);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asStatePriorities(value: unknown): StyleRule["statePriorities"] | undefined {
  if (!isRecord(value)) return undefined;
  const out: Partial<Record<StateName, Record<string, "important">>> = {};
  for (const state of STATE_ORDER) {
    const priority = asPriorityMap(value[state]);
    if (priority !== undefined) out[state] = priority;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asAuthor(value: unknown): StyleRuleAuthor | undefined {
  return value === "user" || value === "agent" || value === "preset" ? value : undefined;
}

function asKind(value: unknown, scope: StyleRuleScope | undefined): StyleRuleKind {
  if (value === "class" || value === "ambient" || value === "scoped") return value;
  return scope === undefined ? "class" : "scoped";
}

// One entry, tolerant: a broken rule drops, it never throws. A rule without an
// id or name cannot be identified and is skipped; everything else is
// backfilled (`kind` from the scope, `selector` from the class name, `order`
// from the caller's position). This mirrors the reference implementation's
// stance: corrupt persisted data must not break the whole site load.
export function parseStyleRule(raw: unknown, index = 0): StyleRule | undefined {
  if (!isRecord(raw)) return undefined;
  const id = raw.id;
  const name = raw.name;
  if (typeof id !== "string" || id === "") return undefined;
  if (typeof name !== "string" || name.trim() === "") return undefined;

  const scope = asScope(raw.scope);
  const kind = asKind(raw.kind, scope);
  const trimmedName = name.trim();

  // The tolerant fallback escapes the token verbatim instead of running the
  // class-name gate: a scope name starts with `_`, and a corrupt name must not
  // abort the whole registry load.
  const fallbackSelector =
    scope === undefined
      ? `.${escapeClassToken(trimmedName)}`
      : scopeSelectorFor(scope.nodeId);

  let selector = typeof raw.selector === "string" ? raw.selector.trim() : "";
  if (selector === "") selector = fallbackSelector;
  // An ambient rule needs a valid selector; if it is unusable, fall back so the
  // entry stays addressable instead of emitting broken CSS.
  if (!isValidCssSelector(selector)) {
    selector = fallbackSelector;
  }

  const order =
    typeof raw.order === "number" && Number.isFinite(raw.order)
      ? Math.max(0, Math.trunc(raw.order))
      : index;

  // Built in one canonical field order, so a parsed rule serializes the same
  // way however the caller assembled it — that is what makes a save/load cycle
  // byte-stable (the round-trip test depends on it).
  const priority = asPriorityMap(raw.stylePriorities);
  const states = asStates(raw.states);
  const statePriorities = asStatePriorities(raw.statePriorities);
  const contextPriority = asPriorityMapRecord(raw.contextStylePriorities);
  const origin = asOrigin(raw.origin);
  const author = asAuthor(raw.authoredBy);

  return {
    id,
    name: trimmedName,
    kind,
    selector,
    order,
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    ...(scope === undefined ? {} : { scope }),
    styles: asDeviceValueMap(raw.styles),
    ...(priority === undefined ? {} : { stylePriorities: priority }),
    ...(states === undefined ? {} : { states }),
    ...(statePriorities === undefined ? {} : { statePriorities }),
    contextStyles: asContextStyles(raw.contextStyles),
    ...(contextPriority === undefined ? {} : { contextStylePriorities: contextPriority }),
    ...(typeof raw.rawCss === "string" ? { rawCss: raw.rawCss } : {}),
    ...(origin === undefined ? {} : { origin }),
    ...(author === undefined ? {} : { authoredBy: author }),
    ...(typeof raw.createdAt === "string" ? { createdAt: raw.createdAt } : {}),
    ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
  };
}

// The rule in its canonical form: known fields only, in the canonical order.
// The write path runs every rule through this before it is stored, so two
// documents that hold the same rule are also byte-identical when serialized.
export function canonicalStyleRule(rule: StyleRule): StyleRule | undefined {
  return parseStyleRule(rule);
}

function asPriorityMapRecord(
  value: unknown,
): Record<string, Record<string, "important">> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, Record<string, "important">> = {};
  for (const [contextId, entry] of Object.entries(value)) {
    const priority = asPriorityMap(entry);
    if (priority !== undefined) out[contextId] = priority;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// A whole registry, tolerant: invalid entries drop silently.
export function parseStyleRuleRegistry(raw: unknown): StyleRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StyleRule[] = [];
  raw.forEach((entry, index) => {
    const rule = parseStyleRule(entry, index);
    if (rule === undefined) return;
    if (seen.has(rule.id)) return;
    seen.add(rule.id);
    out.push(rule);
  });
  return normalizeRuleOrder(out);
}

// The stored order is always the array position: reordering is a permutation
// of the array, and a stale `order` field can never win over it.
export function normalizeRuleOrder(rules: readonly StyleRule[]): StyleRule[] {
  return rules.map((rule, index) =>
    rule.order === index ? rule : { ...rule, order: index },
  );
}

// --------------------------------------------------------------- validation

// Hard validation for the write boundary: the shape must be complete. The
// tolerant parser belongs to the read path; a write either matches the schema
// or fails with the offending field.
export function styleRuleErrors(raw: unknown): string[] {
  const errors = [...Value.Errors(StyleRuleSchema as TSchema, raw)];
  return errors.map((error) => {
    const path = error.path === "" ? "(root)" : error.path.replace(/^\//, "").replace(/\//g, ".");
    return `${path}: ${error.message}`;
  });
}

export function isStyleRule(value: unknown): value is StyleRule {
  return styleRuleErrors(value).length === 0;
}

// Context ids that collide with the device suffixes. Returns the offending ids
// so a caller can report them; the write path rejects them.
export function reservedContextIds(rule: StyleRule): string[] {
  return Object.keys(rule.contextStyles).filter((id) =>
    RESERVED_CONTEXT_IDS.includes(id),
  );
}

// --------------------------------------------------------- compiler bridge

// The compiler reads user rules as `CssClassRule` (`./compile.ts`). This is
// the one mapping from the stored registry shape onto it — all three kinds,
// the freedom valves included. The canvas (`toCssDocument`) and the bake
// (`style-css.ts`) both go through here, so the release and the frame compile
// the very same rule list.
export function styleRuleToClassRule(rule: StyleRule): CssClassRule {
  return {
    name: rule.name,
    props: { ...rule.styles },
    ...(rule.states === undefined ? {} : { states: { ...rule.states } }),
    kind: rule.kind,
    selector: rule.selector,
    ...(rule.scope === undefined ? {} : { scope: { nodeId: rule.scope.nodeId } }),
    ...(Object.keys(rule.contextStyles).length === 0
      ? {}
      : { contextStyles: { ...rule.contextStyles } }),
    ...(rule.rawCss === undefined ? {} : { rawCss: rule.rawCss }),
  };
}

export type { Static };