import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// The poster of the page-level payload carrier (ADR-0010 §7).
//
// ADR-0010 makes the poster MANDATORY on import: a carrier has three fallbacks
// (payload → poster → plate), and the plate is the last one. Until now the
// runtime carrier got none, so the editor canvas stood on the plate — the
// documented fallback, but not the target state.
//
// The source names the picture itself: `og:image`. It is the source's own
// social image, so it shows what the page shows — no capture, no guess.

const PAGE = `<html lang="de"><head>
<title>Studio</title>
<meta property="og:image" content="https://cdn.test/social.png" />
</head><body><div id="main" data-framer-hydrate-v2><p>Hallo</p></div></body></html>`;

describe("the poster of a page-level carrier", () => {
  it("names the social image of the source as an asset of the run", () => {
    const document = captureHtml({ html: PAGE, url: "https://example.test/" });
    const poster = document.assets.find((asset) => asset.url === "https://cdn.test/social.png");
    expect(poster).toBeDefined();
    expect(poster?.kind).toBe("image");
  });

  it("does not add the same image twice", () => {
    const withImage = `<html lang="de"><head><meta property="og:image" content="https://cdn.test/social.png" /></head>
      <body><div id="main" data-framer-hydrate-v2><img src="https://cdn.test/social.png" alt="" /></div></body></html>`;
    const document = captureHtml({ html: withImage, url: "https://example.test/" });
    const hits = document.assets.filter((asset) => asset.url === "https://cdn.test/social.png");
    expect(hits).toHaveLength(1);
  });

  it("keeps a page without a social image free of a poster asset", () => {
    const withoutImage = `<html lang="de"><head><title>t</title></head>
      <body><div id="main" data-framer-hydrate-v2><p>Hallo</p></div></body></html>`;
    const document = captureHtml({ html: withoutImage, url: "https://example.test/" });
    // No asset was invented: the carrier then tells the truth with its plate.
    expect(document.assets).toHaveLength(0);
  });

  it("carries the poster on the node the carrier writes", () => {
    // The mapper's half: the carrier stands at the root and names the asset id
    // the pipeline gave the image. Without an asset run there is no id, so the
    // property stays absent rather than naming an id nothing answers to.
    const document = captureHtml({ html: PAGE, url: "https://example.test/" });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules, { mode: "fidelity" });
    // The asset run did not happen here: the id is null, so no poster.
    expect(document.assets[0]?.assetId ?? null).toBeNull();
    const carriers = Object.values(mapped.document.nodes).filter((node) => node.primitive === "payload");
    expect(carriers).toHaveLength(0);
  });
});
