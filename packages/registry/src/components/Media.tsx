import {
  contentWidthClass,
  cx,
  focalStyle,
  mediaStyle,
  resolveAsset,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Media({ node, ctx }: SectionProps): React.JSX.Element {
  const asset = resolveAsset(node.props.asset, ctx);
  const aspect = typeof node.props.aspect === "string" ? node.props.aspect : "16/9";
  const caption = str(node.props.caption);
  const videoUrl = str(node.props.videoUrl);
  const safeVideo = videoUrl.startsWith("https://") ? videoUrl : "";
  return (
    <SectionShell node={node} section="media">
      <figure className={cx("mx-auto px-4 py-8", contentWidthClass(node))}>
        {node.variant === "video" && safeVideo !== "" ? (
          <video
            src={safeVideo}
            controls
            playsInline
            preload="metadata"
            style={{ aspectRatio: aspect.replace("/", " / "), ...mediaStyle(node) }}
            className="w-full bg-[var(--bg-muted)]"
          />
        ) : node.variant === "3d-scene" ? (
          <div
            data-island="webgl-scene"
            data-scene={str(node.props.scene)}
            style={{ aspectRatio: aspect.replace("/", " / "), ...mediaStyle(node) }}
            className="flex w-full items-center justify-center bg-[var(--bg-muted)]"
          >
            <canvas aria-label="3D-Szene" />
          </div>
        ) : asset ? (
          <img
            src={asset.src}
            alt={caption !== "" ? caption : "Bild"}
            loading="lazy"
            data-missing-asset={asset.missing ? "" : undefined}
            style={{
              aspectRatio: aspect.replace("/", " / "),
              ...focalStyle(node.props.asset),
              ...mediaStyle(node),
            }}
            className="w-full object-cover"
          />
        ) : null}
        {caption !== "" && (
          <figcaption className="mt-3 text-center text-sm text-[var(--fg-muted)]">
            {caption}
          </figcaption>
        )}
      </figure>
    </SectionShell>
  );
}
