import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Node } from "@senify/section-sdk";
import { SectionTree, type SectionContext } from "../src/components/index.ts";

function page(children: Node[]): { rootNodeId: string; nodes: Record<string, Node> } {
  const root = { id: "root0000", type: "page", props: {}, children: children.map((child) => child.id) } as unknown as Node;
  return { rootNodeId: root.id, nodes: Object.fromEntries([root, ...children].map((entry) => [entry.id, entry])) };
}

function render(children: Node[], ctx: Partial<SectionContext> = {}): string {
  const { rootNodeId, nodes } = page(children);
  return renderToStaticMarkup(
    createElement(SectionTree, { rootNodeId, nodes, ctx: { pagePaths: {}, assets: {}, ...ctx } }),
  );
}

const embed = (props: Record<string, unknown>): Node =>
  ({ id: "emb00000", type: "embed", variant: "iframe", props: { title: "Karte", ...props }, children: [] }) as unknown as Node;

const MAP = "https://www.google.com/maps/embed?pb=abc";

describe("external embeds wait for consent in the baked page", () => {
  it("renders no src, keeps the address aside and offers a placeholder", () => {
    const html = render([embed({ url: MAP })], { gateEmbeds: true });
    expect(html).toContain(`data-consent-src="${MAP}"`);
    expect(html).not.toMatch(/<iframe[^>]* src=/);
    expect(html).toContain("data-consent-placeholder");
    expect(html).toContain("data-consent-load");
    expect(html).toContain("www.google.com");
    // Without JavaScript the visitor can still follow a plain link.
    expect(html).toContain(`href="${MAP}"`);
  });

  it("hides the frame until it is loaded, whatever the stylesheet says", () => {
    const html = render([embed({ url: MAP })], { gateEmbeds: true });
    expect(html).toMatch(/<iframe[^>]* hidden=""[^>]*style="[^"]*display:none/);
  });

  it("shows live content in the editor canvas (no gate flag)", () => {
    const html = render([embed({ url: MAP })]);
    expect(html).toContain(`src="${MAP}"`);
    expect(html).not.toContain("data-consent-placeholder");
  });

  it("lets an author opt a node out", () => {
    const html = render([embed({ url: MAP, requireConsent: false })], { gateEmbeds: true });
    expect(html).toContain(`src="${MAP}"`);
    expect(html).not.toContain("data-consent-src");
  });

  it("does not gate an address without an external host", () => {
    const html = render([embed({ url: "https://" })], { gateEmbeds: true });
    expect(html).not.toContain("data-consent-placeholder");
  });

  it("gates a video primitive that is an iframe of a provider, but not a plain file", () => {
    const video = (provider: string, url: string): Node =>
      ({ id: "vid00000", type: "video", props: { provider, url }, children: [] }) as unknown as Node;
    const youtube = render([video("youtube", "https://www.youtube.com/embed/xyz")], { gateEmbeds: true });
    expect(youtube).toContain('data-consent-src="https://www.youtube.com/embed/xyz"');
    expect(youtube).not.toMatch(/<iframe[^>]* src=/);
    const file = render([video("file", "/assets/film.mp4")], { gateEmbeds: true });
    expect(file).toContain("<video");
    expect(file).not.toContain("data-consent");
  });
});
