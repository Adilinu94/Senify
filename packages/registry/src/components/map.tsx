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

export function SectionTree({
  rootNodeId,
  nodes,
  ctx,
}: {
  rootNodeId: string;
  nodes: Record<string, Node>;
  ctx: SectionContext;
}): ReactNode {
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
      return <Component key={id} node={node} slots={slots} ctx={ctx} />;
    }
    // A catalog primitive without a section twin renders from the one markup
    // description (`widget-engine/src/markup.ts`).
    if (describePrimitive(node.type, node.props as Record<string, PropValue>) !== undefined) {
      return (
        <PrimitiveNode key={id} node={node} slots={slots} ctx={ctx}>
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
  return <>{(root.children ?? []).map((id) => renderNode(id))}</>;
}
