import { contentWidthClass, cx, resolveLink, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Banner({ node, ctx }: SectionProps): React.JSX.Element {
  const target = resolveLink(node.props.link, ctx);
  const dismissible = node.props.dismissible === true;
  // `bar` is the inverted pill; `ribbon` runs edge to edge as a square strip;
  // `announcement` is a soft accent-tinted pill that points at its link.
  const ribbon = node.variant === "ribbon";
  const announcement = node.variant === "announcement";
  const text = str(node.props.text);
  return (
    <SectionShell node={node} section="banner" className={ribbon ? undefined : "px-4 pt-4"}>
      <div
        role="note"
        data-island={dismissible ? "dismiss" : undefined}
        className={cx(
          "mx-auto flex items-center justify-center gap-3 text-center text-sm",
          ribbon
            ? "bg-[var(--bg-inverted)] px-4 py-2 text-[var(--fg-inverted)]"
            : announcement
              ? "rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-5 py-2"
              : "rounded-full bg-[var(--bg-inverted)] px-5 py-2 text-[var(--fg-inverted)]",
          !ribbon && contentWidthClass(node),
        )}
      >
        {target ? (
          <a
            href={target.href}
            target={target.target}
            rel={target.rel}
            data-broken-link={target.broken ? "" : undefined}
          >
            {text}
            {announcement && (
              <span aria-hidden className="ml-2 font-semibold text-[var(--accent)]">
                →
              </span>
            )}
          </a>
        ) : (
          <span>{text}</span>
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
