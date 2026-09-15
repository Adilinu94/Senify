import {
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
  return (
    <SectionShell
      node={node}
      section="footer"
      className="border-t border-[var(--line)]"
    >
      <div className={cx("mx-auto px-4 py-12", contentWidthClass(node))}>
        {columns.length > 0 && (
          <nav aria-label="Footer" className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            {columns.map((column, index) => (
              <div key={index}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">
                  {typeof column.heading === "string" ? column.heading : ""}
                </h2>
                <ul className="flex flex-col gap-2">
                  {(Array.isArray(column.links) ? column.links : []).map(
                    (entry: unknown, linkIndex: number) => {
                      const item = entry as { label?: unknown; link?: unknown };
                      const target = resolveLink(item.link, ctx);
                      return (
                        <li key={linkIndex}>
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
                    },
                  )}
                </ul>
              </div>
            ))}
          </nav>
        )}
        <div className="mt-10 flex flex-col gap-3 border-t border-[var(--line)] pt-6 text-sm text-[var(--fg-muted)] md:flex-row md:items-center md:justify-between">
          <p>{str(node.props.legal)}</p>
          {social.length > 0 && (
            <ul className="flex gap-4">
              {social.map((entry, index) => {
                const target = resolveLink(entry.link, ctx);
                return (
                  <li key={index}>
                    <a
                      href={target?.href ?? "#"}
                      target={target?.target}
                      rel={target?.rel}
                      data-broken-link={target?.broken ? "" : undefined}
                      style={linkStyle(node)}
                    >
                      {typeof entry.label === "string" ? entry.label : ""}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
