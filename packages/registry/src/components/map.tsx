import type { ComponentType, ReactNode } from "react";
import type { Node, PropValue } from "@senify/section-sdk";
import { describePrimitive } from "@senify/widget-engine";
import { Navbar } from "./Navbar.tsx";
import { Footer } from "./Footer.tsx";
import { Hero } from "./Hero.tsx";
import { ContentSection } from "./Content.tsx";
import { Media } from "./Media.tsx";
import { Cta } from "./Cta.tsx";
import { Features } from "./Features.tsx";
import { ServicesProcess } from "./ServicesProcess.tsx";
import { Stats } from "./Stats.tsx";
import { LogoCloud } from "./LogoCloud.tsx";
import { Projects } from "./Projects.tsx";
import { Testimonials } from "./Testimonials.tsx";
import { Pricing } from "./Pricing.tsx";
import { Faq } from "./Faq.tsx";
import { Team } from "./Team.tsx";
import { Contact } from "./Contact.tsx";
import { Banner } from "./Banner.tsx";
import { Newsletter } from "./Newsletter.tsx";
import { Divider } from "./Divider.tsx";
import { Embed } from "./Embed.tsx";
import { Timeline } from "./Timeline.tsx";
import { Comparison } from "./Comparison.tsx";
import { CookieNote } from "./CookieNote.tsx";
import { Marquee } from "./Marquee.tsx";
import { Gallery } from "./Gallery.tsx";
import { Outlet } from "./Outlet.tsx";
import { CollectionList } from "./CollectionList.tsx";
import { Card } from "./Card.tsx";
import type { SectionContext, SectionProps } from "./shared.tsx";
import { nodeRootClasses } from "./shared.tsx";
import { PrimitiveNode } from "./primitives.tsx";

export const SECTION_COMPONENTS: Record<string, ComponentType<SectionProps>> = {
  navbar: Navbar,
  footer: Footer,
  hero: Hero,
  content: ContentSection,
  media: Media,
  cta: Cta,
  features: Features,
  "services-process": ServicesProcess,
  stats: Stats,
  "logo-cloud": LogoCloud,
  projects: Projects,
  testimonials: Testimonials,
  pricing: Pricing,
  faq: Faq,
  team: Team,
  contact: Contact,
  banner: Banner,
  newsletter: Newsletter,
  divider: Divider,
  embed: Embed,
  timeline: Timeline,
  comparison: Comparison,
  "cookie-note": CookieNote,
  marquee: Marquee,
  gallery: Gallery,
  outlet: Outlet,
  "collection-list": CollectionList,
  card: Card,
};

export function getSectionComponent(type: string): ComponentType<SectionProps> | undefined {
  return SECTION_COMPONENTS[type];
}

// Page chrome that sits around the content: it opens or closes the page and is
// not part of the main landmark.
const HEAD_CHROME = new Set(["navbar", "banner"]);
const TAIL_CHROME = new Set(["footer"]);
// A cookie notice floats; it belongs to neither end.
const FLOATING_CHROME = new Set(["cookie-note"]);

// The root children that make up the main landmark: from the first node that
// is not opening chrome to the last that is not closing chrome. Null when the
// page has no content between its chrome.
export function mainRange(
  rootChildren: readonly string[],
  nodes: Record<string, Node>,
): { start: number; end: number } | null {
  const types = rootChildren.map((id) => nodes[id]?.type ?? "");
  let start = types.findIndex((type) => !HEAD_CHROME.has(type) && !FLOATING_CHROME.has(type));
  if (start === -1) return null;
  let end = types.length - 1;
  while (end >= start && (TAIL_CHROME.has(types[end] ?? "") || FLOATING_CHROME.has(types[end] ?? ""))) {
    end -= 1;
  }
  if (end < start) return null;
  // Opening chrome after the first content node is content now: keep the range
  // contiguous and let the head chrome stay outside.
  start = Math.min(start, end);
  return { start, end };
}

// How many content nodes from the top of the page count as the first screenful.
const FIRST_SCREEN_NODES = 2;

function carriesImage(node: Node): boolean {
  const props = node.props as Record<string, unknown>;
  const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : undefined);
  const hasAsset = (value: unknown): boolean =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).assetId === "string";
  switch (node.type) {
    case "image":
      return typeof props.asset === "string" && props.asset !== "";
    case "media":
      return node.variant !== "video" && node.variant !== "3d-scene" && hasAsset(props.asset);
    case "gallery":
      return hasAsset((first(props.items) as Record<string, unknown> | undefined)?.asset);
    case "projects":
      return hasAsset((first(props.items) as Record<string, unknown> | undefined)?.cover);
    default:
      return false;
  }
}

// The likely LCP image: the first image in document order inside the first
// screenful of content. Everything below the fold stays lazy.
export function priorityImageNodeId(
  rootChildren: readonly string[],
  nodes: Record<string, Node>,
): string | undefined {
  const content = rootChildren.filter((id) => {
    const type = nodes[id]?.type ?? "";
    return !HEAD_CHROME.has(type) && !FLOATING_CHROME.has(type);
  });
  const find = (id: string, seen: Set<string>): string | undefined => {
    const node = nodes[id];
    if (node === undefined || seen.has(id)) return undefined;
    seen.add(id);
    if (carriesImage(node)) return id;
    for (const childId of node.children ?? []) {
      const hit = find(childId, seen);
      if (hit !== undefined) return hit;
    }
    for (const ids of Object.values(node.slots ?? {})) {
      for (const slotId of ids) {
        const hit = find(slotId, seen);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  };
  for (const id of content.slice(0, FIRST_SCREEN_NODES)) {
    const hit = find(id, new Set());
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const SKIP_LINK_TEXT: Record<string, string> = {
  de: "Zum Inhalt springen",
  en: "Skip to content",
};

export function SectionTree({
  rootNodeId,
  nodes,
  ctx,
  landmarks = false,
}: {
  rootNodeId: string;
  nodes: Record<string, Node>;
  ctx: SectionContext;
  // The baked page: wrap the content in <main id="main"> and put a skip link
  // in front of the page. The editor canvas keeps the flat structure it edits.
  landmarks?: boolean;
}): ReactNode {
  const rootForPriority = nodes[rootNodeId];
  const priorityNodeId =
    ctx.priorityNodeId ??
    (rootForPriority === undefined
      ? undefined
      : priorityImageNodeId(rootForPriority.children ?? [], nodes));
  const treeCtx: SectionContext =
    priorityNodeId === undefined ? ctx : { ...ctx, priorityNodeId };
  const renderNode = (id: string): ReactNode => {

    const node = nodes[id];
    if (!node) return null;
    const slots: Record<string, ReactNode> = {};
    for (const [name, ids] of Object.entries(node.slots ?? {})) {
      slots[name] = <>{ids.map((childId) => renderNode(childId))}</>;
    }
    // Two vocabularies, one render path: a node of the running section registry
    // renders its section component, a node of the widget catalog renders from
    // its description (Phase 1). The canvas and the bake both come through
    // here, which is what keeps them from drifting apart.
    //
    // The section registry is asked *first* on purpose: two names exist in both
    // vocabularies ("divider", "embed" — `widget-engine/src/legacy.ts`), and the
    // strangler decision (E2 in `map.md`) keeps the running sections
    // authoritative until the parity gate. Asking for the description first
    // would silently hijack every legacy page that carries such a node, and the
    // old editor's inline anchors (`react-renderer.tsx`, which only knows
    // registry types) would lose their hook.
    const Component = SECTION_COMPONENTS[node.type];
    if (Component !== undefined) {
      return <Component key={id} node={node} slots={slots} ctx={treeCtx} />;
    }
    // A catalog primitive without a section twin renders from the one markup
    // description (`widget-engine/src/markup.ts`).
    if (describePrimitive(node.type, node.props as Record<string, PropValue>) !== undefined) {
      return (
        <PrimitiveNode key={id} node={node} slots={slots} ctx={treeCtx}>
          {(node.children ?? []).map((childId) => renderNode(childId))}
        </PrimitiveNode>
      );
    }
    return (
      <div
        key={id}
        data-unknown-section={node.type}
        data-node-id={id}
        className={nodeRootClasses(node).join(" ")}
      />
    );
  };
  const root = nodes[rootNodeId];
  if (!root) return null;
  const children = root.children ?? [];
  const range = landmarks ? mainRange(children, nodes) : null;
  if (range === null) return <>{children.map((id) => renderNode(id))}</>;
  const skipText = SKIP_LINK_TEXT[(ctx.lang ?? "de").slice(0, 2).toLowerCase()] ?? SKIP_LINK_TEXT["en"];
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[10000] focus:rounded focus:bg-[var(--bg-base,#fff)] focus:px-4 focus:py-2 focus:text-[var(--fg-base,#000)] focus:shadow-lg focus:outline focus:outline-2"
      >
        {skipText}
      </a>
      {children.slice(0, range.start).map((id) => renderNode(id))}
      <main id="main" tabIndex={-1} className="outline-none">
        {children.slice(range.start, range.end + 1).map((id) => renderNode(id))}
      </main>
      {children.slice(range.end + 1).map((id) => renderNode(id))}
    </>
  );
}
