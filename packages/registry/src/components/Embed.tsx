import { SectionShell, str, type SectionProps } from "./shared.tsx";

export function Embed({ node }: SectionProps): React.JSX.Element {
  const url = str(node.props.url);
  const aspect = typeof node.props.aspect === "string" ? node.props.aspect : "16/9";
  const title = str(node.props.title, "Eingebetteter Inhalt");
  if (!url.startsWith("https://")) {
    return (
      <SectionShell node={node} section="embed">
        <p data-embed-blocked className="mx-auto max-w-6xl px-4 py-8 text-[var(--danger)]">
          Embed blockiert: URL muss mit https:// beginnen.
        </p>
      </SectionShell>
    );
  }
  return (
    <SectionShell node={node} section="embed">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <iframe
          src={url}
          title={title}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          style={{ aspectRatio: aspect.replace("/", " / ") }}
          className="w-full rounded-[var(--radius-lg)] border border-[var(--line)]"
          allowFullScreen
        />
      </div>
    </SectionShell>
  );
}
