import {
  alignStyle,
  cardStyle,
  contentWidthClass,
  cx,
  headingStyle,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";
import { FormFields, readFormData } from "./FormFields.tsx";

export function Contact({ node, ctx }: SectionProps): React.JSX.Element {
  const form = readFormData(node);
  const fallbackFields = (
    Array.isArray(node.props.fields) ? node.props.fields : []
  ) as { kind?: unknown; label?: unknown; required?: unknown }[];
  // `split` sets the details beside the form; `form` puts the form first in a
  // single narrow column with the details as a line beneath; `info` leads with
  // the details as tiles and lets the form follow.
  const variant = node.variant === "form" || node.variant === "info" ? node.variant : "split";
  const email = str(node.props.email);
  const phone = str(node.props.phone);
  const address = str(node.props.address);
  const emailLink = <a href={`mailto:${email}`}>{email}</a>;
  const phoneLink = <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a>;
  const formBlock =
    form !== undefined ? (
      <FormFields form={form} ctx={ctx} />
    ) : (
      <StaticFormFields fields={fallbackFields} />
    );
  const heading =
    str(node.props.title) !== "" ? (
      <h2
        className="font-[family-name:var(--font-display)] text-3xl font-bold"
        style={{ ...headingStyle(node), ...alignStyle(node) }}
      >
        {str(node.props.title)}
      </h2>
    ) : null;
  const intro =
    str(node.props.intro) !== "" ? (
      <p className="mt-3 text-lg text-[var(--fg-muted)]">{str(node.props.intro)}</p>
    ) : null;

  if (variant === "form") {
    return (
      <SectionShell node={node} section="contact">
        <div className={cx("mx-auto px-4 py-16", contentWidthClass(node, "max-w-2xl"))}>
          {heading}
          {intro}
          <div className="mt-8">{formBlock}</div>
          {(email !== "" || phone !== "" || address !== "") && (
            <address className="mt-10 flex flex-wrap gap-x-8 gap-y-2 border-t border-[var(--line)] pt-6 not-italic">
              {email !== "" && emailLink}
              {phone !== "" && phoneLink}
              {address !== "" && <p>{address}</p>}
            </address>
          )}
        </div>
      </SectionShell>
    );
  }

  if (variant === "info") {
    const tiles: { label: string; content: React.JSX.Element }[] = [];
    if (email !== "") tiles.push({ label: "E-Mail", content: emailLink });
    if (phone !== "") tiles.push({ label: "Telefon", content: phoneLink });
    if (address !== "") tiles.push({ label: "Adresse", content: <p>{address}</p> });
    return (
      <SectionShell node={node} section="contact">
        <div className={cx("mx-auto px-4 py-16", contentWidthClass(node))}>
          {heading}
          {intro}
          {tiles.length > 0 && (
            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {tiles.map((tile) => (
                <li
                  key={tile.label}
                  className="border"
                  style={cardStyle(node, { background: "var(--bg-muted)" })}
                >
                  <p className="text-sm font-semibold uppercase tracking-widest text-[var(--fg-muted)]">
                    {tile.label}
                  </p>
                  <div className="mt-2 break-words text-lg">{tile.content}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="mx-auto mt-12 max-w-2xl">{formBlock}</div>
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell node={node} section="contact">
      <div
        className={cx(
          "mx-auto grid gap-10 px-4 py-16 md:grid-cols-2",
          contentWidthClass(node),
        )}
      >
        <div>
          {heading}
          {intro}
          <address className="mt-6 flex flex-col gap-2 not-italic">
            {email !== "" && emailLink}
            {phone !== "" && phoneLink}
            {address !== "" && <p>{address}</p>}
          </address>
        </div>
        {formBlock}
      </div>
    </SectionShell>
  );
}

// Rendering without a stamped descriptor (editor preview of an unconfigured
// section): the fields are shown, but there is nothing to submit to yet.
function StaticFormFields({
  fields,
}: {
  fields: { kind?: unknown; label?: unknown; required?: unknown }[];
}): React.JSX.Element {
  return (
    <form method="post" action="#" data-form-unscheduled="" className="flex flex-col gap-4">
      {fields.map((field, index) => {
        const label = typeof field.label === "string" ? field.label : "";
        const required = field.required === true;
        return (
          <label key={index} className="flex flex-col gap-1">
            <span>
              {label}
              {required ? " *" : ""}
            </span>
            <input
              type="text"
              name={`field-${index}`}
              required={required}
              disabled
              className="rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2"
            />
          </label>
        );
      })}
      <button
        type="submit"
        disabled
        className="self-start px-6 py-3 font-semibold"
        style={{
          backgroundColor: "var(--button-bg, var(--accent))",
          color: "var(--button-fg, var(--accent-ink))",
          borderRadius: "var(--button-radius, 9999px)",
        }}
      >
        Absenden
      </button>
    </form>
  );
}
