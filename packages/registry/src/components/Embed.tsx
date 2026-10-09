import { externalHost, GatedIframe, needsConsent } from "./ConsentGate.tsx";
import { contentWidthClass, cx, mediaStyle, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Embed({ node, ctx }: SectionProps): React.JSX.Element {
  const url = str(node.props.url);
  const aspect = typeof node.props.aspect === "string" ? node.props.aspect : "16/9";
  const title = str(node.props.title, "Eingebetteter Inhalt");
  // `iframe` is the plain frame. `social` narrows it to a post-sized column,
  // since feeds and posts are laid out for a phone width; an explicit content
  // width still wins. `map` adds a link under the frame, because a small map is
  // hard to use and the visitor often wants it full size. The link only opens
  // the address, so the consent gate below still decides when the frame loads.
  const social = node.variant === "social";
  const map = node.variant === "map";
  const host = externalHost(url);
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
      <div className={cx("mx-auto px-4 py-8", contentWidthClass(node, social ? "max-w-xl" : "max-w-6xl"))}>
        {node.props.requireConsent !== false && needsConsent(url, ctx) ? (
          <GatedIframe
            src={url}
            title={title}
            iframeProps={{
              loading: "lazy",
              sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
              className: "w-full border border-[var(--line)]",
              allowFullScreen: true,
            }}
            style={{ aspectRatio: aspect.replace("/", " / "), ...mediaStyle(node) }}
          />
        ) : (
        <iframe
          src={url}
          title={title}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          style={{ aspectRatio: aspect.replace("/", " / "), ...mediaStyle(node) }}
          className="w-full border border-[var(--line)]"
          allowFullScreen
        />
        )}
        {map && host !== undefined && (
          <p className="mt-2 text-sm">
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
              Karte auf {host} in voller Größe öffnen
            </a>
          </p>
        )}
      </div>
    </SectionShell>
  );
}
