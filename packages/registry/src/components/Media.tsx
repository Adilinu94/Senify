import {
  contentWidthClass,
  cx,
  focalStyle,
  imageSizes,
  mediaStyle,
  resolveAsset,
  ResponsiveImage,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";
import { WebglScene } from "./Scene.tsx";

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
          // The image doubles as the poster, so the player shows the chosen
          // still instead of a black frame until the visitor presses play.
          <video
            src={safeVideo}
            poster={asset && !asset.missing ? asset.src : undefined}
            controls
            playsInline
            preload="metadata"
            style={{ aspectRatio: aspect.replace("/", " / "), ...mediaStyle(node) }}
            className="w-full bg-[var(--bg-muted)]"
          />
        ) : node.variant === "3d-scene" ? (
          <WebglScene
            node={node}
            style={{ aspectRatio: aspect.replace("/", " / "), ...mediaStyle(node) }}
            className="w-full"
          />
        ) : asset ? (
          <ResponsiveImage
            asset={asset}
            alt={caption !== "" ? caption : "Bild"}
            sizes={imageSizes(node)}
            priority={ctx.priorityNodeId === node.id}
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
