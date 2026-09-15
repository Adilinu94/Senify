import type { Node, PropValue } from "@senify/section-sdk";
import {
  cardPaddingStyle,
  cardStyle,
  focalStyle,
  headingStyle,
  imageSizes,
  linkStyle,
  mediaStyle,
  resolveAsset,
  resolveLink,
  ResponsiveImage,
  SectionShell,
  str,
  type SectionContext,
  type SectionProps,
} from "./shared.tsx";

export type CardData = {
  variant: string;
  props: Record<string, PropValue>;
};

// One card body, shared by the standalone `card` section and the items a
// `collection-list` renders. `node` supplies variant and style props, `props`
// the (already binding-resolved) content.
export function CardView({
  node,
  props,
  ctx,
}: {
  node: Node;
  props: Record<string, PropValue>;
  ctx: SectionContext;
}): React.JSX.Element {
  const variant = node.variant ?? "image-top";
  const asset = resolveAsset(props.cover, ctx);
  const target = resolveLink(props.link, ctx);
  const tag = str(props.tag);
  const title = str(props.title);
  const text = str(props.text);
  const body = (
    <>
      {tag !== "" && (
        <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">
          {tag}
        </p>
      )}
      {title !== "" && (
        <h3 className="mt-2 text-xl font-semibold" style={headingStyle(node)}>
          {title}
        </h3>
      )}
      {text !== "" && <p className="mt-2 text-[var(--fg-muted)]">{text}</p>}
      {target && (
        <a
          href={target.href}
          target={target.target}
          rel={target.rel}
          data-broken-link={target.broken ? "" : undefined}
          className="mt-3 inline-block font-semibold text-[var(--accent)]"
          style={linkStyle(node)}
        >
          {title !== "" ? `${title} →` : "Ansehen →"}
        </a>
      )}
    </>
  );

  if (variant === "text") {
    return (
      <article className="border" style={cardStyle(node)}>
        {body}
      </article>
    );
  }
  if (variant === "horizontal") {
    return (
      <article
        className="flex items-stretch gap-4 overflow-hidden border"
        style={cardStyle(node)}
      >
        {asset && (
          <ResponsiveImage
            asset={asset}
            alt={title !== "" ? title : "Bild"}
            sizes="(min-width: 768px) 33vw, 100vw"
            className="h-full w-2/5 object-cover"
            style={{ ...mediaStyle(node, "0px"), ...focalStyle(props.cover) }}
          />
        )}
        <div className="min-w-0 flex-1">{body}</div>
      </article>
    );
  }
  return (
    <article
      className="overflow-hidden border"
      style={cardStyle(node, { padding: null })}
    >
      {asset && (
        <ResponsiveImage
          asset={asset}
          alt={title !== "" ? title : "Bild"}
          sizes={imageSizes(node)}
          className="aspect-[16/9] w-full object-cover"
          style={{ ...mediaStyle(node, "0px"), ...focalStyle(props.cover) }}
        />
      )}
      <div style={cardPaddingStyle(node)}>{body}</div>
    </article>
  );
}

export function Card({ node, ctx }: SectionProps): React.JSX.Element {
  return (
    <SectionShell node={node} section="card">
      <CardView node={node} props={node.props} ctx={ctx} />
    </SectionShell>
  );
}
