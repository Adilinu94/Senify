// Die Komponenten-Werkzeuge der MCP-Fassade (R12).
//
// Die sechs Werkzeuge standen in `tools.ts` und bilden dort einen geschlossenen
// Kreis um eine Sache: Bausteine einer Seite lesen (Liste, Einzelnes) und ihre
// Instanzen aendern (Override, Variante, Version, Nachziehen). Sie sind die
// einzigen Nutzer der Komponenten-Helfer aus `tools-components.ts` - nach
// diesem Block braucht `tools.ts` keinen davon.
//
// Die REIHENFOLGE ist der Vertrag: `server.ts` gibt `TOOLS.map(...)` an den
// Client, und der Manifest-Generator folgt den Spreizungen in `tools.ts`.
// Der Block steht deshalb im neuen Modul in derselben Folge, und `tools.ts`
// setzt ihn an derselben Stelle ein.
//
// `tools-components.ts` bleibt der Lese-Helfer: es kennt Drafts, keine
// Werkzeuge. Die Definitionen wohnen hier, weil eine Beschreibung neben ihrem
// Handler stehen soll - der Manifest-Generator liest beide Dateien als Text.

import { SenifyError } from "@senify/core";
import {
  COMPONENT_DEFINITION_TYPE,
  COMPONENT_INSTANCE_TYPE,
  componentDrift,
  definitionVariants,
  instanceVariants,
} from "@senify/section-sdk";
import type { ToolDefinition } from "./tools.ts";
import {
  componentInstanceList,
  componentName,
  definitionVersion,
  readOverrideBag,
  walkComponent,
} from "./tools-components.ts";
import { objectSchema, pageFor, requireNumber, requireString } from "./tools-support.ts";

/** Die Werkzeuge fuer Komponenten-Definitionen und ihre Instanzen. */
export const COMPONENT_TOOLS: ToolDefinition[] = [
  {
    name: "list_components",
    title: "List components",
    description:
      "Lists the visual components defined on a page (definitions in the page draft) with name, part count, slot names and instance count. Use get_component for part ids, slot ids and instance ids.",
    scope: "read",
    inputSchema: objectSchema({ pageId: { type: "string" } }, ["pageId"]),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const page = await pageFor(context, pageId);
      const components = Object.values(page.draft.nodes)
        .filter((node) => node.type === COMPONENT_DEFINITION_TYPE)
        .map((node) => {
          const { parts, slots } = walkComponent(page.draft, node.id);
          const instances = componentInstanceList(page.draft, node.id);
          const drift = componentDrift(page.draft).filter(
            (entry) => entry.componentId === node.id,
          );
          return {
            id: node.id,
            name: componentName(page.draft, node.id),
            version: definitionVersion(page.draft, node.id),
            parts: parts.length,
            slots: slots.map((slot) => slot.name),
            variants: Object.keys(definitionVariants(node)),
            instances: instances.length,
            outdated: drift.length,
            instanceIds: instances.map((entry) => entry.id),
          };
        });
      return { pageId: page.id, draftVersion: page.draftVersion, components };
    },
  },
  {
    name: "get_component",
    title: "Get component",
    description:
      "Returns one component definition with its parts (id, type, current props - the override keys), its slot placeholders and its instances with their override bags. Use set_component_override to change one instance without touching the definition.",
    scope: "read",
    inputSchema: objectSchema(
      { pageId: { type: "string" }, componentId: { type: "string" } },
      ["pageId", "componentId"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const componentId = requireString(args, "componentId");
      const page = await pageFor(context, pageId);
      const definition = page.draft.nodes[componentId];
      if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
        throw new SenifyError(
          "not_found",
          `Component "${componentId}" is not on the page`,
          {
            field: "componentId",
            suggestion: "List the page's components with list_components.",
          },
        );
      }
      const { parts, slots } = walkComponent(page.draft, componentId);
      return {
        pageId: page.id,
        draftVersion: page.draftVersion,
        id: definition.id,
        name: componentName(page.draft, componentId),
        version: definitionVersion(page.draft, componentId),
        parts,
        slots,
        variants: definitionVariants(definition),
        drift: componentDrift(page.draft).filter(
          (entry) => entry.componentId === componentId,
        ),
        instances: componentInstanceList(page.draft, componentId),
      };
    },
  },
  {
    name: "set_component_override",
    title: "Set component override",
    description:
      "Sets or clears one override of a component instance: the value applies only to this instance, the definition stays untouched. `value: null` clears the key; an empty override bag is removed. Read part ids and instance ids with get_component, then send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        instanceId: { type: "string" },
        partId: { type: "string" },
        key: { type: "string" },
        value: { description: "Any JSON value; null clears the key." },
        baseDraftVersion: { type: "number" },
      },
      ["pageId", "instanceId", "partId", "key", "value", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const instanceId = requireString(args, "instanceId");
      const partId = requireString(args, "partId");
      const key = requireString(args, "key");
      const page = await pageFor(context, pageId);
      const instance = page.draft.nodes[instanceId];
      if (instance === undefined || instance.type !== COMPONENT_INSTANCE_TYPE) {
        throw new SenifyError(
          "not_found",
          `Instance "${instanceId}" is not on the page`,
          {
            field: "instanceId",
            suggestion: "List the component's instances with get_component.",
          },
        );
      }
      const componentId = instance.props["componentId"];
      const definition =
        typeof componentId === "string" ? page.draft.nodes[componentId] : undefined;
      if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
        throw new SenifyError(
          "not_found",
          `Component "${String(componentId)}" is not defined`,
          {
            field: "instanceId",
            suggestion: "The instance points at a definition that is not on the page.",
          },
        );
      }
      const { parts } = walkComponent(page.draft, definition.id);
      if (!parts.some((part) => part.id === partId)) {
        throw new SenifyError(
          "not_found",
          `Component "${componentName(page.draft, definition.id)}" has no part "${partId}"`,
          {
            field: "partId",
            suggestion: `Parts: ${parts.map((part) => part.id).join(", ") || "none"}.`,
          },
        );
      }
      const bag = readOverrideBag(instance.props["overrides"]);
      const part = { ...(bag[partId] ?? {}) };
      const value = args.value;
      if (value === undefined) {
        throw new SenifyError("validation", 'Missing "value"', {
          field: "value",
          suggestion: "Pass a JSON value, or null to clear the key.",
        });
      }
      if (value === null) delete part[key];
      else part[key] = value;
      if (Object.keys(part).length === 0) delete bag[partId];
      else bag[partId] = part;
      const next = Object.keys(bag).length === 0 ? null : bag;
      const name = await context.client.tokenName();
      const response = await context.client.request<Record<string, unknown>>(
        "POST",
        `/api/pages/${pageId}/mutations`,
        {
          baseDraftVersion: requireNumber(args, "baseDraftVersion"),
          author: { kind: "agent", id: name, label: name },
          mutations: [
            { op: "updateNodeProps", id: instanceId, patch: { overrides: next } },
          ],
        },
      );
      return { ...response, overrides: next };
    },
  },
  {
    name: "set_component_variant",
    title: "Set component variant",
    description:
      "Activates or deactivates one variant of a component instance: the definition declares the variants (props overlays on its parts), the instance activates them. Several variants can be active at once; the instance's overrides always win and survive a variant swap. Read the variants and instance ids with get_component, then send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        instanceId: { type: "string" },
        variant: { type: "string" },
        active: { type: "boolean", description: "true activates, false deactivates." },
        baseDraftVersion: { type: "number" },
      },
      ["pageId", "instanceId", "variant", "active", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const instanceId = requireString(args, "instanceId");
      const variant = requireString(args, "variant");
      const page = await pageFor(context, pageId);
      const instance = page.draft.nodes[instanceId];
      if (instance === undefined || instance.type !== COMPONENT_INSTANCE_TYPE) {
        throw new SenifyError(
          "not_found",
          `Instance "${instanceId}" is not on the page`,
          {
            field: "instanceId",
            suggestion: "List the component's instances with get_component.",
          },
        );
      }
      const componentId = instance.props["componentId"];
      const definition =
        typeof componentId === "string" ? page.draft.nodes[componentId] : undefined;
      if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
        throw new SenifyError(
          "not_found",
          `Component "${String(componentId)}" is not defined`,
          {
            field: "instanceId",
            suggestion: "The instance points at a definition that is not on the page.",
          },
        );
      }
      const declared = Object.keys(definitionVariants(definition));
      if (!declared.includes(variant)) {
        throw new SenifyError(
          "not_found",
          `Component "${componentName(page.draft, definition.id)}" has no variant "${variant}"`,
          {
            field: "variant",
            suggestion: `Variants: ${declared.join(", ") || "none"}.`,
          },
        );
      }
      const active = args.active;
      if (typeof active !== "boolean") {
        throw new SenifyError("validation", 'Missing "active"', {
          field: "active",
          suggestion: "Pass true to activate the variant, false to deactivate it.",
        });
      }
      const current = instanceVariants(instance);
      const wanted = active
        ? [...current, variant]
        : current.filter((entry) => entry !== variant);
      const next = declared.filter((name) => wanted.includes(name));
      const name = await context.client.tokenName();
      const response = await context.client.request<Record<string, unknown>>(
        "POST",
        `/api/pages/${pageId}/mutations`,
        {
          baseDraftVersion: requireNumber(args, "baseDraftVersion"),
          author: { kind: "agent", id: name, label: name },
          mutations: [
            {
              op: "updateNodeProps",
              id: instanceId,
              patch: { variants: next.length === 0 ? null : next },
            },
          ],
        },
      );
      return { ...response, variants: next };
    },
  },
  {
    name: "bump_component_version",
    title: "Bump component version",
    description:
      "Raises a component definition's version by one (`props.version`). The instances keep their pin, so the difference shows as drift until update_component_instances pulls them up. Send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        componentId: { type: "string" },
        baseDraftVersion: { type: "number" },
      },
      ["pageId", "componentId", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const componentId = requireString(args, "componentId");
      const page = await pageFor(context, pageId);
      const definition = page.draft.nodes[componentId];
      if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
        throw new SenifyError(
          "not_found",
          `Component "${componentId}" is not on the page`,
          {
            field: "componentId",
            suggestion: "List the page's components with list_components.",
          },
        );
      }
      const version = definitionVersion(page.draft, componentId) + 1;
      const name = await context.client.tokenName();
      const response = await context.client.request<Record<string, unknown>>(
        "POST",
        `/api/pages/${pageId}/mutations`,
        {
          baseDraftVersion: requireNumber(args, "baseDraftVersion"),
          author: { kind: "agent", id: name, label: name },
          mutations: [{ op: "updateNodeProps", id: componentId, patch: { version } }],
        },
      );
      return { ...response, version };
    },
  },
  {
    name: "update_component_instances",
    title: "Update component instances",
    description:
      "Pulls every instance of a definition up to its current version in one batch (one undo). Instances that are already current stay untouched. Read versions and drift with get_component, then send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        componentId: { type: "string" },
        baseDraftVersion: { type: "number" },
      },
      ["pageId", "componentId", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const componentId = requireString(args, "componentId");
      const page = await pageFor(context, pageId);
      const definition = page.draft.nodes[componentId];
      if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
        throw new SenifyError(
          "not_found",
          `Component "${componentId}" is not on the page`,
          {
            field: "componentId",
            suggestion: "List the page's components with list_components.",
          },
        );
      }
      const version = definitionVersion(page.draft, componentId);
      const stale = componentDrift(page.draft).filter(
        (entry) => entry.componentId === componentId,
      );
      if (stale.length === 0) {
        return {
          pageId: page.id,
          draftVersion: page.draftVersion,
          version,
          updated: 0,
        };
      }
      const name = await context.client.tokenName();
      const response = await context.client.request<Record<string, unknown>>(
        "POST",
        `/api/pages/${pageId}/mutations`,
        {
          baseDraftVersion: requireNumber(args, "baseDraftVersion"),
          author: { kind: "agent", id: name, label: name },
          mutations: stale.map((entry) => ({
            op: "updateNodeProps",
            id: entry.instanceId,
            patch: { componentVersion: version },
          })),
        },
      );
      return { ...response, version, updated: stale.length };
    },
  },
];
