import { Registry } from "@senify/section-sdk";
import { heroSection } from "./sections/hero.ts";
import { navbarSection } from "./sections/navbar.ts";
import { footerSection } from "./sections/footer.ts";
import { contentSection } from "./sections/content.ts";
import { mediaSection } from "./sections/media.ts";
import { ctaSection } from "./sections/cta.ts";
import { featuresSection } from "./sections/features.ts";
import { servicesProcessSection } from "./sections/services-process.ts";
import { statsSection } from "./sections/stats.ts";
import { logoCloudSection } from "./sections/logo-cloud.ts";
import { projectsSection } from "./sections/projects.ts";
import { testimonialsSection } from "./sections/testimonials.ts";
import { pricingSection } from "./sections/pricing.ts";
import { faqSection } from "./sections/faq.ts";
import { teamSection } from "./sections/team.ts";
import { contactSection } from "./sections/contact.ts";
import { gallerySection } from "./sections/gallery.ts";
import { bannerSection } from "./sections/banner.ts";
import { newsletterSection } from "./sections/newsletter.ts";
import { dividerSection } from "./sections/divider.ts";
import { embedSection } from "./sections/embed.ts";
import { timelineSection } from "./sections/timeline.ts";
import { comparisonSection } from "./sections/comparison.ts";
import { cookieNoteSection } from "./sections/cookie-note.ts";
import { marqueeSection } from "./sections/marquee.ts";
import { outletSection } from "./sections/outlet.ts";
import { collectionListSection } from "./sections/collection-list.ts";
import { cardSection } from "./sections/card.ts";
import { structuralSections } from "./sections/structural.ts";
import { registerCatalogPrimitives } from "./sections/primitives.ts";

export { heroSection } from "./sections/hero.ts";
export { renderMarkdown } from "./md.ts";export { navbarSection } from "./sections/navbar.ts";
export { footerSection } from "./sections/footer.ts";
export { contentSection } from "./sections/content.ts";
export { mediaSection } from "./sections/media.ts";
export { ctaSection } from "./sections/cta.ts";
export { featuresSection } from "./sections/features.ts";
export { servicesProcessSection } from "./sections/services-process.ts";
export { statsSection } from "./sections/stats.ts";
export { logoCloudSection } from "./sections/logo-cloud.ts";
export { projectsSection } from "./sections/projects.ts";
export { testimonialsSection } from "./sections/testimonials.ts";
export { pricingSection } from "./sections/pricing.ts";
export { faqSection } from "./sections/faq.ts";
export { teamSection } from "./sections/team.ts";
export { contactSection } from "./sections/contact.ts";
export { gallerySection } from "./sections/gallery.ts";
export { bannerSection } from "./sections/banner.ts";
export { newsletterSection } from "./sections/newsletter.ts";
export { dividerSection } from "./sections/divider.ts";
export { embedSection } from "./sections/embed.ts";
export { timelineSection } from "./sections/timeline.ts";
export { comparisonSection } from "./sections/comparison.ts";
export { cookieNoteSection } from "./sections/cookie-note.ts";
export { marqueeSection } from "./sections/marquee.ts";
export { outletSection } from "./sections/outlet.ts";
export { collectionListSection } from "./sections/collection-list.ts";
export { cardSection } from "./sections/card.ts";

export const bundledSections = [
  // Gerüst: jede Site braucht sie.
  navbarSection,
  footerSection,
  heroSection,
  contentSection,
  mediaSection,
  ctaSection,
  // Überzeugung.
  featuresSection,
  servicesProcessSection,
  statsSection,
  logoCloudSection,
  projectsSection,
  // Vertrauen & Konversion.
  testimonialsSection,
  pricingSection,
  faqSection,
  teamSection,
  contactSection,
  bannerSection,
  // Zusatz.
  newsletterSection,
  dividerSection,
  embedSection,
  gallerySection,
  timelineSection,
  comparisonSection,
  cookieNoteSection,
  marqueeSection,
  // Templates & Loops (T10).
  outletSection,
  collectionListSection,
  cardSection,
];

export const EXPECTED_SECTION_TYPES = bundledSections.map(
  (section) => section.type,
);

export function createRegistry(): Registry {
  const registry = new Registry();
  for (const section of bundledSections) {
    registry.register(section);
  }
  // The structural node types of the component model (ticket 04): known to
  // validation, absent from the authorable catalog (`list()`).
  for (const section of structuralSections) {
    registry.registerStructural(section);
  }
  // The widget catalog as the second node vocabulary (Strangler E2): last, so a
  // section or structural type with the same name keeps its own definition.
  registerCatalogPrimitives(registry);
  return registry;
}

// The widget catalog next to the section catalog: consumers that describe the
// placeable surface (the MCP server's widget tools, ticket 02 point 7) read it
// here instead of taking a direct dependency on the widget engine.
export {
  getPrimitive,
  isSectionPrimitiveTwin,
  PRIMITIVES,
  primitiveTypes,
  sectionTwinControls,
  STYLE_PROPERTIES,
  stylePropertyFor,
  type Control,
  type PrimitiveDefinition,
  type StyleGroup,
  type StylePropertySpec,
} from "@senify/widget-engine";

export * from "./style.ts";
