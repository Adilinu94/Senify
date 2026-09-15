import { resolveLink, SectionShell, str, type SectionProps } from "./shared.tsx";

export function CookieNote({ node, ctx }: SectionProps): React.JSX.Element {
  const policy = resolveLink(node.props.policyLink, ctx);
  return (
    <SectionShell node={node} section="cookie-note" className="px-4 pb-4">
      <div
        role="dialog"
        aria-live="polite"
        aria-label="Cookie-Hinweis"
        data-island="consent"
        className="mx-auto flex max-w-3xl flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--bg-base)] p-5 shadow-[var(--shadow-lg)] md:flex-row md:items-center"
      >
        <p className="flex-1 text-sm">
          {str(node.props.text)}{" "}
          {policy && (
            <a
              href={policy.href}
              target={policy.target}
              rel={policy.rel}
              data-broken-link={policy.broken ? "" : undefined}
              className="underline"
            >
              Datenschutzerklärung
            </a>
          )}
        </p>
        <div className="flex gap-2">
          {str(node.props.declineLabel) !== "" && (
            <button
              type="button"
              data-consent="decline"
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold"
            >
              {str(node.props.declineLabel)}
            </button>
          )}
          <button
            type="button"
            data-consent="accept"
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]"
          >
            {str(node.props.acceptLabel, "OK")}
          </button>
        </div>
      </div>
    </SectionShell>
  );
}
