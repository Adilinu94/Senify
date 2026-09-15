import type { ComponentType, ReactNode } from "react";
import type { Node } from "@senify/section-sdk";
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
import type { SectionContext, SectionProps } from "./shared.tsx";

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
    const Component = SECTION_COMPONENTS[node.type];
    if (!Component) {
      return <div key={id} data-unknown-section={node.type} data-node-id={id} />;
    }
    const slots: Record<string, ReactNode> = {};
    for (const [name, ids] of Object.entries(node.slots ?? {})) {
      slots[name] = <>{ids.map((childId) => renderNode(childId))}</>;
    }
    return <Component key={id} node={node} slots={slots} ctx={ctx} />;
  };
  const root = nodes[rootNodeId];
  if (!root) return null;
  return <>{(root.children ?? []).map((id) => renderNode(id))}</>;
}
