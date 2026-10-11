import {
  buttonStyle,
  contentWidthClass,
  cx,
  linkStyle,
  resolveLink,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Footer({ node, ctx }: SectionProps): React.JSX.Element {
  const columns = (Array.isArray(node.props.columns) ? node.props.columns : []) as {
    heading?: unknown;
    links?: unknown;
  }[];
  const social = (Array.isArray(node.props.social) ? node.props.social : []) as {
    label?: unknown;
    link?: unknown;
  }[];
  // `multi-column` is the sitemap; `minimal` folds every column into one row of
  // links; `cta-bar` puts a call-to-action strip above the sitemap (headline,
  // button label and link come from the section's CTA fields).
  const variant = node.variant === "minimal" || node.variant === "cta-bar" ? node.variant : "multi-column";
  const minimal = variant === "minimal";
  const columnLinks = (column: (typeof columns)[number]): { label?: unknown; link?: unknown }[] =>
    (Array.isArray(column.links) ? column.links : []) as { label?: unknown; link?: unknown }[];
  const anchor = (
    item: { label?: unknown; link?: unknown },
    key: number,
  ): React.JSX.Element => {
    const target = resolveLink(item.link, ctx);
    return (
      <li key={key}>
        <a
          href={target?.href ?? "#"}
          target={target?.target}
          rel={target?.rel}
          data-broken-link={target?.broken ? "" : undefined}
          style={linkStyle(node)}
        >
          {typeof item.label === "string" ? item.label : ""}
        </a>
      </li>
    );
  };
  const ctaTarget = resolveLink(node.props.ctaLink, ctx);
  const showCta =
    variant === "cta-bar" && str(node.props.ctaHeadline) !== "" && str(node.props.ctaLabel) !== "" && ctaTarget;
  return (
    <SectionShell
      node={node}
      section="footer"
      role="contentinfo"
      className="border-t border-[var(--line)]"
    >
      {showCta && ctaTarget && (
        <div className="border-b border-[var(--line)] bg-[var(--bg-muted)]">
          <div
            className={cx(
              "mx-auto flex flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between",
              contentWidthClass(node),
            )}
          >
            <p className="font-[family-name:var(--font-display)] text-2xl font-bold">
              {str(node.props.ctaHeadline)}
            </p>
            <a
              href={ctaTarget.href}
              target={ctaTarget.target}
              rel={ctaTarget.rel}
              data-broken-link={ctaTarget.broken ? "" : undefined}
              className="self-start px-6 py-3 font-semibold md:self-auto"
              style={buttonStyle(node)}
            >
              {str(node.props.ctaLabel)}
            </a>
          </div>
        </div>
      )}
      <div className={cx("mx-auto px-4", minimal ? "py-8" : "py-12", contentWidthClass(node))}>
        {columns.length > 0 && minimal && (
          <nav aria-label="Footer">
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              {columns.flatMap((column) => columnLinks(column)).map((item, index) => anchor(item, index))}
            </ul>
          </nav>
        )}
        {columns.length > 0 && !minimal && (
          <nav aria-label="Footer" className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            {columns.map((column, index) => (
              <div key={index}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">
                  {typeof column.heading === "string" ? column.heading : ""}
                </h2>
                <ul className="flex flex-col gap-2">
                  {columnLinks(column).map((item, linkIndex) => anchor(item, linkIndex))}
                </ul>
              </div>
            ))}
          </nav>
        )}
        <div
          className={cx(
            "flex flex-col gap-3 border-t border-[var(--line)] pt-6 text-sm text-[var(--fg-muted)] md:flex-row md:items-center md:justify-between",
            minimal ? "mt-6" : "mt-10",
          )}
        >
          <p>{str(node.props.legal)}</p>
          {social.length > 0 && (
            <ul className="flex gap-4">{social.map((entry, index) => anchor(entry, index))}</ul>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
