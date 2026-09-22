import { webglSceneEnabled, webglSceneIntensity, type Node } from "@senify/section-sdk";
import { cx, str } from "./shared.tsx";

// The render surface of the `webgl-scene` island (M6). The island script
// (`islands.js`) drives the canvas; the CSS poster behind it is the baseline:
// it stands without JS, without WebGL, under reduced motion and when the
// preset is switched off. The surface carries `data-island` — not the preset —
// so the island only ever drives surfaces that really render a scene.
export function WebglScene({
  node,
  className,
  style,
}: {
  node: Node;
  className?: string;
  style?: React.CSSProperties;
}): React.JSX.Element {
  const scene = str(node.props.scene) || "orb";
  const enabled = webglSceneEnabled(node);
  return (
    <div
      data-island={enabled ? "webgl-scene" : undefined}
      data-scene={scene}
      data-intensity={String(webglSceneIntensity(node))}
      style={{
        background:
          "radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 62%), var(--bg-muted)",
        ...style,
      }}
      className={cx("relative overflow-hidden", className)}
    >
      <canvas aria-hidden="true" className="absolute inset-0 h-full w-full" />
    </div>
  );
}
