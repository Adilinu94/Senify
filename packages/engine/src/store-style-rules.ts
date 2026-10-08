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
import type { Author } from "@senify/section-sdk";
import { agentStyleViolations, rawCssViolations, styleRuleBags, type StyleBag } from "./style-fence.ts";
import { newEntityId } from "./ids.ts";
import { buildAuditInsert } from "./store-audit.ts";
import { toFiniteNumber, toJson, toJsonParam } from "./store-row-utils.ts";
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
};

// The write event the audit records: what changed, not the whole array.
type StyleRuleWriteEvent = {
  mutation: string;
  params: Record<string, unknown>;
  author: Author;
  baseVersion?: number;
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
function assertClassNameFree(
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
  stylePriorities?: Record<string, "important">;
  states?: Record<string, Record<string, unknown>>;
  statePriorities?: Record<string, Record<string, "important">>;
  contextStyles?: Record<string, Record<string, unknown>>;
  contextStylePriorities?: Record<string, Record<string, "important">>;
  rawCss?: string | null;
  baseVersion?: number;
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
    const existing = await this.readRules(siteId);
    const appended = rules.map((rule, index) => {
      const ordered: StyleRule = { ...rule, order: existing.length + index };
      assertWritableRule(ordered, `rules[${index}]`);
      return ordered;
    });
    return this.#write(siteId, [...existing, ...appended], {
      mutation: "importFramerStyleRules",
      params: { count: appended.length },
      author,
      ...(baseVersion === undefined ? {} : { baseVersion }),
    });
  }

  async createStyleRule(
    siteId: string,
    input: CreateStyleRuleInput,
    author: Author,
  ): Promise<StyleRule> {
    const rules = await this.readRules(siteId);
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
      ...(input.baseVersion === undefined ? {} : { baseVersion: input.baseVersion }),
    });
    return written.find((entry) => entry.id === rule.id) ?? rule;
  }

  async updateStyleRule(
    siteId: string,
    ruleId: string,
    patch: StyleRuleUpdatePatch,
    author: Author,
  ): Promise<StyleRule> {
    const rules = await this.readRules(siteId);
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
      });
    }
    const current = rules[index]!;
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
      next.styles = { ...next.styles, ...(patch.styles as StyleRule["styles"]) };
    }
    if (patch.contextStyles !== undefined) {
      next.contextStyles = {
        ...next.contextStyles,
        ...(patch.contextStyles as StyleRule["contextStyles"]),
      };
    }
    if (patch.states !== undefined) {
      const states: NonNullable<StyleRule["states"]> = { ...next.states };
      for (const state of STATE_ORDER) {
        const bag = patch.states[state];
        if (bag !== undefined) states[state] = { ...(bag as StyleRule["styles"]) };
      }
      next.states = states;
    }
    if (patch.stylePriorities !== undefined) {
      next.stylePriorities = { ...next.stylePriorities, ...patch.stylePriorities };
    }
    if (patch.statePriorities !== undefined) {
      const statePriorities: NonNullable<StyleRule["statePriorities"]> = {
        ...next.statePriorities,
      };
      for (const state of STATE_ORDER) {
        const priority = patch.statePriorities[state];
        if (priority !== undefined) statePriorities[state] = { ...priority };
      }
      next.statePriorities = statePriorities;
    }
    if (patch.contextStylePriorities !== undefined) {
      next.contextStylePriorities = {
        ...next.contextStylePriorities,
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
      if (patch.states !== undefined) {
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
    const written = await this.#write(siteId, result, {
      mutation: "update_style_rule",
      params: { ruleId, patch: Object.keys(patch) },
      author,
      ...(patch.baseVersion === undefined ? {} : { baseVersion: patch.baseVersion }),
    });
    return written[index] ?? next;
  }

  async deleteStyleRule(
    siteId: string,
    ruleId: string,
    author: Author,
    baseVersion?: number,
  ): Promise<void> {
    const rules = await this.readRules(siteId);
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
      });
    }
    const next = rules.filter((rule) => rule.id !== ruleId);
    await this.#write(siteId, next, {
      mutation: "delete_style_rule",
      params: { ruleId, name: rules[index]!.name, kind: rules[index]!.kind },
      author,
      ...(baseVersion === undefined ? {} : { baseVersion }),
    });
  }

  // Reorder is a permutation of the array; `order` is normalized to the array
  // position afterwards, so a stale number can never win over it.
  async reorderStyleRule(
    siteId: string,
    ruleId: string,
    toIndex: number,
    author: Author,
    baseVersion?: number,
  ): Promise<StyleRule[]> {
    const rules = await this.readRules(siteId);
    const from = rules.findIndex((rule) => rule.id === ruleId);
    if (from < 0) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
      });
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
    if (from === toIndex) return rules;

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
      ...(baseVersion === undefined ? {} : { baseVersion }),
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
        throw new SenifyError("conflict", "Die Style-Registry wurde zwischenzeitlich geändert", {
          field: "baseVersion",
          suggestion: "Lade die Style-Registry neu und sende den Write erneut.",
        });
      }
      const nextVersion = version + 1;
      const now = new Date().toISOString();
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
