// Inspector DOM (ticket 02, slice 1).
//
// Renders the model of `model.ts` with the field family of `styles.ts` and
// writes every change through the store's single gate (`setNodeProp`,
// `clearNodeProp`, `setNodeHiddenDevices`, `setNodeMeta`, `setMotion`). The
// inspector is a projection of the session: it reads the selection and the
// document from the store and re-renders on every store event, so canvas and
// panel can never drift apart.
//
// One undo step per interaction: a typing burst on one property folds through
// `typingCoalesceKey`, a slider drag through the same key (the store's burst
// folding), a switch or select is one step by itself.

import { isGapsValue, isSpacingValue, type Device, type GapsValue, type PropValue, type SpacingValue, type Unit } from "@senify/widget-engine";
import type { MotionProfile, MotionSpec } from "@senify/section-sdk";
import type { Theme } from "@senify/tokens";
import { requireDocument, type DomDocument, type DomElement } from "../dom.ts";
import { EditorStore, typingCoalesceKey } from "../state/store.ts";
import { EDITOR_ROOT_ATTRIBUTE } from "../ui/tokens.ts";
import {
  buildInspector,
  motionSpecFrom,
  numberPart,
  tokenRefOf,
  unitOfValue,
  type InspectorField,
  type InspectorModel,
  type InspectorTabId,
} from "./model.ts";
import { ensureInspectorStyles } from "./styles.ts";

export type InspectorOptions = {
  host: DomElement;
  store: EditorStore;
  theme?: Theme;
  profile?: MotionProfile;
  breakpoint?: Device;
  onMessage?: (message: string | null) => void;
  // View changes the session persists (E5, slice 1).
  onTabChange?: (tab: InspectorTabId) => void;
  onBreakpointChange?: (device: Device) => void;
};

export type InspectorInstance = {
  element: DomElement;
  refresh(): void;
  breakpoint(): Device;
  setBreakpoint(device: Device): void;
  tab(): InspectorTabId;
  setTab(tab: InspectorTabId): void;
  profile(): MotionProfile;
  setProfile(profile: MotionProfile): void;
  destroy(): void;
};

type ElementSpec = {
  className?: string;
  text?: string;
  value?: string;
  data?: Record<string, string>;
  attributes?: Record<string, string>;
};

function h(doc: DomDocument, tag: string, spec: ElementSpec = {}): DomElement {
  const element = doc.createElement(tag);
  if (spec.className !== undefined) element.className = spec.className;
  if (spec.text !== undefined) element.textContent = spec.text;
  if (spec.value !== undefined) element.value = spec.value;
  for (const [name, value] of Object.entries(spec.data ?? {})) {
    element.setAttribute(`data-${name}`, value);
  }
  for (const [name, value] of Object.entries(spec.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
}

function icon(doc: DomDocument, name: string, size = 12, extra?: string): DomElement {
  return h(doc, "span", {
    className: `ic ic--${name} ic--${size}${extra === undefined ? "" : ` ${extra}`}`,
  });
}

const MESSAGES: Record<string, string> = {
  validation: "Eingabe nicht übernommen",
  not_found: "Knoten nicht gefunden",
};

function messageOf(error: unknown): string {
  if (error !== null && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }
  return "Änderung fehlgeschlagen";
}

export function createInspector(options: InspectorOptions): InspectorInstance {
  const doc = requireDocument();
  ensureInspectorStyles(doc);
  const root = h(doc, "section", { className: "senify-inspector" });
  root.setAttribute(EDITOR_ROOT_ATTRIBUTE, "true");
  root.setAttribute("aria-label", "Inspektor");
  let activeTab: InspectorTabId = "content";
  let breakpoint: Device = options.breakpoint ?? "desktop";
  let profile: MotionProfile = options.profile ?? "standard";
  const collapsed = new Set<string>();
  let paletteOpen = false;
  let unsubscribe: (() => void) | null = null;

  const report = (message: string | null): void => {
    options.onMessage?.(message);
  };

  function selectedId(): string | null {
    return options.store.selection.focus ?? options.store.selection.selected[0] ?? null;
  }

  function apply(mutation: unknown, label: string, coalesceKey?: string): boolean {
    try {
      options.store.apply(mutation, {
        label,
        ...(coalesceKey === undefined ? {} : { coalesceKey }),
      });
      report(null);
      return true;
    } catch (error) {
      const category =
        error !== null && typeof error === "object" && "category" in error
          ? String((error as { category: unknown }).category)
          : "";
      report(MESSAGES[category] ?? messageOf(error));
      return false;
    }
  }

  function commitProp(nodeId: string, field: InspectorField, value: PropValue): void {
    apply(
      { op: "setNodeProp", id: nodeId, key: field.key, value, device: breakpoint },
      `Feld ${field.key}`,
      typingCoalesceKey(nodeId, field.key, breakpoint),
    );
  }

  function clearProp(nodeId: string, field: InspectorField): void {
    apply(
      { op: "clearNodeProp", id: nodeId, key: field.key, device: breakpoint },
      `Override zurücksetzen · ${field.key}`,
    );
  }

  /* ------------------------------------------------------------ field family */

  function renderNumber(
    nodeId: string,
    field: InspectorField,
    control: DomElement,
  ): void {
    const wrap = h(doc, "div", { className: "ed-field" });
    const input = h(doc, "input", { data: { control: "number" } });
    input.setAttribute("type", "number");
    const shown = numberPart(field.value);
    input.value = shown === undefined ? "" : String(shown);
    if (field.min !== undefined) input.setAttribute("min", String(field.min));
    if (field.max !== undefined) input.setAttribute("max", String(field.max));
    if (field.step !== undefined) input.setAttribute("step", String(field.step));
    const commitNumber = (): void => {
      const next = numberPart(input.value);
      if (next === undefined) {
        input.value = shown === undefined ? "" : String(shown);
        return;
      }
      const unit = unitOfValue(field.value, field.units);
      const value: PropValue =
        field.units !== undefined && field.units.length > 0 && unit !== field.units[0]
          ? `${next}${unit}`
          : next;
      commitProp(nodeId, field, value);
    };
    input.addEventListener("change", commitNumber);
    const step = field.step ?? 1;
    const stepBy = (factor: number): void => {
      const base = numberPart(input.value) ?? numberPart(field.value) ?? 0;
      let next = base + step * factor;
      if (field.min !== undefined) next = Math.max(field.min, next);
      if (field.max !== undefined) next = Math.min(field.max, next);
      input.value = String(next);
      commitNumber();
    };
    const stepper = h(doc, "span", { className: "ed-stepper" });
    const up = h(doc, "button", { attributes: { type: "button", "aria-label": "Erhöhen" } });
    const upIcon = icon(doc, "down", 10);
    upIcon.style.transform = "rotate(180deg)";
    up.appendChild(upIcon);
    const down = h(doc, "button", { attributes: { type: "button", "aria-label": "Verringern" } });
    down.appendChild(icon(doc, "down", 10));
    up.addEventListener("click", (event) => stepBy((event.shiftKey ?? false) ? 10 : 1));
    down.addEventListener("click", (event) => stepBy((event.shiftKey ?? false) ? -10 : -1));
    stepper.appendChild(up);
    stepper.appendChild(down);
    wrap.appendChild(input);
    wrap.appendChild(stepper);
    control.appendChild(wrap);
    if (field.units !== undefined && field.units.length > 1) {
      control.appendChild(renderUnitSelect(nodeId, field));
    }
  }

  function renderUnitSelect(nodeId: string, field: InspectorField): DomElement {
    const wrap = h(doc, "div", { className: "ed-field", data: { control: "unit" } });
    const select = h(doc, "select", { attributes: { "aria-label": "Einheit" } });
    const current = unitOfValue(field.value, field.units);
    for (const unit of field.units ?? []) {
      const option = h(doc, "option", { text: unit, value: unit });
      if (unit === current) option.setAttribute("selected", "selected");
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      const next = select.value ?? current ?? field.units?.[0] ?? "px";
      const number = numberPart(field.value) ?? 0;
      commitProp(nodeId, field, `${number}${next}`);
    });
    wrap.appendChild(select);
    return wrap;
  }

  function renderSlider(nodeId: string, field: InspectorField, control: DomElement): void {
    const wrap = h(doc, "div", { className: "ed-slider" });
    const range = h(doc, "input", { data: { control: "range" } });
    range.setAttribute("type", "range");
    const value = numberPart(field.value) ?? field.min ?? 0;
    range.setAttribute("min", String(field.min ?? 0));
    range.setAttribute("max", String(field.max ?? 100));
    range.setAttribute("step", String(field.step ?? 1));
    range.value = String(value);
    const number = h(doc, "div", { className: "ed-field ed-field--value", data: { control: "number" } });
    const input = h(doc, "input");
    input.setAttribute("type", "number");
    input.value = String(value);
    const commit = (raw: number): void => {
      const unit = unitOfValue(field.value, field.units);
      const next: PropValue =
        field.units !== undefined && field.units.length > 0 && unit !== field.units[0]
          ? `${raw}${unit}`
          : raw;
      commitProp(nodeId, field, next);
    };
    range.addEventListener("input", () => {
      const next = numberPart(range.value) ?? value;
      input.value = String(next);
      commit(next);
    });
    input.addEventListener("change", () => {
      const next = numberPart(input.value) ?? value;
      range.value = String(next);
      commit(next);
    });
    number.appendChild(input);
    if (field.units !== undefined && field.units.length === 1) {
      number.appendChild(h(doc, "span", { className: "ed-field__unit", text: field.units[0] ?? "" }));
    }
    wrap.appendChild(range);
    wrap.appendChild(number);
    control.appendChild(wrap);
  }

  function renderSwitcher(
    field: InspectorField,
    control: DomElement,
    onToggle: () => void,
  ): void {
    const button = h(doc, "button", {
      className: "ed-switch",
      data: { control: "switch" },
      attributes: {
        type: "button",
        role: "switch",
        "aria-checked": String(field.value === true),
      },
    });
    const track = h(doc, "span", { className: "ed-switch__track" });
    track.appendChild(h(doc, "span", { className: "ed-switch__knob" }));
    button.appendChild(track);
    button.addEventListener("click", onToggle);
    control.appendChild(button);
  }

  function renderSelect(
    field: InspectorField,
    control: DomElement,
    onSelect: (value: string) => void,
  ): void {
    const wrap = h(doc, "div", { className: "ed-field" });
    const select = h(doc, "select", { data: { control: "select" } });
    const options = field.options ?? [];
    const known = options.some((option) => option.value === field.value);
    if (!known && typeof field.value === "string") {
      select.appendChild(
        h(doc, "option", { text: `${field.value} (unbekannt)`, value: field.value }),
      );
    }
    for (const option of options) {
      const entry = h(doc, "option", { text: option.label, value: option.value });
      if (option.value === field.value) entry.setAttribute("selected", "selected");
      select.appendChild(entry);
    }
    select.addEventListener("change", () => onSelect(select.value ?? ""));
    wrap.appendChild(select);
    control.appendChild(wrap);
  }

  function renderText(nodeId: string, field: InspectorField, control: DomElement): void {
    const wrap = h(doc, "div", { className: "ed-field" });
    const tag = field.kind === "textarea" ? "textarea" : "input";
    const input = h(doc, tag, { data: { control: field.kind } });
    if (tag === "input") {
      input.setAttribute("type", "text");
    }
    input.value = typeof field.value === "string" ? field.value : "";
    input.addEventListener("change", () => {
      commitProp(nodeId, field, input.value ?? "");
    });
    wrap.appendChild(input);
    control.appendChild(wrap);
  }

  function colorCss(field: InspectorField): string {
    const value = field.value;
    if (typeof value === "string") return value;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, PropValue>;
      const color = typeof record["color"] === "string" ? record["color"] : "";
      const alpha = typeof record["alpha"] === "number" ? record["alpha"] : 1;
      if (color !== "") return alpha < 1 ? `${color}` : color;
    }
    return "transparent";
  }

  function resolvedTokenColor(field: InspectorField): string | undefined {
    const ref = tokenRefOf(field.value);
    if (ref === null) return undefined;
    return field.tokenOptions?.find((option) => option.ref === ref)?.value;
  }

  function renderColor(nodeId: string, field: InspectorField, control: DomElement): void {
    const ref = tokenRefOf(field.value);
    const literal = typeof field.value === "string" ? field.value : "";
    const row = h(doc, "div", { className: "ed-color" });
    const line = h(doc, "div", { className: "ed-color__row" });
    const swatch = h(doc, "span", {
      className: "ed-swatch",
      data: { control: "swatch" },
      attributes: { style: `background:${colorCss(field)}` },
    });
    line.appendChild(swatch);
    const fieldWrap = h(doc, "div", { className: "ed-field" });
    const input = h(doc, "input", { data: { control: "color-text" } });
    input.value = ref === null ? literal : `{${ref}}`;
    input.addEventListener("change", () => {
      const next = (input.value ?? "").trim();
      if (next.startsWith("{") && next.endsWith("}")) {
        commitProp(nodeId, field, { $token: next.slice(1, -1) });
      } else {
        commitProp(nodeId, field, next);
      }
    });
    fieldWrap.appendChild(input);
    const toggle = h(doc, "button", {
      className: "ed-linkbtn",
      data: { control: "color-palette" },
      attributes: { type: "button", "aria-label": "Palette öffnen", "aria-expanded": String(paletteOpen) },
    });
    toggle.appendChild(icon(doc, "palette", 12));
    toggle.addEventListener("click", () => {
      paletteOpen = !paletteOpen;
      render();
    });
    fieldWrap.appendChild(toggle);
    line.appendChild(fieldWrap);
    row.appendChild(line);
    if (paletteOpen) {
      row.appendChild(renderPalette(nodeId, field));
    }
    control.appendChild(row);
  }

  function renderPalette(nodeId: string, field: InspectorField): DomElement {
    const panel = h(doc, "div", { className: "ed-color__panel", data: { role: "palette" } });
    const options = field.tokenOptions ?? [];
    const ref = tokenRefOf(field.value);
    const palette = h(doc, "div", { className: "ed-color__palette" });
    for (const option of options) {
      const tile = h(doc, "button", {
        className: "ed-color__tile",
        data: { token: String(option.ref === ref), ref: option.ref },
        attributes: {
          type: "button",
          title: `${option.label} · ${option.value} (Alt-Klick: Token)`,
          style: `background:${option.value}`,
        },
      });
      tile.addEventListener("click", (event) => {
        if (event.altKey === true) {
          commitProp(nodeId, field, { $token: option.ref });
        } else {
          commitProp(nodeId, field, option.value);
        }
        paletteOpen = false;
        render();
      });
      palette.appendChild(tile);
    }
    panel.appendChild(palette);
    const meta = h(doc, "div", { className: "ed-color__meta" });
    meta.appendChild(
      h(doc, "span", {
        className: "ed-color__token-name",
        text: ref === null ? "Eigener Wert" : `Token: ${ref}`,
      }),
    );
    if (ref !== null) {
      const resolved = resolvedTokenColor(field);
      meta.appendChild(
        h(doc, "span", { className: "ed-field__unit", text: resolved ?? "" }),
      );
      const back = h(doc, "button", {
        className: "senify-inspector__reset",
        text: "Literal",
        data: { action: "color-literal" },
        attributes: { type: "button" },
      });
      back.addEventListener("click", () => {
        commitProp(nodeId, field, resolved ?? "#000000");
        paletteOpen = false;
        render();
      });
      meta.appendChild(back);
    }
    panel.appendChild(meta);
    return panel;
  }

  function spacingParts(value: PropValue | undefined): { parts: string[]; linked: boolean; unit: Unit } {
    if (value !== undefined && isSpacingValue(value)) {
      return {
        parts: [value.top, value.right, value.bottom, value.left],
        linked: value.isLinked,
        unit: value.unit,
      };
    }
    return { parts: ["", "", "", ""], linked: true, unit: "rem" };
  }

  function renderDimensions(nodeId: string, field: InspectorField, control: DomElement): void {
    const { parts, linked, unit } = spacingParts(field.value);
    const edges = ["top", "right", "bottom", "left"] as const;
    const icons = ["edge-t", "edge-r", "edge-b", "edge-l"] as const;
    const wrap = h(doc, "div", { className: "ed-fourow" });
    const inputs: DomElement[] = [];
    const commit = (): void => {
      const next: SpacingValue = {
        top: inputs[0]?.value ?? "0",
        right: inputs[1]?.value ?? "0",
        bottom: inputs[2]?.value ?? "0",
        left: inputs[3]?.value ?? "0",
        isLinked: linked,
        unit,
      };
      commitProp(nodeId, field, next);
    };
    edges.forEach((edge, index) => {
      const cell = h(doc, "div", { className: "ed-divfield", data: { edge } });
      cell.appendChild(icon(doc, icons[index] ?? "edge-t", 12));
      const input = h(doc, "input", { data: { control: "edge" } });
      input.value = parts[index] ?? "";
      input.addEventListener("change", () => {
        if (linked) {
          for (const other of inputs) other.value = input.value ?? "";
        }
        commit();
      });
      inputs.push(input);
      cell.appendChild(input);
      wrap.appendChild(cell);
    });
    const link = h(doc, "button", {
      className: "ed-linkbtn",
      data: { control: "link" },
      attributes: {
        type: "button",
        "aria-pressed": String(linked),
        title: linked ? "Kanten lösen" : "Kanten verketten",
      },
    });
    link.appendChild(icon(doc, "link", 12));
    link.addEventListener("click", () => {
      const current = spacingParts(field.value);
      const next: SpacingValue = {
        top: inputs[0]?.value ?? current.parts[0] ?? "0",
        right: inputs[1]?.value ?? current.parts[1] ?? "0",
        bottom: inputs[2]?.value ?? current.parts[2] ?? "0",
        left: inputs[3]?.value ?? current.parts[3] ?? "0",
        isLinked: !linked,
        unit,
      };
      commitProp(nodeId, field, next);
    });
    control.appendChild(wrap);
    control.appendChild(link);
  }

  function renderGaps(nodeId: string, field: InspectorField, control: DomElement): void {
    const value = field.value !== undefined && isGapsValue(field.value) ? field.value : undefined;
    const parts = [value?.row ?? "", value?.column ?? ""];
    const unit = value?.unit ?? "rem";
    const linked = value?.isLinked ?? true;
    const wrap = h(doc, "div", { className: "ed-fourow", data: { role: "gaps" } });
    const inputs: DomElement[] = [];
    const commit = (): void => {
      const next: GapsValue = {
        row: inputs[0]?.value ?? "0",
        column: inputs[1]?.value ?? "0",
        isLinked: linked,
        unit,
      };
      commitProp(nodeId, field, next);
    };
    ["row", "column"].forEach((part, index) => {
      const cell = h(doc, "div", { className: "ed-divfield", data: { part } });
      const input = h(doc, "input", { data: { control: "gap" } });
      input.value = parts[index] ?? "";
      input.addEventListener("change", () => {
        if (linked) {
          for (const other of inputs) other.value = input.value ?? "";
        }
        commit();
      });
      inputs.push(input);
      cell.appendChild(input);
      wrap.appendChild(cell);
    });
    const link = h(doc, "button", {
      className: "ed-linkbtn",
      data: { control: "link" },
      attributes: { type: "button", "aria-pressed": String(linked), title: "Werte verketten" },
    });
    link.appendChild(icon(doc, "link", 12));
    link.addEventListener("click", () => {
      const next: GapsValue = {
        row: inputs[0]?.value ?? "0",
        column: inputs[1]?.value ?? "0",
        isLinked: !linked,
        unit,
      };
      commitProp(nodeId, field, next);
    });
    control.appendChild(wrap);
    control.appendChild(link);
  }

  /* --------------------------------------------------------------- motion */

  function commitMotion(nodeId: string, preset: string, field?: InspectorField, value?: PropValue): void {
    const node = options.store.document.nodes[nodeId];
    if (node === undefined) return;
    const values: Record<string, PropValue> = {};
    for (const entry of motionModel()?.fields ?? []) {
      values[entry.key] = entry.value ?? null;
    }
    if (field !== undefined && value !== undefined) values[field.key] = value;
    const spec: MotionSpec = motionSpecFrom(preset, values, node.motion);
    apply({ op: "setMotion", id: nodeId, spec }, "Motion ändern");
  }

  let currentModel: InspectorModel | null = null;

  function motionModel(): InspectorModel["motion"] | null {
    return currentModel?.motion ?? null;
  }

  /* ------------------------------------------------------------- structure */

  function renderFieldRow(model: InspectorModel, field: InspectorField): DomElement {
    const nodeId = model.nodeId;
    const row = h(doc, "div", {
      className: "senify-inspector__field",
      data: { key: field.key, kind: field.kind },
    });
    row.appendChild(
      h(doc, "span", { className: "senify-inspector__field-label", text: field.label }),
    );
    const control = h(doc, "div", { className: "senify-inspector__field-control" });
    const side = h(doc, "div", { className: "senify-inspector__field-side" });
    switch (field.kind) {
      case "number":
        renderNumber(nodeId, field, control);
        break;
      case "slider":
        renderSlider(nodeId, field, control);
        break;
      case "switcher":
        renderSwitcher(field, control, () => {
          if (field.commit.kind === "hidden") {
            const node = options.store.document.nodes[nodeId];
            const devices = new Set(node?.hiddenDevices ?? []);
            if (devices.has(field.commit.device)) devices.delete(field.commit.device);
            else devices.add(field.commit.device);
            apply(
              { op: "setNodeHiddenDevices", id: nodeId, devices: [...devices] },
              "Sichtbarkeit ändern",
            );
            return;
          }
          if (field.commit.kind === "locked") {
            apply(
              { op: "setNodeMeta", id: nodeId, meta: { locked: field.value !== true } },
              "Sperre ändern",
            );
            return;
          }
          if (field.commit.kind === "motion") {
            const preset = motionModel()?.preset ?? field.value;
            if (typeof preset === "string" && preset !== "") {
              commitMotion(nodeId, preset, field, field.value !== true);
            }
            return;
          }
          commitProp(nodeId, field, field.value !== true);
        });
        break;
      case "select":
        renderSelect(field, control, (value) => {
          if (field.commit.kind === "motion") {
            const preset = field.key === "preset" ? value : (motionModel()?.preset ?? "");
            if (preset !== "") commitMotion(nodeId, preset, field, value);
            return;
          }
          commitProp(nodeId, field, value);
        });
        break;
      case "color":
        renderColor(nodeId, field, control);
        break;
      case "dimensions":
        renderDimensions(nodeId, field, control);
        break;
      case "gaps":
        renderGaps(nodeId, field, control);
        break;
      case "repeater":
        control.appendChild(
          h(doc, "span", {
            className: "senify-inspector__empty",
            text: "Wiederholfeld folgt in Scheibe 2",
          }),
        );
        break;
      case "media":
        renderText(nodeId, field, control);
        break;
      default:
        renderText(nodeId, field, control);
        break;
    }
    row.appendChild(control);
    if (field.overrideDevices.length > 0 && field.responsive) {
      const dots = h(doc, "span", { className: "senify-inspector__dots" });
      for (const device of field.overrideDevices) {
        const dot = h(doc, "span", {
          className: "senify-inspector__dot",
          data: { dot: device, active: String(device === breakpoint) },
          attributes: { role: "button", title: `Override für ${device} — Ansicht wechseln` },
        });
        dot.addEventListener("click", () => {
          breakpoint = device;
          options.onBreakpointChange?.(device);
          render();
        });
        dots.appendChild(dot);
      }
      side.appendChild(dots);
    }
    if (field.overridden && field.responsive) {
      const reset = h(doc, "button", {
        className: "senify-inspector__reset",
        text: "Reset",
        data: { action: "reset" },
        attributes: { type: "button" },
      });
      reset.addEventListener("click", () => clearProp(nodeId, field));
      side.appendChild(reset);
    }
    row.appendChild(side);
    if (field.literalWarning !== undefined) {
      row.appendChild(
        h(doc, "span", { className: "senify-inspector__warning", text: field.literalWarning }),
      );
    }
    return row;
  }

  function renderGroup(model: InspectorModel, groupId: string, label: string, fields: InspectorField[]): DomElement {
    const isCollapsed = collapsed.has(groupId);
    const group = h(doc, "div", {
      className: "senify-inspector__group",
      data: { group: groupId, collapsed: String(isCollapsed) },
    });
    const head = h(doc, "button", {
      className: "senify-inspector__group-title",
      attributes: { type: "button", "aria-expanded": String(!isCollapsed) },
    });
    head.appendChild(icon(doc, "down", 10));
    head.appendChild(h(doc, "span", { text: label }));
    head.addEventListener("click", () => {
      if (isCollapsed) collapsed.delete(groupId);
      else collapsed.add(groupId);
      render();
    });
    group.appendChild(head);
    if (!isCollapsed) {
      for (const field of fields) {
        if (field.hidden) continue;
        group.appendChild(renderFieldRow(model, field));
      }
    }
    return group;
  }

  function renderTabBody(model: InspectorModel, tabId: InspectorTabId): DomElement {
    const body = h(doc, "div", { className: "senify-inspector__body", data: { tab: tabId } });
    const tab = model.tabs.find((entry) => entry.id === tabId);
    if (tab === undefined || tab.groups.every((group) => group.fields.length === 0)) {
      body.appendChild(
        h(doc, "div", {
          className: "senify-inspector__empty",
          text: "Keine Einstellungen in diesem Tab",
        }),
      );
      return body;
    }
    for (const group of tab.groups) {
      if (group.fields.length === 0) continue;
      body.appendChild(renderGroup(model, group.id, group.label, group.fields));
    }
    if (tabId === "interactions" && model.motion.preset !== null) {
      const remove = h(doc, "button", {
        className: "senify-inspector__reset",
        text: "Motion entfernen",
        data: { action: "motion-remove" },
        attributes: { type: "button" },
      });
      remove.addEventListener("click", () => {
        apply({ op: "clearMotion", id: model.nodeId }, "Motion entfernen");
      });
      body.appendChild(remove);
    }
    return body;
  }

  function renderTabs(): DomElement {
    const tabs = h(doc, "div", { className: "senify-inspector__tabs", attributes: { role: "tablist" } });
    for (const tab of currentModel?.tabs ?? []) {
      const button = h(doc, "button", {
        className: "senify-inspector__tab",
        text: tab.label,
        data: { tab: tab.id, active: String(tab.id === activeTab) },
        attributes: { type: "button", role: "tab", "aria-selected": String(tab.id === activeTab) },
      });
      button.addEventListener("click", () => {
        activeTab = tab.id;
        options.onTabChange?.(tab.id);
        render();
      });
      tabs.appendChild(button);
    }
    return tabs;
  }

  function render(): void {
    const nodeId = selectedId();
    const model =
      nodeId === null
        ? null
        : buildInspector({
            document: options.store.document,
            nodeId,
            breakpoint,
            ...(options.theme === undefined ? {} : { theme: options.theme }),
            profile,
          });
    currentModel = model;
    root.textContent = "";
    const header = h(doc, "div", { className: "senify-inspector__header" });
    header.appendChild(
      h(doc, "span", {
        className: "senify-inspector__title",
        text: model === null ? "Inspektor" : model.title,
      }),
    );
    if (model !== null) {
      header.appendChild(h(doc, "span", { className: "senify-inspector__id", text: model.nodeId }));
    }
    root.appendChild(header);
    if (model === null) {
      root.appendChild(
        h(doc, "div", {
          className: "senify-inspector__empty",
          text: "Nichts ausgewählt — klicke ein Element im Canvas",
        }),
      );
      return;
    }
    root.appendChild(renderTabs());
    root.appendChild(renderTabBody(model, activeTab));
  }

  unsubscribe = options.store.subscribe(() => render());
  render();
  options.host.appendChild(root);

  return {
    element: root,
    refresh: render,
    breakpoint: () => breakpoint,
    setBreakpoint: (device: Device) => {
      breakpoint = device;
      render();
    },
    tab: () => activeTab,
    setTab: (tab: InspectorTabId) => {
      activeTab = tab;
      render();
    },
    profile: () => profile,
    setProfile: (next: MotionProfile) => {
      profile = next;
      render();
    },
    destroy: () => {
      unsubscribe?.();
      unsubscribe = null;
      root.remove();
    },
  };
}
