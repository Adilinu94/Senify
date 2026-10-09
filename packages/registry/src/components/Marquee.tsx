import {
  cx,
  imageSizes,
  mediaStyle,
  resolveAsset,
  ResponsiveImage,
  SectionShell,
  type SectionProps,
} from "./shared.tsx";

export function Marquee({ node, ctx }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    text?: unknown;
    asset?: unknown;
  }[];
  const speed = typeof node.props.speed === "number" ? node.props.speed : 5;
  const direction = node.props.direction === "right" ? "reverse" : "normal";
  const duration = `${(11 - Math.min(10, Math.max(1, speed))) * 4}s`;
  // `text` (and a section without a variant) is the claim ticker. `logos` is a
  // quiet band of small greyed-out marks, `images` a tall photo strip; in both
  // an item without an asset falls back to its text in a matching treatment.
  const logos = node.variant === "logos";
  const images = node.variant === "images";
  const track = (hidden: boolean): React.JSX.Element => (
    <ul
      aria-hidden={hidden || undefined}
      className="marquee-track"
      style={{ animationDuration: duration, animationDirection: direction }}
    >
      {items.map((item, index) => {
        const asset = resolveAsset(item.asset, ctx);
        const text = typeof item.text === "string" ? item.text : "";
        return (
          <li
            key={index}
            className={
              logos
                ? "mx-10 flex items-center whitespace-nowrap"
                : images
                  ? "mx-2 flex items-center whitespace-nowrap"
                  : "mx-6 whitespace-nowrap font-[family-name:var(--font-display)] text-xl font-bold"
            }
          >
            {asset ? (
              <ResponsiveImage
                asset={asset}
                alt={text}
                sizes={imageSizes(node)}
                className={cx(
                  images ? "h-40 w-auto object-cover" : "h-8 w-auto",
                  logos && "opacity-70 grayscale",
                )}
                style={mediaStyle(node, images ? undefined : "0px")}
              />
            ) : logos ? (
              <span className="text-sm font-semibold uppercase tracking-widest text-[var(--fg-muted)]">
                {text}
              </span>
            ) : images ? (
              <span className="border border-[var(--line)] px-4 py-2 text-sm">{text}</span>
            ) : (
              <span>{text}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
  return (
    <SectionShell node={node} section="marquee">
      <div
        data-marquee
        className={cx(
          "marquee overflow-hidden",
          logos && "py-6",
          images && "py-2",
          !logos && !images && "border-y border-[var(--line)] py-4",
        )}
      >
        {track(false)}
        {track(true)}
      </div>
    </SectionShell>
  );
}
