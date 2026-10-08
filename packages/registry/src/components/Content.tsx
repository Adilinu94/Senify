import { renderMarkdown } from "../md.ts";
import {
  alignStyle,
  contentWidthClass,
  cx,
  headingStyle,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function ContentSection({ node }: SectionProps): React.JSX.Element {
  const body = typeof node.props.body === "string" ? node.props.body : "";
  // `prose` is one narrow reading column, `columns` sets the body in two
  // newspaper columns, `highlight` lifts the text into an accent-ruled callout.
  const columns = node.variant === "columns";
  const highlight = node.variant === "highlight";
  return (
    <SectionShell node={node} section="content">
      <div
        className={cx(
          "mx-auto px-4 py-12",
          contentWidthClass(node, columns ? "max-w-5xl" : "max-w-3xl"),
        )}
      >
        <div
          className={highlight ? "border-l-4 py-2 pl-6 md:pl-8" : undefined}
          style={
            highlight
              ? {
                  borderColor: "var(--accent)",
                  backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)",
                }
              : undefined
          }
        >
          {str(node.props.title) !== "" && (
            <h2
              className="font-[family-name:var(--font-display)] text-3xl font-bold"
              style={{ ...headingStyle(node), ...alignStyle(node) }}
            >
              {str(node.props.title)}
            </h2>
          )}
          {str(node.props.intro) !== "" && (
            <p className="mt-4 text-lg text-[var(--fg-muted)]" style={alignStyle(node)}>
              {str(node.props.intro)}
            </p>
          )}
          {body !== "" && (
            <div
              className={cx("prose mt-6", columns && "gap-10 md:columns-2")}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
            />
          )}
        </div>
      </div>
    </SectionShell>
  );
}
