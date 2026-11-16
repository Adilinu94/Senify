import { describe, expect, it } from "vitest";
import { captureHtml } from "../src/capture-html.ts";
import { importAssets } from "../src/assets.ts";
import { mapDocument, normalize } from "../src/index.ts";

const page = (body: string): string =>
  `<html lang="en"><head><title>t</title></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

const NETWORK_IMAGE = "https://framerusercontent.com/images/too-big.gif?width=1080&height=1920";

// The source address of a picture stays an address.
//
// Measured on the imported origin home (14.11.2026): one GIF is 40 MB, the
// engine accepts 25 MB per upload. The upload failed and the run kept the CDN
// address — which is fine as long as everything downstream reads it as an
// address and not as a reference to a stored asset.
describe("a picture whose upload failed", () => {
  it("keeps the source address in the asset prop", () => {
    const document = captureHtml({ html: page(`<img alt="Motiv" src="${NETWORK_IMAGE}">`) });
    // No uploader: the same state a failed upload leaves behind — the source
    // address with `assetId: null`.
    const mapped = mapDocument(document, normalize(document).rules);
    const image = Object.entries(mapped.document.nodes).find(
      ([, node]) => (node as { primitive?: string }).primitive === "image",
    );
    expect(image).toBeDefined();
    const props = (image?.[1] as { props?: Record<string, unknown> }).props ?? {};
    expect(props["asset"]).toEqual({ assetId: NETWORK_IMAGE });
  });

  it("names the failed download in the report", async () => {
    const document = captureHtml({ html: page(`<img alt="Motiv" src="${NETWORK_IMAGE}">`) });
    const result = await importAssets({
      document,
      includeFonts: false,
      uploader: () => {
        throw new Error("File exceeds the upload limit of 26214400 bytes");
      },
    });
    const finding = result.document.findings.find(
      (entry) => entry.kind === "asset-blocked" && entry.message.includes("Bild"),
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("warn");
    expect(result.report.failed).toBe(1);
    expect(result.report.downloads).toEqual([]);
  });
});
