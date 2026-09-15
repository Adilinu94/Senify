import { resolveLink, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Banner({ node, ctx }: SectionProps): React.JSX.Element {
  const target = resolveLink(node.props.link, ctx);
  const dismissible = node.props.dismissible === true;
  return (
    <SectionShell node={node} section="banner" className="px-4 pt-4">
      <div
        role="note"
        data-island={dismissible ? "dismiss" : undefined}
        className="mx-auto flex max-w-6xl items-center justify-center gap-3 rounded-full bg-[var(--bg-inverted)] px-5 py-2 text-center text-sm text-[var(--fg-inverted)]"
      >
        {target ? (
          <a
            href={target.href}
            target={target.target}
            rel={target.rel}
            data-broken-link={target.broken ? "" : undefined}
          >
            {str(node.props.text)}
          </a>
        ) : (
          <span>{str(node.props.text)}</span>
        )}
        {dismissible && (
          <button type="button" data-dismiss aria-label="Schließen">
            ×
          </button>
        )}
      </div>
    </SectionShell>
  );
}
