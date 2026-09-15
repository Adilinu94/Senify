import { resolveLink, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Pricing({ node, ctx }: SectionProps): React.JSX.Element {
  const plans = (Array.isArray(node.props.plans) ? node.props.plans : []) as {
    name?: unknown;
    price?: unknown;
    period?: unknown;
    features?: unknown;
    ctaLabel?: unknown;
    ctaLink?: unknown;
    highlighted?: unknown;
    priceYearly?: unknown;
  }[];
  const billing = node.props.billingToggle === true;
  const anyYearly = plans.some((plan) => typeof plan.priceYearly === "string");
  return (
    <SectionShell node={node} section="pricing">
      <div className="mx-auto max-w-6xl px-4 py-16">
        {str(node.props.title) !== "" && (
          <h2 className="text-center font-[var(--font-display)] text-3xl font-bold">
            {str(node.props.title)}
          </h2>
        )}
        {str(node.props.intro) !== "" && (
          <p className="mx-auto mt-3 max-w-2xl text-center text-lg text-[var(--fg-muted)]">
            {str(node.props.intro)}
          </p>
        )}
        {billing && anyYearly && (
          <div data-island="billing" className="mt-6 flex justify-center gap-2 text-sm font-semibold">
            <button type="button" data-billing="monthly" aria-pressed="true">
              Monatlich
            </button>
            <button type="button" data-billing="yearly" aria-pressed="false">
              Jährlich
            </button>
          </div>
        )}
        {billing && str(node.props.billingNote) !== "" && (
          <p className="mt-3 text-center text-sm text-[var(--fg-muted)]">
            {str(node.props.billingNote)}
          </p>
        )}
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((plan, index) => {
            const target = resolveLink(plan.ctaLink, ctx);
            return (
              <li
                key={index}
                className={
                  plan.highlighted === true
                    ? "rounded-[var(--radius-lg)] border-2 border-[var(--accent)] p-6"
                    : "rounded-[var(--radius-lg)] border border-[var(--line)] p-6"
                }
              >
                <h3 className="text-lg font-semibold">
                  {typeof plan.name === "string" ? plan.name : ""}
                </h3>
                <p
                  className="mt-2 font-[var(--font-display)] text-4xl font-bold"
                  data-price-monthly={typeof plan.price === "string" ? plan.price : undefined}
                  data-price-yearly={typeof plan.priceYearly === "string" ? plan.priceYearly : undefined}
                >
                  {typeof plan.price === "string" ? plan.price : ""}
                </p>
                {typeof plan.period === "string" && plan.period !== "" && (
                  <p className="text-sm text-[var(--fg-muted)]">{plan.period}</p>
                )}
                {Array.isArray(plan.features) && (
                  <ul className="mt-4 flex flex-col gap-2">
                    {plan.features.map((feature: unknown, featureIndex: number) => (
                      <li key={featureIndex}>✓ {typeof feature === "string" ? feature : ""}</li>
                    ))}
                  </ul>
                )}
                {target && (
                  <a
                    href={target.href}
                    target={target.target}
                    rel={target.rel}
                    data-broken-link={target.broken ? "" : undefined}
                    className="mt-6 block rounded-full bg-[var(--accent)] px-6 py-3 text-center font-semibold text-[var(--accent-ink)]"
                  >
                    {typeof plan.ctaLabel === "string" ? plan.ctaLabel : ""}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </SectionShell>
  );
}
