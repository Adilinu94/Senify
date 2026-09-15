import { SectionShell, str, type SectionProps } from "./shared.tsx";

const FIELD_LABELS: Record<string, string> = {
  text: "text",
  email: "email",
  phone: "tel",
  textarea: "textarea",
  select: "select",
  checkbox: "checkbox",
};

export function Contact({ node }: SectionProps): React.JSX.Element {
  const fields = (Array.isArray(node.props.fields) ? node.props.fields : []) as {
    kind?: unknown;
    label?: unknown;
    required?: unknown;
  }[];
  return (
    <SectionShell node={node} section="contact">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
        <div>
          {str(node.props.title) !== "" && (
            <h2 className="font-[var(--font-display)] text-3xl font-bold">
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
        <form method="post" action="#" data-form="contact" className="flex flex-col gap-4">
          {fields.map((field, index) => {
            const label = typeof field.label === "string" ? field.label : "";
            const kind = typeof field.kind === "string" ? field.kind : "text";
            const name = `field-${index}`;
            const required = field.required === true;
            if (kind === "textarea") {
              return (
                <label key={index} className="flex flex-col gap-1">
                  <span>
                    {label}
                    {required ? " *" : ""}
                  </span>
                  <textarea name={name} required={required} rows={4} className="rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2" />
                </label>
              );
            }
            if (kind === "checkbox") {
              return (
                <label key={index} className="flex items-center gap-2">
                  <input type="checkbox" name={name} required={required} />
                  <span>
                    {label}
                    {required ? " *" : ""}
                  </span>
                </label>
              );
            }
            if (kind === "select") {
              return (
                <label key={index} className="flex flex-col gap-1">
                  <span>
                    {label}
                    {required ? " *" : ""}
                  </span>
                  <select name={name} required={required} className="rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2" />
                </label>
              );
            }
            return (
              <label key={index} className="flex flex-col gap-1">
                <span>
                  {label}
                  {required ? " *" : ""}
                </span>
                <input
                  type={FIELD_LABELS[kind] ?? "text"}
                  name={name}
                  required={required}
                  className="rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2"
                />
              </label>
            );
          })}
          <button
            type="submit"
            className="rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent-ink)]"
          >
            Absenden
          </button>
          {str(node.props.note) !== "" && (
            <p className="text-sm text-[var(--fg-muted)]">{str(node.props.note)}</p>
          )}
        </form>
      </div>
    </SectionShell>
  );
}
