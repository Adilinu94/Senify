import { describe, expect, it } from "vitest";
import { renderDomWidget, stepWidgetProps } from "@senify/widget-engine/dom-widgets";

describe("DOM widget renderer", () => {
  it("renders the navbar with brand, links, mail and mobile toggle", () => {
    const html = renderDomWidget("framer-navbar", {
      links: [{ label: "Projekte", link: "/projects" }],
      email: "adrian@nick-webdesign.de",
      ctaLabel: "WhatsApp",
      ctaLink: "https://example.com/whatsapp",
    });
    expect(html).toContain("NICK WEBDESIGN");
    expect(html).toContain("Projekte");
    expect(html).toContain("adrian@nick-webdesign.de");
    expect(html).toContain('data-wf-part="toggle"');
    expect(html).toContain('data-wf-part="panel"');
  });

  it("renders the footer with the source headline, consent form and legal links", () => {
    const html = renderDomWidget("framer-footer", {
      formUrl: "https://embed.fillout.com/t/aDdzczda8Mus",
      formText: "Beim Laden werden Daten an Fillout übertragen.",
      legalLinks: [
        { label: "Impressum", link: "/impressum" },
        { label: "Datenschutzerklärung", link: "/datenschutz" },
      ],
    });
    expect(html).toContain("Bereit für deine neue Website?");
    expect(html).toContain("Unverbindliches Anfrageformular");
    expect(html).toContain("Beim Laden werden Daten an Fillout übertragen.");
    expect(html).toContain('data-wf-part="form-slot"');
    expect(html).toContain('data-wf-part="form-load"');
    expect(html).not.toContain("embed.fillout.com");
    expect(html).toContain("Impressum");
    expect(html).toContain("Datenschutzerklärung");
    expect(html).toContain("w-framer-footer__root");
  });

  it("renders a step with number, service tag, description and points", () => {
    const html = renderDomWidget("framer-step", {
      nr: "04",
      title: "SEO",
      text: "Ich optimiere deine Website.",
      points: [{ label: "Klare Texte:", text: "Verständlich." }],
    });
    expect(html).toContain("SEO");
    expect(html).toContain("/</span> 04");
    expect(html).toContain("Ich optimiere deine Website.");
    expect(html).toContain("Klare Texte:");
    expect(html).toContain("Verständlich.");
  });

  it("renders each review twice for the seamless ticker loop", () => {
    const html = renderDomWidget("framer-reviews", {
      items: [
        { rating: "4.5", author: "Markus B.", quote: "Sehr gut." },
        { rating: "5.0", author: "Julia S.", quote: "Top Arbeit." },
      ],
    });
    expect(html.match(/data-wf-part="review"/g)).toHaveLength(4);
    expect(html).toContain("Markus B.");
    expect(html).toContain("Julia S.");
    expect(html).toContain("w-framer-reviews__track");
  });

  it("escapes text and refuses unsafe links", () => {
    const html = renderDomWidget("framer-footer", {
      headline: "<script>alert(1)</script>",
      formUrl: "javascript:alert(1)",
      legal: "A & B",
    });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("A &amp; B");
  });

  it("returns an empty string for an unknown widget type", () => {
    expect(renderDomWidget("does-not-exist", {})).toBe("");
  });
});

describe("stepWidgetProps", () => {
  it("reads number, service, description and label/text pairs in attribute order", () => {
    const props = stepWidgetProps({
      nodeId: "n1",
      componentId: "c1",
      variant: "v1",
      width: "1fr",
      bX2k7i8KF: "01",
      yZHv_GG83: "Webdesign",
      w6CmAD70q: "Ich gestalte Webseiten.",
      OeIjJnRBW: "Klare Layouts:",
      sKx8k4n0v: "Ruhige Farben.",
      E1qrAJV48: "Responsiv:",
      z2Z90THvs: "Auf jedem Gerät.",
      ZSCCsqyo9: "",
    });
    expect(props).toEqual({
      nr: "01",
      title: "Webdesign",
      text: "Ich gestalte Webseiten.",
      points: [
        { label: "Klare Layouts:", text: "Ruhige Farben." },
        { label: "Responsiv:", text: "Auf jedem Gerät." },
      ],
    });
  });

  it("falls back to the catalog defaults when the instance has no content", () => {
    expect(stepWidgetProps({ nodeId: "n1", componentId: "c1", width: "1fr" })).toEqual({});
  });
});
