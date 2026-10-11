import {
  alignBlockStyle,
  buttonStyle,
  cardStyle,
  contentWidthClass,
  cx,
  gapStyle,
  headingStyle,
  resolveLink,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

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
  type Plan = (typeof plans)[number];
  const variant = node.variant;
  const planName = (plan: Plan): string => (typeof plan.name === "string" ? plan.name : "");
  const planFeatures = (plan: Plan): string[] =>
    Array.isArray(plan.features)
      ? plan.features.map((feature: unknown) => (typeof feature === "string" ? feature : ""))
      : [];
  const price = (plan: Plan, className: string): React.JSX.Element => (
    <p
      className={className}
      data-price-monthly={typeof plan.price === "string" ? plan.price : undefined}
      data-price-yearly={typeof plan.priceYearly === "string" ? plan.priceYearly : undefined}
    >
      {typeof plan.price === "string" ? plan.price : ""}
    </p>
  );
  const period = (plan: Plan): React.JSX.Element | null =>
    typeof plan.period === "string" && plan.period !== "" ? (
      <p className="text-sm text-[var(--fg-muted)]">{plan.period}</p>
    ) : null;
  const cta = (plan: Plan, className: string): React.JSX.Element | null => {
    const target = resolveLink(plan.ctaLink, ctx);
    if (!target) return null;
    return (
      <a
        href={target.href}
        target={target.target}
        rel={target.rel}
        data-broken-link={target.broken ? "" : undefined}
        className={className}
        style={buttonStyle(node)}
      >
        {typeof plan.ctaLabel === "string" ? plan.ctaLabel : ""}
      </a>
    );
  };
  const highlightTint = "color-mix(in srgb, var(--accent) 8%, transparent)";

  // plans-3: one card per plan side by side.
  const cards = (
    <ul className="mt-10 grid gap-6 md:grid-cols-3" style={gapStyle(node)}>
      {plans.map((plan, index) => (
        <li
          key={index}
          className={plan.highlighted === true ? "border-2" : "border"}
          style={cardStyle(node, {
            border: plan.highlighted === true ? "var(--accent)" : "var(--line)",
          })}
        >
          <h3 className="text-lg font-semibold">{planName(plan)}</h3>
          {price(plan, "mt-2 font-[family-name:var(--font-display)] text-4xl font-bold")}
          {period(plan)}
          {Array.isArray(plan.features) && (
            <ul className="mt-4 flex flex-col gap-2">
              {planFeatures(plan).map((feature, featureIndex) => (
                <li key={featureIndex}>✓ {feature}</li>
              ))}
            </ul>
          )}
          {cta(plan, "mt-6 block px-6 py-3 text-center font-semibold")}
        </li>
      ))}
    </ul>
  );

  // comparison: one table, the features of all plans as rows.
  const featureRows: string[] = [];
  for (const plan of plans) {
    for (const feature of planFeatures(plan)) {
      if (feature !== "" && !featureRows.includes(feature)) featureRows.push(feature);
    }
  }
  const comparison = (
    <div className="mt-10 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Leistung</span>
            </th>
            {plans.map((plan, index) => (
              <th
                key={index}
                scope="col"
                className="px-4 pb-4 align-bottom"
                style={plan.highlighted === true ? { backgroundColor: highlightTint } : undefined}
              >
                <span className="block text-lg font-semibold">{planName(plan)}</span>
                {price(plan, "font-[family-name:var(--font-display)] text-3xl font-bold")}
                {period(plan)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {featureRows.map((feature, rowIndex) => (
            <tr key={rowIndex} className="border-t" style={{ borderColor: "var(--line)" }}>
              <th scope="row" className="px-4 py-3 font-normal">
                {feature}
              </th>
              {plans.map((plan, index) => (
                <td
                  key={index}
                  className="px-4 py-3"
                  style={plan.highlighted === true ? { backgroundColor: highlightTint } : undefined}
                >
                  {planFeatures(plan).includes(feature) ? (
                    <>
                      <span aria-hidden>✓</span>
                      <span className="sr-only">Enthalten</span>
                    </>
                  ) : (
                    <>
                      <span aria-hidden className="text-[var(--fg-muted)]">
                        –
                      </span>
                      <span className="sr-only">Nicht enthalten</span>
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t" style={{ borderColor: "var(--line)" }}>
            <td />
            {plans.map((plan, index) => (
              <td
                key={index}
                className="px-4 py-4"
                style={plan.highlighted === true ? { backgroundColor: highlightTint } : undefined}
              >
                {cta(plan, "block px-5 py-2.5 text-center font-semibold")}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );

  // simple: no cards, one ruled row per plan.
  const simple = (
    <ul className="mx-auto mt-10 flex max-w-4xl flex-col" style={gapStyle(node)}>
      {plans.map((plan, index) => (
        <li
          key={index}
          className="flex flex-col gap-4 border-t py-6 md:flex-row md:items-center md:justify-between"
          style={{ borderColor: plan.highlighted === true ? "var(--accent)" : "var(--line)" }}
        >
          <div className="md:w-1/3">
            <h3 className="text-lg font-semibold">{planName(plan)}</h3>
            {price(plan, "mt-1 font-[family-name:var(--font-display)] text-3xl font-bold")}
            {period(plan)}
          </div>
          {Array.isArray(plan.features) && (
            <ul className="flex flex-1 flex-col gap-1 text-[var(--fg-muted)]">
              {planFeatures(plan).map((feature, featureIndex) => (
                <li key={featureIndex}>✓ {feature}</li>
              ))}
            </ul>
          )}
          {cta(plan, "block px-6 py-3 text-center font-semibold md:shrink-0")}
        </li>
      ))}
    </ul>
  );
  return (
    <SectionShell node={node} section="pricing">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2 className="text-center font-[family-name:var(--font-display)] text-3xl font-bold" style={headingStyle(node)}>
            {str(node.props.title)}
          </h2>
        )}
        {str(node.props.intro) !== "" && (
          <p
            className="mx-auto mt-3 max-w-2xl text-center text-lg text-[var(--fg-muted)]"
            style={alignBlockStyle(node)}
          >
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
        {variant === "comparison" ? comparison : variant === "simple" ? simple : cards}
      </div>
    </SectionShell>
  );
}
