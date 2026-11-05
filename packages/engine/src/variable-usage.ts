import { SenifyError } from "@senify/core";
import type { Store } from "./store.ts";

type VariableFamily = "color" | "spacing";

export function variableReference(family: string, name: string): { group: VariableFamily; ref: string; cssVariable: string } {
  if ((family !== "color" && family !== "spacing") || !/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new SenifyError("validation", "Ungültige Variable", { field: "variable" });
  }
  const group = family as VariableFamily;
  return { group, ref: `${group}.${name}`, cssVariable: `--${group === "color" ? "color" : "space"}-${name}` };
}

// These are direct, recognizable references in saved data, not a dependency
// graph for arbitrary code, external components or dynamically built CSS.
export function referencePaths(value: unknown, ref: string, cssVariable: string): string[] {
  const paths: string[] = [];
  const cssReference = new RegExp(`[vV][aA][rR]\\(\\s*${cssVariable}(?=\\s|,|\\))`);
  const visit = (item: unknown, path: string): void => {
    if (typeof item === "string") {
      if (cssReference.test(item)) paths.push(path);
      return;
    }
    if (item === null || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      const next = path ? `${path}.${key}` : key;
      if ((key === "$token" || key === "$ref") && child === ref) paths.push(next);
      else visit(child, next);
    }
  };
  visit(value, "");
  return paths;
}

// Rewrites the same direct reference forms that usage detection recognizes.
// Object keys and unrelated token names are left untouched.
export function renameVariableReferences<T>(value: T, family: string, oldName: string, newName: string): T {
  const before = variableReference(family, oldName);
  const after = variableReference(family, newName);
  const cssReference = new RegExp(`([vV][aA][rR]\\(\\s*)${before.cssVariable}(?=\\s|,|\\))`, "g");
  const visit = (item: unknown): unknown => {
    if (typeof item === "string") return item.replace(cssReference, (_match, prefix: string) => `${prefix}${after.cssVariable}`);
    if (item === null || typeof item !== "object") return item;
    if (Array.isArray(item)) return item.map(visit);
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [key,
      (key === "$token" || key === "$ref") && child === before.ref ? after.ref : visit(child),
    ]));
  };
  return visit(value) as T;
}

export async function getVariableUsage(store: Store, siteId: string, family: string, name: string) {
  const { group, ref, cssVariable } = variableReference(family, name);
  const [theme, registry, drafts] = await Promise.all([
    store.getTheme(siteId), store.getStyleRegistry(siteId), store.listPageDrafts(siteId),
  ]);
  const variables = theme.theme.tokens.primitive?.[group];
  if (!variables || typeof variables !== "object" || Array.isArray(variables) || !Object.hasOwn(variables, name)) {
    throw new SenifyError("not_found", "Die Variable existiert nicht", { field: "name" });
  }
  const pages = drafts.flatMap((page) => {
    const nodes = Object.values(page.draft.nodes).flatMap((node) => {
      const paths = referencePaths(node, ref, cssVariable);
      return paths.length ? [{ nodeId: node.id, paths }] : [];
    });
    return nodes.length ? [{ pageId: page.id, pagePath: page.path, nodes }] : [];
  });
  const rules = registry.rules.flatMap((rule) => {
    const paths = referencePaths(rule, ref, cssVariable);
    return paths.length ? [{ ruleId: rule.id, name: rule.name, paths }] : [];
  });
  return { ref, pages, rules, themePaths: referencePaths(theme.theme, ref, cssVariable) };
}
