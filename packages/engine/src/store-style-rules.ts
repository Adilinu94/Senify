import { SenifyError } from "@senify/core";
import {
  STATE_ORDER,
  assertValidCssClassName,
  classKindSelector,
  createAmbientRule,
  createClassRule,
  createScopedRule,
  isSafeRawCss,
  isValidCssSelector,
  normalizeRuleOrder,
  parseStyleRuleRegistry,
  reservedContextIds,
  styleRuleErrors,
  type StyleRule,
} from "@senify/widget-engine";
import type { Author, NodeTree } from "@senify/section-sdk";
import { RULE_ID_PATTERN } from "@senify/framer-import";
import { agentStyleViolations, rawCssViolations, styleRuleBags, type StyleBag } from "./style-fence.ts";
import { newEntityId } from "./ids.ts";
import { draftConflictError } from "./paths.ts";
import { buildAuditInsert } from "./store-audit.ts";
import {
  assertStyleRegistryVersion,
  assertThemeVersionUnderLock,
  selectorMentionsClass,
} from "./store-class-guards.ts";
import { assertDraftShape, toFiniteNumber, toJson, toJsonParam } from "./store-row-utils.ts";
import type { Db, DbClient } from "./db.ts";
import type { SiteTheme } from "./types.ts";

// The style-rule registry, extracted from `Store` (P3-2). The registry is
// site-wide: a reusable class (`hero-button`) applies to every page, so it
// belongs to the site and not to a page draft. Reads are tolerant (a corrupt
// entry drops, it never blocks the registry), writes are hard (the shape
// either matches `StyleRuleSchema` or the write fails with the offending
// field).
//
// Every write appends to the same append-only audit log the page mutations
// use (`pageId: null`), so a rule change is traceable like any other edit.
// The optimistic lock is `style_rules_version` (`FOR UPDATE` + `baseVersion`
// → 409), so a write based on a stale read cannot silently overwrite.

// The style rule column is read on its own, never through the site row: the
// rules are a separate resource with their own endpoints.
export type StyleRuleRow = {
  style_rules_json: unknown;
  style_rules_version: unknown;
};

export type CreateStyleRuleInput = {
  id?: string;
  name: string;
  kind?: "class" | "ambient" | "scoped";
  selector?: string;
  nodeId?: string;
  description?: string;
  styles?: Record<string, unknown>;
  stylePriorities?: Record<string, "important">;
  states?: Record<string, Record<string, unknown>>;
  statePriorities?: Record<string, Record<string, "important">>;
  contextStyles?: Record<string, Record<string, unknown>>;
  contextStylePriorities?: Record<string, Record<string, "important">>;
  rawCss?: string;
  // The optimistic lock travels with the write, not with the rule body: the
  // builders ignore it, `createStyleRule` reads it for the version check.
  baseVersion?: number;
  // Guards the theme (variables) the rule may reference; checked under lock.
  baseThemeVersion?: number;
};

// The write event the audit records: what changed, not the whole array.
type StyleRuleWriteEvent = {
  mutation: string;
  params: Record<string, unknown>;
  author: Author;
  baseVersion?: number;
  baseThemeVersion?: number;
  // A class rename rewrites the class tokens of every page draft in the same
  // transaction as the registry (editor branch, merged from C).
  rename?: {
    from: string;
    to: string;
    pageContext?: { pageId: string; baseDraftVersion: number };
    pageDraftVersion?: number;
  };
  unusedClass?: {
    name: string;
    pageContext?: { pageId: string; baseDraftVersion: number };
    pageDraftVersion?: number;
  };
};

// The schema reports a dotted field; the write path surfaces the first one.
function StyleRuleSchemaErrors(rule: unknown): string[] {
  return styleRuleErrors(rule);
}

function assertValidClassName(name: string): string {
  return assertValidCssClassName(name);
}

function isWritableSelector(selector: string): boolean {
  return isValidCssSelector(selector);
}

// A class-kind or scoped rule owns its class token; a second rule with the
// same name would emit a duplicate selector that no assignment can separate.
export function assertClassNameFree(
  rules: readonly StyleRule[],
  name: string,
  exceptId: string,
  field: string,
): void {
  const clash = rules.find(
    (rule) => rule.id !== exceptId && rule.kind !== "ambient" && rule.name === name,
  );
  if (clash !== undefined) {
    throw new SenifyError("conflict", `Style class "${name}" already exists`, {
      field,
      suggestion: "Pick a name that is not in use yet.",
    });
  }
}

// One scoped rule per node: a second rule for the same node would compete with
// the first without a user-visible way to tell them apart.
function assertSingleScopedRule(
  rules: readonly StyleRule[],
  nodeId: string,
  exceptId: string,
): void {
  const clash = rules.find(
    (rule) =>
      rule.id !== exceptId &&
      rule.scope !== undefined &&
      rule.scope.nodeId === nodeId,
  );
  if (clash !== undefined) {
    throw new SenifyError(
      "conflict",
      `Node "${nodeId}" already owns a scoped style rule`,
      {
        field: "nodeId",
        suggestion: "Update the existing rule instead of creating a second one.",
      },
    );
  }
}

// Turns the transport input into a complete rule through the widget engine
// constructors, so name and selector can never drift apart.
function buildStyleRule(
  input: CreateStyleRuleInput,
  kind: "class" | "ambient" | "scoped",
  id: string,
  order: number,
): StyleRule {
  const styles = (input.styles ?? {}) as StyleRule["styles"];
  const base = { id, order, styles };

  if (kind === "ambient") {
    if (input.selector === undefined) {
      throw new Error("An ambient rule requires a selector");
    }
    return withExtras(
      createAmbientRule({
        ...base,
        selector: input.selector,
        ...(input.description === undefined ? {} : { description: input.description }),
      }),
      input,
    );
  }
  if (kind === "scoped") {
    if (input.nodeId === undefined) {
      throw new Error("A scoped rule requires the node it belongs to");
    }
    return withExtras(
      createScopedRule({ ...base, nodeId: input.nodeId }),
      input,
    );
  }
  return withExtras(
    createClassRule({
      ...base,
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
    }),
    input,
  );
}

// The optional extras a transport input may carry: custom conditions, the four
// pseudo states (O11) and the author provenance (ADR-0005).
function withExtras(rule: StyleRule, input: CreateStyleRuleInput): StyleRule {
  let next = rule;
  if (input.contextStyles !== undefined) {
    const contexts: StyleRule["contextStyles"] = { ...next.contextStyles };
    for (const [contextId, bag] of Object.entries(input.contextStyles)) {
      contexts[contextId] = { ...(bag as StyleRule["styles"]) };
    }
    next = { ...next, contextStyles: contexts };
  }
  if (input.states !== undefined) {
    const states: NonNullable<StyleRule["states"]> = { ...next.states };
    for (const state of STATE_ORDER) {
      const bag = input.states[state];
      if (bag !== undefined) states[state] = { ...(bag as StyleRule["styles"]) };
    }
    next = { ...next, states };
  }
  if (input.stylePriorities !== undefined) {
    next = { ...next, stylePriorities: { ...input.stylePriorities } };
  }
  if (input.statePriorities !== undefined) {
    const statePriorities: NonNullable<StyleRule["statePriorities"]> = {
      ...next.statePriorities,
    };
    for (const state of STATE_ORDER) {
      const priority = input.statePriorities[state];
      if (priority !== undefined) statePriorities[state] = { ...priority };
    }
    next = { ...next, statePriorities };
  }
  if (input.contextStylePriorities !== undefined) {
    next = {
      ...next,
      contextStylePriorities: {
        ...next.contextStylePriorities,
      },
    };
  }
  if (input.rawCss !== undefined) {
    next = { ...next, rawCss: input.rawCss };
  }
  return next;
}

// Hard shape check of one rule plus the semantic rules the schema cannot
// express: context ids may not shadow the device suffixes, a scoped rule
// must name its node, and an ambient rule needs a real selector.
//
// Exported because the Framer import checks its rules inside its own
// transaction, with the same hard checks as every other write.
export function assertWritableRule(rule: StyleRule, field: string): void {
  const errors = StyleRuleSchemaErrors(rule);
  if (errors.length > 0) {
    throw new SenifyError("validation", `Invalid style rule: ${errors[0]}`, {
      field,
      suggestion: "Check the rule against the documented shape.",
    });
  }
  if (rule.rawCss !== undefined && !isSafeRawCss(rule.rawCss)) {
    throw new SenifyError("validation", "rawCss must be a single @keyframes block", {
      field: `${field}.rawCss`,
      suggestion:
        "Only sanitised @keyframes are carried verbatim; everything else is structured.",
    });
  }
  if (rule.rawCss !== undefined) {
    const violation = rawCssViolations(rule.rawCss, `${field}.rawCss`)[0];
    if (violation !== undefined) {
      throw new SenifyError("validation", violation.message, {
        field: violation.field,
        suggestion: violation.suggestion,
      });
    }
  }
  const reserved = reservedContextIds(rule);
  if (reserved.length > 0) {
    throw new SenifyError(
      "validation",
      `Context id "${reserved[0]}" is reserved for a built-in device`,
      {
        field: `${field}.contextStyles`,
        suggestion:
          "Use the device suffix form (`padding_tablet`) for tablet and mobile; use context ids only for custom conditions.",
      },
    );
  }
}

// Ambient rules and rawCss stay a human capability: an agent cannot author
// free selectors or free CSS (ticket 18; ADR-0005 keeps the property space
// open, this closes only the value form for agents).
function assertAgentRuleKind(rule: { kind: StyleRule["kind"]; rawCss?: string }): void {
  if (rule.kind === "ambient") {
    throw new SenifyError(
      "validation",
      "Ambient rules are authored in the editor, not by agents",
      {
        field: "rule.kind",
        suggestion: "Use a class or scoped rule; ambient selectors stay human.",
      },
    );
  }
  if (rule.rawCss !== undefined) {
    throw new SenifyError(
      "validation",
      "rawCss is authored in the editor, not by agents",
      {
        field: "rule.rawCss",
        suggestion: "Use a registered motion preset instead of a custom animation.",
      },
    );
  }
}

// Ticket 18, slice 3: the value-level fence for agent writes. The theme is
// loaded only when there is something to check, so human writes pay nothing.
function assertAgentValues(theme: SiteTheme, bags: readonly StyleBag[]): void {
  if (bags.length === 0) return;
  const violation = agentStyleViolations({ theme: theme.theme, bags })[0];
  if (violation === undefined) return;
  throw new SenifyError("validation", violation.message, {
    field: violation.field,
    suggestion: violation.suggestion,
  });
}

export type StyleRuleUpdatePatch = {
  name?: string;
  selector?: string;
  description?: string | null;
  styles?: Record<string, unknown>;
  stylePriorities?: Record<string, "important"> | null;
  states?: Record<string, Record<string, unknown>> | null;
  statePriorities?: Record<string, Record<string, "important">> | null;
  contextStyles?: Record<string, Record<string, unknown>>;
  contextStylePriorities?: Record<string, Record<string, "important">> | null;
  replaceStyleValues?: boolean;
  rawCss?: string | null;
  baseVersion?: number;
  baseThemeVersion?: number;
};

export class StyleRuleStore {
  readonly #db: Db;
  // The theme comes from the `Store` because it owns the site theme row; the
  // registry only needs the resolved theme to fence agent values.
  readonly #loadTheme: (siteId: string) => Promise<SiteTheme>;

  constructor(db: Db, loadTheme: (siteId: string) => Promise<SiteTheme>) {
    this.#db = db;
    this.#loadTheme = loadTheme;
  }

  async readRules(siteId: string, client: DbClient = this.#db): Promise<StyleRule[]> {
    const result = await client.query<StyleRuleRow>(
      `SELECT style_rules_json, style_rules_version FROM sites WHERE id = $1`,
      [siteId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Site "${siteId}" does not exist`, {
        field: "siteId",
        suggestion: "Create the site first or check the id.",
      });
    }
    if (row.style_rules_json === null || row.style_rules_json === undefined) {
      return [];
    }
    return parseStyleRuleRegistry(toJson<unknown>(row.style_rules_json));
  }

  async getRegistry(siteId: string): Promise<{ version: number; rules: StyleRule[] }> {
    const result = await this.#db.query<StyleRuleRow>(
      `SELECT style_rules_json, style_rules_version FROM sites WHERE id = $1`,
      [siteId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Site "${siteId}" does not exist`, { field: "siteId" });
    }
    return {
      version: toFiniteNumber(row.style_rules_version ?? 0, "style_rules_version"),
      rules:
        row.style_rules_json === null || row.style_rules_json === undefined
          ? []
          : parseStyleRuleRegistry(toJson<unknown>(row.style_rules_json)),
    };
  }

  async getRule(siteId: string, ruleId: string): Promise<StyleRule> {
    const rules = await this.readRules(siteId);
    const found = rules.find((rule) => rule.id === ruleId);
    if (found === undefined) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
        suggestion: "List the style rules of the site and pick an existing id.",
      });
    }
    return found;
  }

  // Rollback path of the release manifest (E2): the snapshot's registry
  // replaces the current one. Every rule passes the same hard checks as a
  // normal write; the audit records the restore, not the whole array.
  async replaceStyleRules(
    siteId: string,
    rules: readonly StyleRule[],
    author: Author,
    baseVersion?: number,
  ): Promise<StyleRule[]> {
    rules.forEach((rule, index) => assertWritableRule(rule, `rules[${index}]`));
    return this.#write(siteId, [...rules], {
      mutation: "restoreReleaseStyleRules",
      params: { count: rules.length },
      author,
      ...(baseVersion === undefined ? {} : { baseVersion }),
    });
  }

  // Framer import (plan S3.1): appends the imported rules to the site
  // registry with their `framer-import` origin intact. Every rule passes the
  // same hard checks as a manual write; the audit records the import, so an
  // undo of the batch does not need to touch the site-wide registry.
  async appendImportedStyleRules(
    siteId: string,
    rules: readonly StyleRule[],
    author: Author,
    baseVersion?: number,
  ): Promise<StyleRule[]> {
    const registry = await this.getRegistry(siteId);
    assertStyleRegistryVersion(baseVersion, registry.version);
    const existing = registry.rules;
    const appended = rules.map((rule, index) => {
      const ordered: StyleRule = { ...rule, order: existing.length + index };
      assertWritableRule(ordered, `rules[${index}]`);
      return ordered;
    });
    return this.#write(siteId, [...existing, ...appended], {
      mutation: "importFramerStyleRules",
      params: { count: appended.length },
      author,
      baseVersion: registry.version,
    });
  }

  async createStyleRule(
    siteId: string,
    input: CreateStyleRuleInput,
    author: Author,
  ): Promise<StyleRule> {
    const registry = await this.getRegistry(siteId);
    assertStyleRegistryVersion(input.baseVersion, registry.version);
    const rules = registry.rules;
    const kind = input.kind ?? "class";

    let rule: StyleRule;
    try {
      rule = buildStyleRule(input, kind, input.id ?? newEntityId(), rules.length);
    } catch (error) {
      throw new SenifyError(
        "validation",
        error instanceof Error ? error.message : "Invalid style rule",
        { field: "name", suggestion: "Check the class name or selector." },
      );
    }

    // Provenance comes from the token, never from the body (ticket 18): only
    // an agent token produces an agent-authored rule, and a rule created by
    // the editor stays user-authored even if a body field claims otherwise.
    rule = { ...rule, authoredBy: author.kind === "agent" ? "agent" : "user" };

    // The scope check comes first: a scoped rule derives its name from its node,
    // so a second rule for the same node would also trip the name check and
    // report the wrong cause.
    if (rule.scope !== undefined) {
      assertSingleScopedRule(rules, rule.scope.nodeId, rule.id);
    }
    if (kind !== "ambient") {
      assertClassNameFree(rules, rule.name, rule.id, "name");
    }
    assertWritableRule(rule, "rule");
    if (author.kind === "agent") {
      assertAgentRuleKind(rule);
      assertAgentValues(await this.#loadTheme(siteId), styleRuleBags(rule, "rule"));
    }

    const next = [...rules, rule];
    const written = await this.#write(siteId, next, {
      mutation: "create_style_rule",
      params: { ruleId: rule.id, name: rule.name, kind: rule.kind },
      author,
      baseVersion: registry.version,
      ...(input.baseThemeVersion === undefined ? {} : { baseThemeVersion: input.baseThemeVersion }),
    });
    return written.find((entry) => entry.id === rule.id) ?? rule;
  }

  async updateStyleRule(
    siteId: string,
    ruleId: string,
    patch: StyleRuleUpdatePatch,
    author: Author,
    pageContext?: { pageId: string; baseDraftVersion: number },
  ): Promise<{ rule: StyleRule; version: number; pageDraftVersion?: number }> {
    const registry = await this.getRegistry(siteId);
    assertStyleRegistryVersion(patch.baseVersion, registry.version);
    const rules = registry.rules;
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
      });
    }
    const current = rules[index]!;
    if (patch.replaceStyleValues && author.kind === "agent") {
      throw new SenifyError("validation", "Replacing all style values is restricted to human editors", {
        field: "replaceStyleValues",
      });
    }
    const next: StyleRule = { ...current, styles: { ...current.styles }, contextStyles: { ...current.contextStyles } };

    if (patch.name !== undefined) {
      if (current.kind === "ambient") {
        throw new SenifyError(
          "validation",
          "An ambient rule is renamed through its selector",
          {
            field: "name",
            suggestion: "Send `selector` instead; the name mirrors it.",
          },
        );
      }
      if (current.scope !== undefined) {
        throw new SenifyError("validation", "A scoped rule cannot be renamed", {
          field: "name",
          suggestion: "Scoped rules are owned by their node and generated.",
        });
      }
      try {
        next.name = assertValidClassName(patch.name);
      } catch (error) {
        throw new SenifyError(
          "validation",
          error instanceof Error ? error.message : "Invalid style class name",
          { field: "name" },
        );
      }
      next.selector = classKindSelector(next.name);
      assertClassNameFree(rules, next.name, ruleId, "name");
    }

    if (patch.selector !== undefined) {
      if (current.kind !== "ambient") {
        throw new SenifyError(
          "validation",
          "Only an ambient rule carries a free selector",
          {
            field: "selector",
            suggestion: "A class rule derives its selector from its name.",
          },
        );
      }
      const selector = patch.selector.trim();
      if (!isWritableSelector(selector)) {
        throw new SenifyError("validation", `Invalid CSS selector "${patch.selector}"`, {
          field: "selector",
        });
      }
      next.selector = selector;
      next.name = selector;
    }

    if (patch.description !== undefined) {
      if (patch.description === null) delete next.description;
      else next.description = patch.description;
    }
    if (patch.styles !== undefined) {
      next.styles = { ...(patch.replaceStyleValues ? {} : next.styles), ...(patch.styles as StyleRule["styles"]) };
    }
    if (patch.contextStyles !== undefined) {
      next.contextStyles = {
        ...(patch.replaceStyleValues ? {} : next.contextStyles),
        ...(patch.contextStyles as StyleRule["contextStyles"]),
      };
    }
    // Null removes an optional bag; omission keeps it. Empty bags are distinct
    // raw content and must not be introduced by an exact editor undo.
    if (patch.states === null) delete next.states;
    else if (patch.states !== undefined) {
      const states: NonNullable<StyleRule["states"]> = patch.replaceStyleValues ? {} : { ...next.states };
      for (const state of STATE_ORDER) {
        const bag = patch.states[state];
        if (bag !== undefined) states[state] = { ...(bag as StyleRule["styles"]) };
      }
      next.states = states;
    }
    if (patch.stylePriorities === null) delete next.stylePriorities;
    else if (patch.stylePriorities !== undefined) {
      next.stylePriorities = { ...(patch.replaceStyleValues ? {} : next.stylePriorities), ...patch.stylePriorities };
    }
    if (patch.statePriorities === null) delete next.statePriorities;
    else if (patch.statePriorities !== undefined) {
      const statePriorities: NonNullable<StyleRule["statePriorities"]> = {
        ...(patch.replaceStyleValues ? {} : next.statePriorities),
      };
      for (const state of STATE_ORDER) {
        const priority = patch.statePriorities[state];
        if (priority !== undefined) statePriorities[state] = { ...priority };
      }
      next.statePriorities = statePriorities;
    }
    if (patch.contextStylePriorities === null) delete next.contextStylePriorities;
    else if (patch.contextStylePriorities !== undefined) {
      next.contextStylePriorities = {
        ...(patch.replaceStyleValues ? {} : next.contextStylePriorities),
        ...patch.contextStylePriorities,
      };
    }
    if (patch.rawCss !== undefined) {
      if (patch.rawCss === null) delete next.rawCss;
      else next.rawCss = patch.rawCss;
    }
    next.updatedAt = new Date().toISOString();
    assertWritableRule(next, "rule");
    if (author.kind === "agent") {
      // The fence checks only what the patch writes, not the whole rule: a
      // human value that predates the fence must not block an unrelated edit.
      if (patch.rawCss !== undefined) {
        throw new SenifyError(
          "validation",
          "rawCss is authored in the editor, not by agents",
          {
            field: "rule.rawCss",
            suggestion: "Use a registered motion preset instead of a custom animation.",
          },
        );
      }
      if (patch.selector !== undefined) {
        throw new SenifyError(
          "validation",
          "Ambient selectors are authored in the editor, not by agents",
          {
            field: "rule.selector",
            suggestion: "Change the rule's styles; selectors stay human.",
          },
        );
      }
      const bags: StyleBag[] = [];
      if (patch.styles !== undefined) {
        bags.push({ field: "rule.styles", values: patch.styles });
      }
      if (patch.states != null) {
        for (const [state, values] of Object.entries(patch.states)) {
          if (values !== undefined) {
            bags.push({ field: `rule.states.${state}`, values });
          }
        }
      }
      if (patch.contextStyles !== undefined) {
        for (const [contextId, values] of Object.entries(patch.contextStyles)) {
          if (values !== undefined) {
            bags.push({ field: `rule.contextStyles.${contextId}`, values });
          }
        }
      }
      assertAgentValues(await this.#loadTheme(siteId), bags);
    }

    const result = [...rules];
    result[index] = next;
    const rename: { from: string; to: string; pageContext?: { pageId: string; baseDraftVersion: number }; pageDraftVersion?: number } | undefined =
      current.kind === "class" && current.scope === undefined && current.name !== next.name
        ? { from: current.name, to: next.name, ...(pageContext === undefined ? {} : { pageContext }) }
        : undefined;
    if (rename !== undefined && (current.origin?.source === "framer-import" || RULE_ID_PATTERN.test(current.id))) {
      throw new SenifyError("conflict", "Importierte Framer-Klassen können noch nicht sicher umbenannt werden. Dupliziere die Klasse für eigene Änderungen.", { field: "name" });
    }
    if (rename !== undefined && rules.some((rule) => rule.kind === "ambient" && (selectorMentionsClass(rule.selector, rename.from) || selectorMentionsClass(rule.selector, rename.to)))) {
      throw new SenifyError("conflict", "Ein freier CSS-Selektor verweist auf diesen Klassennamen. Passe den Selektor vor dem Umbenennen an.", { field: "name" });
    }
    if (pageContext !== undefined && rename === undefined) {
      throw new SenifyError("validation", "Der Seitenkontext gilt nur beim Umbenennen einer globalen Klasse", { field: "pageContext" });
    }
    const baseVersion = registry.version;
    const written = await this.#write(siteId, result, {
      mutation: "update_style_rule",
      params: { ruleId, patch: Object.keys(patch) },
      author,
      baseVersion,
      ...(patch.baseThemeVersion === undefined ? {} : { baseThemeVersion: patch.baseThemeVersion }),
      ...(rename === undefined ? {} : { rename }),
    });
    return {
      rule: written[index] ?? next,
      version: baseVersion + 1,
      ...(rename?.pageDraftVersion === undefined ? {} : { pageDraftVersion: rename.pageDraftVersion }),
    };
  }

  async deleteStyleRule(
    siteId: string,
    ruleId: string,
    author: Author,
    baseVersion?: number,
    pageContext?: { pageId: string; baseDraftVersion: number },
  ): Promise<{ version: number; pageDraftVersion?: number }> {
    const registry = await this.getRegistry(siteId);
    assertStyleRegistryVersion(baseVersion, registry.version);
    const rules = registry.rules;
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
      });
    }
    const target = rules[index]!;
    // A global class may only go while no page draft uses it; the write checks
    // that under lock (`unusedClass`).
    const unusedClass: { name: string; pageContext?: { pageId: string; baseDraftVersion: number }; pageDraftVersion?: number } | undefined =
      target.kind === "class" && target.scope === undefined
        ? { name: target.name, ...(pageContext === undefined ? {} : { pageContext }) }
        : undefined;
    const next = rules.filter((rule) => rule.id !== ruleId);
    await this.#write(siteId, next, {
      mutation: "delete_style_rule",
      params: { ruleId, name: rules[index]!.name, kind: rules[index]!.kind },
      author,
      baseVersion: registry.version,
      ...(unusedClass === undefined ? {} : { unusedClass }),
    });
    const pageDraftVersion = unusedClass?.pageDraftVersion ?? pageContext?.baseDraftVersion;
    return {
      version: registry.version + 1,
      ...(pageDraftVersion === undefined ? {} : { pageDraftVersion }),
    };
  }

  // Reorder is a permutation of the array; `order` is normalized to the array
  // position afterwards, so a stale number can never win over it.
  async reorderStyleRule(
    siteId: string,
    ruleId: string,
    target: number | { classIndex: number },
    author: Author,
    baseVersion?: number,
  ): Promise<StyleRule[]> {
    const registry = await this.getRegistry(siteId);
    assertStyleRegistryVersion(baseVersion, registry.version);
    const rules = registry.rules;
    const from = rules.findIndex((rule) => rule.id === ruleId);
    if (from < 0) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
      });
    }
    let toIndex: number;
    if (typeof target === "number") toIndex = target;
    else {
      const classes = rules.filter((rule) => rule.kind === "class" && rule.scope === undefined);
      if (rules[from]!.kind !== "class" || rules[from]!.scope !== undefined ||
          !Number.isInteger(target.classIndex) || target.classIndex < 0 || target.classIndex >= classes.length) {
        throw new SenifyError("validation", "Ungültige Position für die globale Klasse", { field: "classIndex" });
      }
      toIndex = rules.findIndex((rule) => rule.id === classes[target.classIndex]!.id);
    }
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= rules.length) {
      throw new SenifyError(
        "validation",
        `Index ${toIndex} is outside the style rule list`,
        {
          field: "index",
          suggestion: `Use an index between 0 and ${rules.length - 1}.`,
        },
      );
    }
    const moved = rules[from]!;
    // Reordering a rule another author wrote is allowed, but the audit marks
    // it (ticket 18, point 2): the rule keeps its provenance, the entry names
    // the foreign authorship.
    const expected = author.kind === "agent" ? "agent" : "user";
    const authoredBy = moved.authoredBy ?? "user";
    const next = [...rules];
    next.splice(from, 1);
    next.splice(toIndex, 0, moved);
    return this.#write(siteId, next, {
      mutation: "reorder_style_rule",
      params: {
        ruleId,
        from,
        to: toIndex,
        ...(authoredBy === expected ? {} : { foreignAuthoredBy: authoredBy }),
      },
      author,
      baseVersion: registry.version,
    });
  }

  // The whole registry is rewritten in one transaction-free UPDATE: the array
  // is the document, so a partial write cannot leave two sources of truth. The
  // audit entry records what changed, not the whole array.
  async #write(
    siteId: string,
    rules: StyleRule[],
    event: StyleRuleWriteEvent,
  ): Promise<StyleRule[]> {
    const normalized = normalizeRuleOrder(rules);
    return this.#db.withTransaction(async (tx) => {
      const locked = await tx.query<StyleRuleRow>(
        `SELECT style_rules_json, style_rules_version FROM sites WHERE id = $1 FOR UPDATE`,
        [siteId],
      );
      const current = locked.rows[0];
      if (!current) {
        throw new SenifyError("not_found", `Site "${siteId}" does not exist`, { field: "siteId" });
      }
      const version = toFiniteNumber(current.style_rules_version ?? 0, "style_rules_version");
      if (event.baseVersion !== undefined && event.baseVersion !== version) {
        // The current version travels with the error: the client can only
        // resend its write against the registry state the server is on, and a
        // version in the message text is not something a client can rely on.
        throw new SenifyError("conflict", "Die Style-Registry wurde zwischenzeitlich geändert", {
          field: "baseVersion",
          suggestion: "Lade die Style-Registry neu und sende den Write erneut.",
          currentVersion: version,
        });
      }
      await assertThemeVersionUnderLock(tx, siteId, event.baseThemeVersion);
      const nextVersion = version + 1;
      const now = new Date().toISOString();
      if (event.unusedClass !== undefined) {
        const guarded = event.unusedClass;
        const pages = await tx.query<{ id: string; draft: unknown; draft_version: unknown }>(
          `SELECT id, draft, draft_version FROM pages WHERE site_id = $1 ORDER BY id FOR UPDATE`,
          [siteId],
        );
        if (guarded.pageContext !== undefined) {
          const origin = pages.rows.find((page) => page.id === guarded.pageContext?.pageId);
          if (origin === undefined) throw new SenifyError("not_found", "Die Editor-Seite gehört nicht zum Projekt", { field: "pageContext.pageId" });
          const currentVersion = toFiniteNumber(origin.draft_version, "draft_version");
          if (currentVersion !== guarded.pageContext.baseDraftVersion) throw draftConflictError(guarded.pageContext.baseDraftVersion, currentVersion);
          guarded.pageDraftVersion = currentVersion + 1;
        }
        for (const page of pages.rows) {
          const draft = toJson<unknown>(page.draft);
          assertDraftShape(draft);
          if (Object.values(draft.nodes).some((node) => node.classes?.includes(guarded.name))) {
            throw new SenifyError("conflict", `Die Klasse "${guarded.name}" wird noch in einem Seitenentwurf verwendet.`, { field: "ruleId", suggestion: "Entferne zuerst alle Zuweisungen." });
          }
        }
        // Reject stale page writes which could otherwise reintroduce the name.
        for (const page of pages.rows) {
          await tx.query(`UPDATE pages SET draft_version = draft_version + 1, updated_at = $2 WHERE id = $1`, [page.id, now]);
        }
      }
      if (event.rename !== undefined) {
        const rename = event.rename;
        const pages = await tx.query<{ id: string; draft: unknown; draft_version: unknown }>(
          `SELECT id, draft, draft_version FROM pages WHERE site_id = $1 ORDER BY id FOR UPDATE`,
          [siteId],
        );
        const origin = rename.pageContext === undefined ? undefined : pages.rows.find((page) => page.id === rename.pageContext?.pageId);
        if (rename.pageContext !== undefined) {
          if (origin === undefined) throw new SenifyError("not_found", "Die Editor-Seite gehört nicht zum Projekt", { field: "pageContext.pageId" });
          const currentVersion = toFiniteNumber(origin.draft_version, "draft_version");
          if (currentVersion !== rename.pageContext.baseDraftVersion) throw draftConflictError(rename.pageContext.baseDraftVersion, currentVersion);
          rename.pageDraftVersion = currentVersion;
        }
        const pagesToWrite: Array<{ id: string; draft: NodeTree; version: number; changed: boolean }> = [];
        for (const page of pages.rows) {
          const draft = structuredClone(toJson<unknown>(page.draft));
          assertDraftShape(draft);
          let changed = false;
          for (const node of Object.values(draft.nodes)) {
            if (node.classes?.includes(rename.to)) {
              throw new SenifyError("conflict", `Der Klassenname "${rename.to}" wird bereits in einem Seitenentwurf verwendet`, { field: "name" });
            }
            if (node.classes === undefined || !node.classes.includes(rename.from)) continue;
            node.classes = [...new Set(node.classes.map((name) => name === rename.from ? rename.to : name))];
            changed = true;
          }
          // Even an untouched draft may be open in an older client that has
          // queued an assignment of the old name. Bumping every page version
          // makes those writes conflict instead of restoring that name.
          pagesToWrite.push({ id: page.id, draft, changed, version: toFiniteNumber(page.draft_version, "draft_version") + 1 });
        }
        for (const page of pagesToWrite) {
          await tx.query(`UPDATE pages SET draft = $2, draft_version = draft_version + 1, updated_at = $3 WHERE id = $1`, [page.id, toJsonParam(page.draft), now]);
          if (page.id === rename.pageContext?.pageId) rename.pageDraftVersion = page.version;
        }
        event.params.renamedPages = pagesToWrite.filter((page) => page.changed).map((page) => page.id);
      }
      const result = await tx.query<{ style_rules_version: unknown }>(
        `UPDATE sites
         SET style_rules_json = $2, style_rules_version = $3, updated_at = $4
         WHERE id = $1 RETURNING style_rules_version`,
        [siteId, toJsonParam(normalized), nextVersion, now],
      );
      if (result.rows.length === 0) {
        throw new SenifyError("not_found", `Site "${siteId}" does not exist`, { field: "siteId" });
      }
      const { text, params } = buildAuditInsert([
        {
          siteId,
          pageId: null,
          batchId: newEntityId(),
          opIndex: 0,
          mutation: event.mutation,
          params: { ...event.params, styleRegistryVersion: nextVersion },
          author: event.author,
          undoPatch: [],
          draftVersionAfter: nextVersion,
        },
      ]);
      await tx.query(text, params);
      return normalized;
    });
  }
}
