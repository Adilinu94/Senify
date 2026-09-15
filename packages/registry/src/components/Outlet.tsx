import { SectionShell, str, type SectionProps } from "./shared.tsx";

// A splice placeholder. The bake replaces the first outlet of a layout with
// the page content and the first outlet of an entry template with the article;
// an outlet that stays unfilled renders as an empty, marked block.
export function Outlet({ node }: SectionProps): React.JSX.Element {
  const hint = str(node.props.hint);
  return (
    <SectionShell node={node} section="outlet">
      <div
        data-outlet="empty"
        className={
          node.variant === "boxed"
            ? "mx-auto my-4 max-w-3xl rounded border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--fg-muted)]"
            : "px-4 py-8 text-center text-sm text-[var(--fg-muted)]"
        }
      >
        {hint}
      </div>
    </SectionShell>
  );
}
