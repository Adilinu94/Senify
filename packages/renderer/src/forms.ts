import type { Node, NodeTree, PropValue } from "@senify/section-sdk";

// Native forms (artifacts/26): the section props carry the editor-facing
// definition, the bake freezes it into a snapshot and the components render
// against the stamped descriptor. This module owns the definition -> snapshot
// parsing and the in-tree stamping; identity, signing and storage stay in the
// engine.

export const FORM_FIELD_KINDS = [
  "text",
  "email",
  "phone",
  "textarea",
  "select",
  "radios",
  "checkbox",
  "date",
  "number",
] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

export const FORM_SECTION_TYPES = ["contact", "newsletter"] as const;
export type FormSectionType = (typeof FORM_SECTION_TYPES)[number];

export const DEFAULT_HONEYPOT_KEY = "company";
export const FORM_SCRIPT_PATH = "/assets/forms.js";

export type FormFieldOption = { value: string; label: string };

export type FormFieldValidation = {
  pattern?: string;
  min?: number;
  max?: number;
};

export type FormField = {
  key: string;
  label: string;
  kind: FormFieldKind;
  required: boolean;
  placeholder?: string;
  options?: FormFieldOption[];
  validation?: FormFieldValidation;
};

export type FormConsent = {
  required: true;
  text: string;
  pageId: string | null;
};

export type FormMode = "message" | "newsletter";

// Frozen per bake: the endpoint validates against this, never against the
// client. The engine adds the identity (formId) and the token.
export type FormSnapshot = {
  siteId: string;
  pageId: string;
  nodeId: string;
  pagePath: string;
  sectionType: FormSectionType;
  mode: FormMode;
  name: string;
  fields: FormField[];
  targetCollectionId: string | null;
  consent: FormConsent | null;
  successMessage: string;
  successPageId: string | null;
  honeypotKey: string;
  notifyEmail: string | null;
};

// What the section component reads from `node.props.form`.
export type FormRenderData = {
  formId: string;
  action: string;
  token: string;
  mode: FormMode;
  fields: FormField[];
  consent: FormConsent | null;
  successMessage: string;
  successPageId: string | null;
  honeypotKey: string;
  submitLabel: string;
};

export type FormStamp = {
  snapshot: FormSnapshot;
  formId: string;
  snapshotId: string;
  token: string;
  action: string;
};

export type FormSnapshotContext = {
  siteId: string;
  pageId: string;
  pagePath: string;
};

function propString(value: PropValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function isFormSection(node: Node): boolean {
  return (FORM_SECTION_TYPES as readonly string[]).includes(node.type);
}

function slugKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function uniqueKey(label: string, taken: Set<string>): string {
  const base = slugKey(label) || "field";
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let attempt = 2; attempt < 100; attempt += 1) {
    const candidate = `${base}-${attempt}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  taken.add(base);
  return base;
}

function readOptions(value: PropValue | undefined): FormFieldOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options: FormFieldOption[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const optionValue = typeof record.value === "string" ? record.value : "";
    const label = typeof record.label === "string" ? record.label : optionValue;
    if (optionValue === "") continue;
    options.push({ value: optionValue, label });
  }
  return options.length === 0 ? undefined : options;
}

function readValidation(
  value: PropValue | undefined,
): FormFieldValidation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const validation: FormFieldValidation = {};
  if (typeof record.pattern === "string" && record.pattern !== "") {
    validation.pattern = record.pattern;
  }
  if (typeof record.min === "number" && Number.isFinite(record.min)) {
    validation.min = record.min;
  }
  if (typeof record.max === "number" && Number.isFinite(record.max)) {
    validation.max = record.max;
  }
  return Object.keys(validation).length === 0 ? undefined : validation;
}

function parseField(
  raw: PropValue,
  index: number,
  taken: Set<string>,
): FormField | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const kind =
    typeof record.kind === "string" &&
    (FORM_FIELD_KINDS as readonly string[]).includes(record.kind)
      ? (record.kind as FormFieldKind)
      : "text";
  const label =
    typeof record.label === "string" && record.label.trim() !== ""
      ? record.label.trim()
      : `Feld ${index + 1}`;
  const explicitKey =
    typeof record.key === "string" && slugKey(record.key) !== ""
      ? slugKey(record.key)
      : "";
  const key =
    explicitKey !== "" && !taken.has(explicitKey)
      ? (taken.add(explicitKey), explicitKey)
      : uniqueKey(label, taken);
  const field: FormField = {
    key,
    label,
    kind,
    required: record.required === true,
  };
  if (typeof record.placeholder === "string" && record.placeholder !== "") {
    field.placeholder = record.placeholder;
  }
  if (kind === "select" || kind === "radios") {
    const options = readOptions(record.options as PropValue | undefined);
    if (options === undefined) return null;
    field.options = options;
  }
  const validation = readValidation(record.validation as PropValue | undefined);
  if (validation !== undefined) field.validation = validation;
  return field;
}

function readConsent(
  node: Node,
  fallbackText: string,
): FormConsent | null {
  const text = propString(node.props.consentText, fallbackText).trim();
  let pageId: string | null = null;
  const link = node.props.consentPage;
  if (link && typeof link === "object" && !Array.isArray(link)) {
    const candidate = (link as Record<string, unknown>).pageId;
    if (typeof candidate === "string" && candidate !== "") pageId = candidate;
  }
  if (text === "" && pageId === null) return null;
  return { required: true, text, pageId };
}

function readPageLink(value: PropValue | undefined): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).pageId;
  return typeof candidate === "string" && candidate !== "" ? candidate : null;
}

export function formSnapshotFromNode(
  node: Node,
  context: FormSnapshotContext,
): FormSnapshot | null {
  if (!isFormSection(node)) return null;
  const sectionType = node.type as FormSectionType;
  const mode: FormMode = sectionType === "newsletter" ? "newsletter" : "message";
  const taken = new Set<string>();
  const fields: FormField[] = [];
  if (mode === "newsletter") {
    // A newsletter form collects exactly one address; the DOI flow lives on
    // the engine side and does not need a field list.
    fields.push({ key: "email", label: "E-Mail", kind: "email", required: true });
    taken.add("email");
  } else {
    const raw = node.props.fields;
    if (Array.isArray(raw)) {
      raw.forEach((entry, index) => {
        const field = parseField(entry, index, taken);
        if (field !== null) fields.push(field);
      });
    }
  }
  if (fields.length === 0) return null;
  const name =
    propString(node.props.formName) ||
    propString(node.props.title) ||
    propString(node.props.headline) ||
    (mode === "newsletter" ? "Newsletter" : "Kontakt");
  const targetCollectionId =
    propString(node.props.targetCollectionId) || null;
  const notifyEmail = propString(node.props.notifyEmail) || null;
  const honeypotKey =
    slugKey(propString(node.props.honeypotKey)) || DEFAULT_HONEYPOT_KEY;
  return {
    siteId: context.siteId,
    pageId: context.pageId,
    nodeId: node.id,
    pagePath: context.pagePath,
    sectionType,
    mode,
    name,
    fields,
    targetCollectionId,
    consent: readConsent(node, propString(node.props.note)),
    successMessage:
      propString(node.props.successMessage) ||
      (mode === "newsletter"
        ? "Fast fertig: Bitte bestätige den Link in deiner E-Mail."
        : "Danke für deine Nachricht!"),
    successPageId: readPageLink(node.props.successPage),
    honeypotKey,
    notifyEmail,
  };
}

export function formRenderData(
  snapshot: FormSnapshot,
  signed: { formId: string; token: string; action: string },
): FormRenderData {
  return {
    formId: signed.formId,
    action: signed.action,
    token: signed.token,
    mode: snapshot.mode,
    fields: snapshot.fields,
    consent: snapshot.consent,
    successMessage: snapshot.successMessage,
    successPageId: snapshot.successPageId,
    honeypotKey: snapshot.honeypotKey,
    submitLabel: snapshot.mode === "newsletter" ? "Anmelden" : "Absenden",
  };
}

export function treeHasForms(tree: NodeTree): boolean {
  return Object.values(tree.nodes).some((node) => isFormSection(node));
}

// Walks a bake tree, freezes every form section and writes the stamped
// descriptor back onto the node props the components render from.
export async function stampFormsInTree(input: {
  tree: NodeTree;
  context: FormSnapshotContext;
  stamp: (snapshot: FormSnapshot) => Promise<Omit<FormStamp, "snapshot"> | null>;
}): Promise<FormStamp[]> {
  const stamps: FormStamp[] = [];
  for (const node of Object.values(input.tree.nodes)) {
    const snapshot = formSnapshotFromNode(node, input.context);
    if (snapshot === null) continue;
    const signed = await input.stamp(snapshot);
    if (signed === null) continue;
    const render = formRenderData(snapshot, signed);
    node.props = { ...node.props, form: render as unknown as PropValue };
    stamps.push({ snapshot, ...signed });
  }
  return stamps;
}

// Progressive submit: the same endpoint serves both paths. Without JS the
// browser posts the form and follows the redirect; with JS this script turns
// it into an inline confirmation — one endpoint, one validation.
export function renderFormsScript(): string {
  return `(function () {
  "use strict";
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    document.querySelectorAll("form[data-native-form]").forEach(function (form) {
      var status = form.querySelector("[data-form-status]");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var button = form.querySelector("button[type=submit]");
        if (button) { button.setAttribute("disabled", ""); }
        fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { accept: "application/json" },
        })
          .then(function (response) {
            return response
              .json()
              .catch(function () { return {}; })
              .then(function (body) { return { ok: response.ok, body: body }; });
          })
          .then(function (result) {
            if (button) { button.removeAttribute("disabled"); }
            if (!status) return;
            status.removeAttribute("hidden");
            if (result.ok) {
              status.removeAttribute("data-form-error");
              status.textContent = result.body.message || "Danke!";
              form.reset();
            } else {
              status.setAttribute("data-form-error", "");
              var error = result.body && result.body.error ? result.body.error : {};
              status.textContent = (error.message || "Senden fehlgeschlagen") +
                (error.suggestion ? " — " + error.suggestion : "");
            }
          })
          .catch(function () {
            if (button) { button.removeAttribute("disabled"); }
            if (status) {
              status.removeAttribute("hidden");
              status.setAttribute("data-form-error", "");
              status.textContent = "Senden fehlgeschlagen. Bitte erneut versuchen.";
            }
          });
      });
    });
  });
})();
`;
}
