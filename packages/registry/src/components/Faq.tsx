import {
  alignStyle,
  cardStyle,
  contentWidthClass,
  cx,
  gapStyle,
  headingStyle,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Faq({ node }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    q?: unknown;
    a?: unknown;
  }[];
  return (
    <SectionShell node={node} section="faq">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node, "max-w-3xl"))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[family-name:var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        <div
          data-island="accordion"
          className="mt-8 flex flex-col gap-3"
          style={gapStyle(node)}
        >
          {items.map((item, index) => (
            <details
              key={index}
              className="border"
              style={cardStyle(node, { padding: "1rem 1.25rem" })}
            >
              <summary className="cursor-pointer font-semibold">
                {typeof item.q === "string" ? item.q : ""}
              </summary>
              <p className="mt-2 text-[var(--fg-muted)]">
                {typeof item.a === "string" ? item.a : ""}
              </p>
            </details>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

export function faqJsonLd(node: {
  props: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  const items = node.props.items;
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const mainEntity: Record<string, unknown>[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== "object") return undefined;
    const record = entry as Record<string, unknown>;
    if (typeof record.q !== "string" || typeof record.a !== "string") return undefined;
    mainEntity.push({
      "@type": "Question",
      name: record.q,
      acceptedAnswer: { "@type": "Answer", text: record.a },
    });
  }
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity };
}
