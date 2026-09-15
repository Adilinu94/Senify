import type { Node } from "@senify/section-sdk";
import type { SectionContext } from "./shared.tsx";

// Native form rendering (T11): the engine stamps `node.props.form` during the
// bake (token, action, field list, consent). The component only draws what the
// frozen descriptor allows — it never defines validation of its own.

export type NativeFormField = {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
};

export type NativeFormData = {
  formId: string;
  action: string;
  token: string;
  mode: "message" | "newsletter";
  fields: NativeFormField[];
  consent: { text: string; pageId: string | null } | null;
  successMessage: string;
  successPageId: string | null;
  honeypotKey: string;
  submitLabel: string;
};

export function readFormData(node: Node): NativeFormData | undefined {
  const value = node.props.form;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const form = value as Record<string, unknown>;
  if (typeof form.action !== "string" || typeof form.token !== "string") {
    return undefined;
  }
  const fields = Array.isArray(form.fields)
    ? (form.fields as NativeFormField[]).filter(
        (field) =>
          field && typeof field.key === "string" && typeof field.label === "string",
      )
    : [];
  const consentRaw = form.consent;
  const consent =
    consentRaw && typeof consentRaw === "object" && !Array.isArray(consentRaw)
      ? {
          text: String((consentRaw as Record<string, unknown>).text ?? ""),
          pageId:
            typeof (consentRaw as Record<string, unknown>).pageId === "string"
              ? String((consentRaw as Record<string, unknown>).pageId)
              : null,
        }
      : null;
  return {
    formId: typeof form.formId === "string" ? form.formId : "",
    action: form.action,
    token: form.token,
    mode: form.mode === "newsletter" ? "newsletter" : "message",
    fields,
    consent,
    successMessage:
      typeof form.successMessage === "string" ? form.successMessage : "",
    successPageId:
      typeof form.successPageId === "string" ? form.successPageId : null,
    honeypotKey:
      typeof form.honeypotKey === "string" && form.honeypotKey !== ""
        ? form.honeypotKey
        : "company",
    submitLabel:
      typeof form.submitLabel === "string" && form.submitLabel !== ""
        ? form.submitLabel
        : "Absenden",
  };
}

const INPUT_CLASS =
  "rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2";

function FieldLabel({
  label,
  required,
}: {
  label: string;
  required: boolean;
}): React.JSX.Element {
  return (
    <span>
      {label}
      {required ? " *" : ""}
    </span>
  );
}

function renderField(field: NativeFormField): React.JSX.Element {
  const name = field.key;
  const label = field.label;
  const required = field.required;
  switch (field.kind) {
    case "textarea":
      return (
        <label key={name} className="flex flex-col gap-1">
          <FieldLabel label={label} required={required} />
          <textarea
            name={name}
            required={required}
            rows={4}
            placeholder={field.placeholder ?? undefined}
            className={INPUT_CLASS}
          />
        </label>
      );
    case "checkbox":
      return (
        <label key={name} className="flex items-center gap-2">
          <input type="checkbox" name={name} value="true" required={required} />
          <FieldLabel label={label} required={required} />
        </label>
      );
    case "select":
      return (
        <label key={name} className="flex flex-col gap-1">
          <FieldLabel label={label} required={required} />
          <select name={name} required={required} className={INPUT_CLASS}>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "radios":
      return (
        <fieldset key={name} className="flex flex-col gap-1">
          <legend>
            <FieldLabel label={label} required={required} />
          </legend>
          {field.options?.map((option) => (
            <label key={option.value} className="flex items-center gap-2">
              <input
                type="radio"
                name={name}
                value={option.value}
                required={required}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      );
    default: {
      const type =
        field.kind === "email"
          ? "email"
          : field.kind === "phone"
            ? "tel"
            : field.kind === "date"
              ? "date"
              : field.kind === "number"
                ? "number"
                : "text";
      return (
        <label key={name} className="flex flex-col gap-1">
          <FieldLabel label={label} required={required} />
          <input
            type={type}
            name={name}
            required={required}
            placeholder={field.placeholder ?? undefined}
            className={INPUT_CLASS}
          />
        </label>
      );
    }
  }
}

export function FormFields({
  form,
  ctx,
}: {
  form: NativeFormData;
  ctx: SectionContext;
}): React.JSX.Element {
  const consentHref =
    form.consent?.pageId !== null && form.consent?.pageId !== undefined
      ? ctx.pagePaths[form.consent.pageId]
      : undefined;
  return (
    <form
      method="post"
      action={form.action}
      data-native-form=""
      data-form-mode={form.mode}
      className="flex flex-col gap-4 text-left"
    >
      <input type="hidden" name="form_token" value={form.token} />
      {form.fields.map((field) => renderField(field))}
      {/* Honeypot: invisible to people, filled by naive bots. */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 overflow-hidden"
      >
        <label>
          Firma
          <input
            type="text"
            name={form.honeypotKey}
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>
      {form.consent !== null && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" value="true" required />
          <span>
            {form.consent.text}
            {consentHref !== undefined && (
              <>
                {" "}
                <a href={consentHref} className="underline">
                  Datenschutzerklärung
                </a>
              </>
            )}
          </span>
        </label>
      )}
      <button
        type="submit"
        className="self-start px-6 py-3 font-semibold"
        style={{
          backgroundColor: "var(--button-bg, var(--accent))",
          color: "var(--button-fg, var(--accent-ink))",
          borderRadius: "var(--button-radius, 9999px)",
        }}
      >
        {form.submitLabel}
      </button>
      {/* Works without JS: the engine redirects to the thank-you page. With
          JS this region shows the inline confirmation. */}
      <p hidden data-form-status role="status" className="text-sm" />
    </form>
  );
}
