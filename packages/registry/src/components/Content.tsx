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
  return (
    <SectionShell node={node} section="content">
      <div className={cx("mx-auto px-4 py-12", contentWidthClass(node, "max-w-3xl"))}>
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
            className="prose mt-6"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
          />
        )}
      </div>
    </SectionShell>
  );
}
