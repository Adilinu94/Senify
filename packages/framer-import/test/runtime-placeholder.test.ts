import { describe, expect, it } from "vitest";
import { captureHtml } from "../src/index.ts";

// A container the SSR leaves EMPTY and the page's runtime fills in the browser
// (measured on `unifiersofjapan` and `donutshop`, 24.10.2026).
//
// The Framer SSR does not render code components; it writes a placeholder and
// lets the hydrated runtime fill it. Counted on the live pages:
//
//   unifiersofjapan  `<div style="height:100%;width:100%"></div>`      15x
//                    `viewBox="0 0 524 676"`  SSR 0  rendered DOM 4
//   donutshop        `<div style="display:contents"></div>`             9x
//                    `viewBox="0 0 256 256"`  SSR 0  rendered DOM 3
//
// The import can only read what the SSR gives, so the container stays empty -
// that part is a boundary of the source, not a bug. What IS a bug is that the
// report said nothing: the page came out with 15 empty boxes and no finding
// explained them. `unsupported-declaration` counted 19 unrelated declarations.
//
// The capture now names each placeholder: kind `code-component`, severity
// `info` (the page still renders, the runtime fills it), with the signature as
// evidence so the reader can find the element in the source.

function page(inner: string): string {
  return `<html lang="de"><head><title>t</title></head><body>
    <div id="main" data-framer-hydrate-v2>
      ${inner}
    </div>
  </body></html>`;
}

describe("a placeholder the runtime fills", () => {
  it("names the height/width placeholder as a code component", () => {
    const document = captureHtml({
      html: page(
        `<div class="framer-1o5jq28" data-framer-name="Castle Siege Warfare">
           <div class="framer-h9s2h3-container" data-framer-name="frame">
             <div style="height:100%;width:100%"></div>
           </div>
         </div>`,
      ),
      url: "https://example.test/",
      pagePath: "/",
    });
    const findings = document.findings.filter((finding) => finding.kind === "code-component");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("info");
    expect(findings[0]?.evidence).toContain("height:100%;width:100%");
    // The message says WHAT is missing and WHO fills it, not just "empty".
    expect(findings[0]?.message).toContain("Runtime");
  });

  it("names the display:contents placeholder as well", () => {
    const document = captureHtml({
      html: page(
        `<div class="framer-3ndf10-container" data-framer-name="Rating">
           <div style="display:contents"></div>
         </div>`,
      ),
      url: "https://example.test/",
      pagePath: "/",
    });
    const findings = document.findings.filter((finding) => finding.kind === "code-component");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toContain("display:contents");
  });

  it("does not fire on an element that merely has no text", () => {
    // A pure layout box (no placeholder signature) is not a code component.
    const document = captureHtml({
      html: page(
        `<div class="framer-abc" data-framer-name="Spacer">
           <div style="height:24px;width:100%"></div>
         </div>`,
      ),
      url: "https://example.test/",
      pagePath: "/",
    });
    expect(document.findings.filter((finding) => finding.kind === "code-component")).toHaveLength(0);
  });

  it("counts several placeholders as one finding with their number", () => {
    const placeholder = `<div class="framer-x-container"><div style="height:100%;width:100%"></div></div>`;
    const document = captureHtml({
      html: page(`<div class="framer-section">${placeholder}${placeholder}${placeholder}</div>`),
      url: "https://example.test/",
      pagePath: "/",
    });
    const findings = document.findings.filter((finding) => finding.kind === "code-component");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("3");
  });

  it("says nothing on a page without placeholders", () => {
    const document = captureHtml({
      html: page(`<div class="framer-abc"><p>Nur Text</p></div>`),
      url: "https://example.test/",
      pagePath: "/",
    });
    expect(document.findings.filter((finding) => finding.kind === "code-component")).toHaveLength(0);
  });
});
