import { cx, resolveAsset, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Testimonials({ node, ctx }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    quote?: unknown;
    author?: unknown;
    role?: unknown;
    avatar?: unknown;
  }[];
  const slider = node.variant === "slider";
  return (
    <SectionShell node={node} section="testimonials">
      <div className="mx-auto max-w-6xl px-4 py-16">
        {str(node.props.title) !== "" && (
          <h2 className="font-[var(--font-display)] text-3xl font-bold">{str(node.props.title)}</h2>
        )}
        <div data-island={slider ? "slider" : undefined} className={cx(slider && "slider")}>
          {slider && (
            <div className="mt-6 flex gap-2">
              <button type="button" data-slider-prev aria-label="Zurück">
                ←
              </button>
              <button type="button" data-slider-next aria-label="Weiter">
                →
              </button>
            </div>
          )}
          <ul className={cx("mt-8 grid gap-6", !slider && "md:grid-cols-2")}>
            {items.map((item, index) => {
              const avatar = resolveAsset(item.avatar, ctx);
              return (
                <li key={index}>
                  <blockquote className="h-full rounded-[var(--radius-lg)] border border-[var(--line)] p-6">
                    <p className="text-lg leading-relaxed">
                      „{typeof item.quote === "string" ? item.quote : ""}"
                    </p>
                    <footer className="mt-4 flex items-center gap-3">
                      {avatar && (
                        <img
                          src={avatar.src}
                          alt={typeof item.author === "string" ? item.author : ""}
                          loading="lazy"
                          data-missing-asset={avatar.missing ? "" : undefined}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <cite className="font-semibold not-italic">
                          {typeof item.author === "string" ? item.author : ""}
                        </cite>
                        {typeof item.role === "string" && item.role !== "" && (
                          <p className="text-sm text-[var(--fg-muted)]">{item.role}</p>
                        )}
                      </div>
                    </footer>
                  </blockquote>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </SectionShell>
  );
}
