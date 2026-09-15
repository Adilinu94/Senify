import { TypeCompiler } from "@sinclair/typebox/compiler";
import { SenifyError } from "@senify/core";
import {
  SectionDefinitionSchema,
  type PropSpec,
  type SectionDefinition,
} from "./schema.ts";
import type { GoldenNode, PropValue } from "./types.ts";

export type ValidationIssue = {
  path: string;
  message: string;
  suggestion?: string;
};

const sectionCompiler = TypeCompiler.Compile(SectionDefinitionSchema);
const propCompilerCache = new WeakMap<object, ReturnType<typeof TypeCompiler.Compile>>();

function checkPropValue(spec: PropSpec, value: PropValue): boolean {
  if (!spec.schema) return true;
  let compiler = propCompilerCache.get(spec.schema);
  if (!compiler) {
    compiler = TypeCompiler.Compile(spec.schema);
    propCompilerCache.set(spec.schema, compiler);
  }
  return compiler.Check(value);
}

export function validateDefinition(
  definition: SectionDefinition,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const valid: boolean = sectionCompiler.Check(definition);
  if (!valid) {
    for (const error of sectionCompiler.Errors(definition)) {
      issues.push({
        path: `section(${definition.type ?? "?"})${error.path}`,
        message: error.message,
      });
    }
    return issues;
  }
  const seen = new Set<string>();
  for (const spec of [...definition.props, ...(definition.styleProps ?? [])]) {
    if (seen.has(spec.key)) {
      issues.push({
        path: `section(${definition.type}).props.${spec.key}`,
        message: `Duplicate prop key "${spec.key}"`,
      });
    }
    seen.add(spec.key);
  }
  return issues;
}

export class Registry {
  readonly #sections = new Map<string, SectionDefinition>();

  register(definition: SectionDefinition): void {
    const definitionIssues = validateDefinition(definition);
    if (definitionIssues.length > 0) {
      throw new SenifyError(
        "validation",
        `Invalid section definition "${definition.type}": ${definitionIssues[0]?.message ?? "unknown error"}`,
        { field: definitionIssues[0]?.path },
      );
    }
    if (this.#sections.has(definition.type)) {
      throw new SenifyError(
        "conflict",
        `Section type "${definition.type}" is already registered`,
      );
    }

    const goldenIssues = this.validateGoldenTree(
      definition,
      definition.golden.tree,
      "golden.tree",
    );
    if (goldenIssues.length > 0) {
      throw new SenifyError(
        "validation",
        `Golden example for "${definition.type}" is invalid: ${goldenIssues[0]?.message ?? "unknown error"}`,
        { field: goldenIssues[0]?.path },
      );
    }

    this.#sections.set(definition.type, definition);
  }

  has(type: string): boolean {
    return this.#sections.has(type);
  }

  get(type: string): SectionDefinition {
    const definition = this.#sections.get(type);
    if (!definition) {
      throw new SenifyError("not_found", `Unknown section type "${type}"`, {
        suggestion:
          "Check the section type against the registry (list_sections) or register the section first.",
        field: "type",
      });
    }
    return definition;
  }

  list(): SectionDefinition[] {
    return [...this.#sections.values()];
  }

  validateGoldenTree(
    definition: SectionDefinition,
    tree: GoldenNode,
    basePath = "tree",
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (tree.type !== definition.type) {
      issues.push({
        path: `${basePath}.type`,
        message: `Golden root type "${tree.type}" does not match section "${definition.type}"`,
      });
    }

    const props = new Map(definition.props.map((p) => [p.key, p]));
    const styleProps = new Map(
      (definition.styleProps ?? []).map((p) => [p.key, p]),
    );
    for (const [key, value] of Object.entries(tree.props)) {
      const spec = props.get(key) ?? styleProps.get(key);
      if (!spec) {
        issues.push({
          path: `${basePath}.props.${key}`,
          message: `Unknown prop "${key}" for section "${definition.type}"`,
          suggestion: `Allowed props: ${[...props.keys()].join(", ") || "none"}`,
        });
        continue;
      }
      if (!checkPropValue(spec, value)) {
        issues.push({
          path: `${basePath}.props.${key}`,
          message: `Value for prop "${key}" does not match its schema`,
        });
      }
    }

    const children = tree.children ?? [];
    const allowed = definition.allowedChildren;
    if (children.length > 0) {
      if (allowed === undefined || allowed === "none") {
        issues.push({
          path: `${basePath}.children`,
          message: `Section "${definition.type}" does not allow children`,
        });
      } else {
        children.forEach((child, index) => {
          if (!allowed.includes(child.type)) {
            issues.push({
              path: `${basePath}.children[${index}].type`,
              message: `Section "${definition.type}" does not allow child "${child.type}"`,
              suggestion: `Allowed children: ${allowed.join(", ")}`,
            });
            return;
          }
          if (!this.has(child.type)) {
            issues.push({
              path: `${basePath}.children[${index}].type`,
              message: `Child section "${child.type}" is not registered`,
            });
            return;
          }
          issues.push(
            ...this.validateGoldenTree(
              this.get(child.type),
              child,
              `${basePath}.children[${index}]`,
            ),
          );
        });
      }
    }

    return issues;
  }
}
