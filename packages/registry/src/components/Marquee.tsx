import { mediaStyle, resolveAsset, SectionShell, type SectionProps } from "./shared.tsx";

export function Marquee({ node, ctx }: SectionProps): React.JSX.Element {
  const items = (Array.isArray(node.props.items) ? node.props.items : []) as {
    text?: unknown;
    asset?: unknown;
  }[];
  const speed = typeof node.props.speed === "number" ? node.props.speed : 5;
  const direction = node.props.direction === "right" ? "reverse" : "normal";
  const duration = `${(11 - Math.min(10, Math.max(1, speed))) * 4}s`;
  const track = (hidden: boolean): React.JSX.Element => (
    <ul
      aria-hidden={hidden || undefined}
      className="marquee-track"
      style={{ animationDuration: duration, animationDirection: direction }}
    >
      {items.map((item, index) => {
        const asset = resolveAsset(item.asset, ctx);
        return (
          <li key={index} className="mx-6 whitespace-nowrap font-[var(--font-display)] text-xl font-bold">
            {asset ? (
              <img
                src={asset.src}
                alt={typeof item.text === "string" ? item.text : ""}
                loading="lazy"
                data-missing-asset={asset.missing ? "" : undefined}
                className="h-8 w-auto"
                style={mediaStyle(node, "0px")}
              />
            ) : (
              <span>{typeof item.text === "string" ? item.text : ""}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
  return (
    <SectionShell node={node} section="marquee">
      <div data-marquee className="marquee overflow-hidden border-y border-[var(--line)] py-4">
        {track(false)}
        {track(true)}
      </div>
    </SectionShell>
  );
}
