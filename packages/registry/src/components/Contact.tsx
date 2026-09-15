import {
  alignStyle,
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
  return (
    <SectionShell node={node} section="contact">
      <div
        className={cx(
          "mx-auto grid gap-10 px-4 py-16 md:grid-cols-2",
          contentWidthClass(node),
        )}
      >
        <div>
          {str(node.props.title) !== "" && (
            <h2
              className="font-[var(--font-display)] text-3xl font-bold"
              style={{ ...headingStyle(node), ...alignStyle(node) }}
            >
              {str(node.props.title)}
            </h2>
          )}
          {str(node.props.intro) !== "" && (
            <p className="mt-3 text-lg text-[var(--fg-muted)]">{str(node.props.intro)}</p>
          )}
          <address className="mt-6 flex flex-col gap-2 not-italic">
            {str(node.props.email) !== "" && (
              <a href={`mailto:${str(node.props.email)}`}>{str(node.props.email)}</a>
            )}
            {str(node.props.phone) !== "" && (
              <a href={`tel:${str(node.props.phone).replace(/[^+\d]/g, "")}`}>
                {str(node.props.phone)}
              </a>
            )}
            {str(node.props.address) !== "" && <p>{str(node.props.address)}</p>}
          </address>
        </div>
        {form !== undefined ? (
          <FormFields form={form} ctx={ctx} />
        ) : (
          <StaticFormFields fields={fallbackFields} />
        )}
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
