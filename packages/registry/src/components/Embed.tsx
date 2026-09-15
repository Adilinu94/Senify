import { contentWidthClass, cx, mediaStyle, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Embed({ node }: SectionProps): React.JSX.Element {
  const url = str(node.props.url);
  const aspect = typeof node.props.aspect === "string" ? node.props.aspect : "16/9";
  const title = str(node.props.title, "Eingebetteter Inhalt");
  if (!url.startsWith("https://")) {
    return (
      <SectionShell node={node} section="embed">
        <p
          data-embed-blocked
          className={cx("mx-auto px-4 py-8 text-[var(--danger)]", contentWidthClass(node))}
        >
          Embed blockiert: URL muss mit https:// beginnen.
        </p>
      </SectionShell>
    );
  }
  return (
    <SectionShell node={node} section="embed">
      <div className={cx("mx-auto px-4 py-8", contentWidthClass(node))}>
        <iframe
          src={url}
          title={title}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          style={{ aspectRatio: aspect.replace("/", " / "), ...mediaStyle(node) }}
          className="w-full border border-[var(--line)]"
          allowFullScreen
        />
      </div>
    </SectionShell>
  );
}
