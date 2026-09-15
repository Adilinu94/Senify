import { SectionShell, styleValue, type SectionProps } from "./shared.tsx";

const SPACING_REM: Record<string, string> = {
  xs: "0.5rem",
  s: "1rem",
  m: "2rem",
  l: "4rem",
  xl: "8rem",
};

export function Divider({ node }: SectionProps): React.JSX.Element {
  const spacing = typeof node.props.spacing === "string" ? node.props.spacing : "m";
  const height = SPACING_REM[spacing] ?? "2rem";
  const color = styleValue(node.props.color);
  if (node.variant === "space") {
    return (
      <SectionShell node={node} section="divider">
        <div aria-hidden style={{ height }} />
      </SectionShell>
    );
  }
  if (node.variant === "dots") {
    return (
      <SectionShell node={node} section="divider">
        <div aria-hidden className="flex justify-center gap-2" style={{ padding: `${height} 0` }}>
          <span>•</span>
          <span>•</span>
          <span>•</span>
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell node={node} section="divider">
      <div className="mx-auto max-w-6xl px-4" style={{ paddingTop: height, paddingBottom: height }}>
        <hr
          style={color ? { borderColor: color } : undefined}
          className="border-t border-[var(--line)]"
        />
      </div>
    </SectionShell>
  );
}
