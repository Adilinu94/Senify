import type { Node, PropValue } from "@senify/section-sdk";
import {
  alignBlockStyle,
  alignStyle,
  columnsClass,
  contentWidthClass,
  cx,
  gapStyle,
  headingStyle,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";
import { CardView, type CardData } from "./Card.tsx";

type ItemTemplate = { variant: string; styleProps: Record<string, PropValue> };
type PageInfo = { current: number; count: number; urls: string[] };

function readItems(value: PropValue | undefined): CardData[] {
  if (!Array.isArray(value)) return [];
  const items: CardData[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const props = record.props;
    if (typeof record.variant !== "string" || !props || typeof props !== "object") {
      continue;
    }
    items.push({
      variant: record.variant,
      props: props as Record<string, PropValue>,
    });
  }
  return items;
}

function readTemplate(value: PropValue | undefined): ItemTemplate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.variant !== "string") return undefined;
  const styleProps = record.styleProps;
  return {
    variant: record.variant,
    styleProps:
      styleProps && typeof styleProps === "object" && !Array.isArray(styleProps)
        ? (styleProps as Record<string, PropValue>)
        : {},
  };
}

function readPageInfo(value: PropValue | undefined): PageInfo | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.current !== "number" || !Array.isArray(record.urls)) {
    return undefined;
  }
  return {
    current: record.current,
    count: typeof record.count === "number" ? record.count : record.urls.length,
    urls: record.urls.filter((url): url is string => typeof url === "string"),
  };
}

// Renders the items the engine prefetched into `props.items` (a list of
// resolved card props) with the `item` slot's card as the template for variant
// and style props. `pageInfo` carries the pagination links baked per page.
export function CollectionList({ node, ctx }: SectionProps): React.JSX.Element {
  const items = readItems(node.props.items);
  const emptyText = str(node.props.emptyText);
  const pageInfo = readPageInfo(node.props.pageInfo);
  const template = readTemplate(node.props.itemTemplate);
  const variant = node.variant ?? "cards";
  const listClass =
    variant === "list"
      ? "mt-10 flex flex-col gap-4"
      : variant === "grid"
        ? cx("mt-10 grid gap-6", columnsClass(node, "md:grid-cols-3"))
        : cx("mt-10 grid gap-6", columnsClass(node, "sm:grid-cols-2 md:grid-cols-3"));
  const cardNode = (item: CardData): Node => ({
    id: `${node.id}:item`,
    type: "card",
    variant: template?.variant ?? item.variant,
    props: template?.styleProps ?? {},
  });
  return (
    <SectionShell node={node} section="collection-list">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[family-name:var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        {str(node.props.intro) !== "" && (
          <p
            className="mt-3 max-w-2xl text-lg text-[var(--fg-muted)]"
            style={alignBlockStyle(node)}
          >
            {str(node.props.intro)}
          </p>
        )}
        {items.length === 0 ? (
          emptyText !== "" && (
            <p className="mt-10 text-[var(--fg-muted)]" data-list-empty>
              {emptyText}
            </p>
          )
        ) : (
          <ul className={listClass} style={gapStyle(node)}>
            {items.map((item, index) => (
              <li key={index} data-list-item>
                <CardView node={cardNode(item)} props={item.props} ctx={ctx} />
              </li>
            ))}
          </ul>
        )}
        {pageInfo !== undefined && pageInfo.count > 1 && (
          <nav className="mt-10 flex flex-wrap gap-2" aria-label="Seiten">
            {pageInfo.urls.map((url, index) => (
              <a
                key={url}
                href={url}
                aria-current={index + 1 === pageInfo.current ? "page" : undefined}
                className="rounded border border-[var(--line)] px-3 py-1 text-sm"
              >
                {index + 1}
              </a>
            ))}
          </nav>
        )}
      </div>
    </SectionShell>
  );
}
