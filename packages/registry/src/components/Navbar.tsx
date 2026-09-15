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

export function Navbar({ node, ctx }: SectionProps): React.JSX.Element {
  const links = (Array.isArray(node.props.links) ? node.props.links : []) as {
    label?: unknown;
    link?: unknown;
  }[];
  const cta = resolveLink(node.props.ctaLink, ctx);
  return (
    <SectionShell
      node={node}
      section="navbar"
      className={cx("border-b border-[var(--line)]", node.props.sticky === true && "sticky top-0 z-50")}
    >
      <nav
        aria-label="Hauptnavigation"
        className={cx(
          "mx-auto flex items-center justify-between gap-6 px-4 py-4",
          contentWidthClass(node),
        )}
      >
        <a href="/" className="font-[var(--font-display)] text-lg font-bold" style={linkStyle(node)}>
          {str(node.props.logo, "Logo")}
        </a>
        <ul className="hidden items-center gap-6 md:flex">
          {links.map((item, index) => {
            const target = resolveLink(item.link, ctx);
            return (
              <li key={index}>
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
          })}
        </ul>
        <div className="flex items-center gap-3">
          {str(node.props.ctaLabel) !== "" && cta && (
            <a
              href={cta.href}
              target={cta.target}
              rel={cta.rel}
              className="hidden px-5 py-2 text-sm font-semibold md:inline-block"
              style={buttonStyle(node)}
            >
              {str(node.props.ctaLabel)}
            </a>
          )}
          <button type="button" data-island="menu" aria-label="Menü öffnen" className="md:hidden">
            Menü
          </button>
        </div>
      </nav>
      <div data-menu-panel hidden className="border-t border-[var(--line)] px-4 py-4 md:hidden">
        <ul className="flex flex-col gap-3">
          {links.map((item, index) => {
            const target = resolveLink(item.link, ctx);
            return (
              <li key={index}>
                <a
                  href={target?.href ?? "#"}
                  target={target?.target}
                  rel={target?.rel}
                  style={linkStyle(node)}
                >
                  {typeof item.label === "string" ? item.label : ""}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </SectionShell>
  );
}
