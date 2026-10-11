import type { CSSProperties } from "react";
import type { SectionContext } from "./shared.tsx";

// Third-party content (maps, videos, social widgets) loads only after the
// visitor agrees. In the baked page an external iframe is rendered without a
// `src`: the address waits in `data-consent-src`, a placeholder explains what
// would be loaded, and the islands script loads it on a click or when the
// visitor accepted in the cookie notice. Without JavaScript the placeholder
// still offers a plain link to the source, and nothing is fetched.
//
// The editor canvas does not set `ctx.gateEmbeds` and keeps showing the live
// content, so a designer sees what the visitor will get after consenting.

// "https://www.youtube.com/embed/x" -> "www.youtube.com"; relative or broken
// addresses have no external host.
export function externalHost(url: string): string | undefined {
  if (!/^https?:\/\//i.test(url)) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export function needsConsent(url: string, ctx: SectionContext): boolean {
  return ctx.gateEmbeds === true && externalHost(url) !== undefined;
}

export function GatedIframe({
  src,
  title,
  iframeProps,
  style,
}: {
  src: string;
  title: string;
  iframeProps: Record<string, unknown>;
  style?: CSSProperties;
}): React.JSX.Element {
  const host = externalHost(src) ?? "";
  return (
    <>
      <iframe
        {...iframeProps}
        title={title}
        data-consent-src={src}
        hidden
        style={{ ...style, display: "none" }}
      />
      <div
        data-consent-placeholder
        role="group"
        aria-label={`Externer Inhalt von ${host}`}
        className="flex w-full flex-col items-center justify-center gap-3 border border-[var(--line)] bg-[var(--bg-muted)] p-6 text-center text-sm"
        style={{ minHeight: "12rem", ...(style?.aspectRatio === undefined ? {} : { aspectRatio: style.aspectRatio }) }}
      >
        <p className="max-w-md">
          Dieser Inhalt kommt von {host}. Beim Laden werden Daten, zum Beispiel deine IP-Adresse, an {host} übertragen.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            data-consent-load
            className="border border-[var(--line)] bg-[var(--bg-base)] px-4 py-2 font-semibold"
          >
            Inhalt laden
          </button>
          <a href={src} target="_blank" rel="noopener noreferrer" className="underline">
            Auf {host} öffnen
          </a>
        </div>
      </div>
    </>
  );
}
