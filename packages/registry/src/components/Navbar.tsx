import {
  buttonStyle,
  contentWidthClass,
  cx,
  isCurrentPage,
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
  // `default` is the ruled bar. `transparent` drops rule and background so the
  // page shows through (a sticky one frosts the strip instead). `centered`
  // sets the logo in the middle with the links to its left and the action to
  // its right; the document order follows what the eye reads.
  const transparent = node.variant === "transparent";
  const centered = node.variant === "centered";
  const sticky = node.props.sticky === true;
  const logo = (
    <a
      key="logo"
      href="/"
      className={cx(
        "font-[family-name:var(--font-display)] text-lg font-bold",
        centered && "md:justify-self-center",
      )}
      style={linkStyle(node)}
    >
      {str(node.props.logo, "Logo")}
    </a>
  );
  const list = (
    <ul key="links" className="hidden items-center gap-6 md:flex">
      {links.map((item, index) => {
        const target = resolveLink(item.link, ctx);
        return (
          <li key={index}>
            <a
              href={target?.href ?? "#"}
              target={target?.target}
              rel={target?.rel}
              aria-current={isCurrentPage(target?.href, ctx) ? "page" : undefined}
              data-broken-link={target?.broken ? "" : undefined}
              style={linkStyle(node)}
            >
              {typeof item.label === "string" ? item.label : ""}
            </a>
          </li>
        );
      })}
    </ul>
  );
  const actions = (
    <div key="actions" className={cx("flex items-center gap-3", centered && "md:justify-self-end")}>
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
  );
  return (
    <SectionShell
      node={node}
      section="navbar"
      role="banner"
      className={cx(
        "border-b",
        transparent ? "border-transparent" : "border-[var(--line)]",
        sticky && "sticky top-0 z-50",
        transparent && "bg-transparent",
        transparent && sticky && "bg-[color-mix(in_srgb,var(--bg-base)_60%,transparent)] backdrop-blur-md",
      )}
    >
      <nav
        aria-label="Hauptnavigation"
        className={cx(
          "mx-auto flex items-center justify-between gap-6 px-4 py-4",
          centered && "md:grid md:grid-cols-[1fr_auto_1fr]",
          contentWidthClass(node),
        )}
      >
        {centered ? [list, logo, actions] : [logo, list, actions]}
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
                  aria-current={isCurrentPage(target?.href, ctx) ? "page" : undefined}
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
