import { describe, expect, it } from "vitest";
import {
  buildCollectionBrief,
  buildImagePrompt,
  buildPreferenceBlock,
  buildReferenceBrief,
  buildStyleFamilyBrief,
  preferenceStatus,
  referenceBriefSection,
} from "@senify/engine";
import type { ReferenceCollection, ReferenceDna, ReferencePreferences } from "@senify/engine";

// The briefs are ported verbatim from the original templates (Taste Vault, MIT).
// These expectations are the ready-rendered examples of the original, taken from
// the reference data unchanged, so they pin the wording, the order and the
// fallbacks line by line. Values whose data differs (the screenshot path) are
// set to the original path in the fixtures.

type ReferenceFixture = Parameters<typeof referenceBriefSection>[0];
type CollectionFixture = Parameters<typeof buildStyleFamilyBrief>[0]["collection"];

const EXPECTED_SINGLE_ATELO = [
  "Build [describe the website or product] for [audience].",
  "Primary action: [what the visitor should do].",
  "Required content: [sections and copy].",
  "",
  "Reference: ATELO - Interior Gallery",
  "Screenshot: images/atelo-interior-gallery.png",
  "Aesthetic: warm architectural editorial (Monumental Editorial)",
  "Vocabulary: staggered five-image gallery, enlarged central photograph, faded peripheral images, cream ground and bronze accent, oversized offset sans headline, asymmetric whitespace, underlined case-study link",
  "What to borrow: Make the image strip the portfolio preview, then let a giant staggered headline anchor the lower half. The central image has visual priority; a screenshot alone does not establish carousel behavior.",
  "Composition: five separate interior images across the upper page with a larger central frame; use code for opacity differences, image sizing, bronze details, and oversized lower headline",
  "Image recipe: architectural editorial photograph of [SUBJECT: a contemporary interior with warm timber cabinetry and pale stone], soft daylight, restrained cream and walnut palette, realistic material detail, straight verticals, no text or graphics",
  "",
  "Follow the selected references and explicit project directions when they differ from general preferences.",
  "",
  "Read the reference images before designing. Borrow their visual treatment and hierarchy; write for our product and use our content. Do not reuse sample claims or endorsements. Generate original image assets where useful with the available image-generation tool, using the recipes and composition notes. Build real responsive HTML text, controls, and components around those assets. Verify the result in a browser on desktop and mobile.",
].join("\n");
const EXPECTED_SINGLE_ATELO_WITH_DNA = [
  "Build [describe the website or product] for [audience].",
  "Primary action: [what the visitor should do].",
  "Required content: [sections and copy].",
  "",
  "Reference: ATELO - Interior Gallery",
  "Screenshot: images/atelo-interior-gallery.png",
  "Aesthetic: warm architectural editorial (Monumental Editorial)",
  "Vocabulary: staggered five-image gallery, enlarged central photograph, faded peripheral images, cream ground and bronze accent, oversized offset sans headline, asymmetric whitespace, underlined case-study link",
  "What to borrow: Make the image strip the portfolio preview, then let a giant staggered headline anchor the lower half. The central image has visual priority; a screenshot alone does not establish carousel behavior.",
  "Composition: five separate interior images across the upper page with a larger central frame; use code for opacity differences, image sizing, bronze details, and oversized lower headline",
  "Image recipe: architectural editorial photograph of [SUBJECT: a contemporary interior with warm timber cabinetry and pale stone], soft daylight, restrained cream and walnut palette, realistic material detail, straight verticals, no text or graphics",
  "",
  "General preferences (defaults, not absolute rules):",
  "- One monumental image anchors the page - timeless subject matter (mountains, sea, statues, architecture), never abstract SaaS blobs",
  "- Imagery is processed, never raw - halftone, dither, grain, ASCII, linework",
  "- Technical marginalia - coordinates, IDs, ruler ticks, registration marks, timestamps",
  "- Type at extremes - monumental display or tiny labels, little middle; serif display or giant cropped sans; mono for micro-labels",
  "- Near-monochrome ground + single warm accent (ember, amber, terracotta, red)",
  "Usually avoid: Purple gradients; Glossy 3D SaaS blobs; Untextured stock photography; Rounded-everything friendliness; Icon-grid feature rows; Inter/system-font-only typography; Evenly-distributed colorful palettes.",
  "",
  "Project-specific directions (take priority):",
  "Embrace the cream/bronze palette. Keep typography restrained and let whitespace carry the page.",
  "",
  "Follow the selected references and explicit project directions when they differ from general preferences.",
  "",
  "Read the reference images before designing. Borrow their visual treatment and hierarchy; write for our product and use our content. Do not reuse sample claims or endorsements. Generate original image assets where useful with the available image-generation tool, using the recipes and composition notes. Build real responsive HTML text, controls, and components around those assets. Verify the result in a browser on desktop and mobile.",
].join("\n");
const EXPECTED_COMBINED = [
  "Build [describe the website or product] for [audience].",
  "Primary action: [what the visitor should do].",
  "Required content: [sections and copy].",
  "",
  "Reference: ATELO - Interior Gallery",
  "Screenshot: images/atelo-interior-gallery.png",
  "Aesthetic: warm architectural editorial (Monumental Editorial)",
  "Vocabulary: staggered five-image gallery, enlarged central photograph, faded peripheral images, cream ground and bronze accent, oversized offset sans headline, asymmetric whitespace, underlined case-study link",
  "What to borrow: Make the image strip the portfolio preview, then let a giant staggered headline anchor the lower half. The central image has visual priority; a screenshot alone does not establish carousel behavior.",
  "Composition: five separate interior images across the upper page with a larger central frame; use code for opacity differences, image sizing, bronze details, and oversized lower headline",
  "Image recipe: architectural editorial photograph of [SUBJECT: a contemporary interior with warm timber cabinetry and pale stone], soft daylight, restrained cream and walnut palette, realistic material detail, straight verticals, no text or graphics",
  "",
  "---",
  "",
  "Reference: Zuno - Orange Workspace",
  "Screenshot: images/zuno-orange-workspace.png",
  "Aesthetic: white SaaS x orange product frame (Product-Led Minimalism)",
  "Vocabulary: centered two-line sans headline, orange corner-mark buttons, generous white space, dashboard as hero proof, peach gradient image frame, rounded application window, lightweight sidebar and metrics",
  "What to borrow: Use one large product view to substantiate a short promise; the warm surround highlights the dashboard while the page itself stays white.",
  "Composition: center headline and paired CTAs above a wide dashboard built in code or supplied as a real screenshot; place only the warm texture behind the dashboard frame",
  "Image recipe: soft peach and orange atmospheric texture with a subtle fine grain and brighter center, used behind [SUBJECT: a workspace dashboard], no interface, no text, no logos",
  "",
  "Use these as a reference set. If they represent different aesthetics, create one direction per reference before choosing one; do not automatically blend them.",
  "",
  "Follow the selected references and explicit project directions when they differ from general preferences.",
  "",
  "Read the reference images before designing. Borrow their visual treatment and hierarchy; write for our product and use our content. Do not reuse sample claims or endorsements. Generate original image assets where useful with the available image-generation tool, using the recipes and composition notes. Build real responsive HTML text, controls, and components around those assets. Verify the result in a browser on desktop and mobile.",
].join("\n");
const EXPECTED_STYLE = [
  "Build [project] for [audience].",
  "Primary action: [action].",
  "",
  "Aesthetic: Editorial Minimalism",
  "Vocabulary: restraint, tight tracking, quiet confidence, keyboard-first, muted accent, small type allowed",
  "References: linear.app https://linear.app",
  "stripe.com https://stripe.com",
  "vercel.com https://vercel.com",
  "Direction to explore: Shrink the headline below what feels safe and let whitespace carry the page",
  "Image direction: minimal product UI screenshot floating on a calm near-white ground, soft single shadow, no scene, no decoration",
  "",
  "Follow the selected references and explicit project directions when they differ from general preferences.",
  "",
  "Implement as a responsive interface and verify desktop and mobile in a browser.",
].join("\n");
const EXPECTED_IMAGE_PROMPT = [
  "architectural editorial photograph of [SUBJECT: a contemporary interior with warm timber cabinetry and pale stone], soft daylight, restrained cream and walnut palette, realistic material detail, straight verticals, no text or graphics",
  "",
  "Composition: five separate interior images across the upper page with a larger central frame; use code for opacity differences, image sizing, bronze details, and oversized lower headline",
  "",
  "Use images/atelo-interior-gallery.png as a style reference. Match treatment, texture, palette and balance while adapting the subject to our project. Return the artwork asset only; keep interface text and controls in code.",
].join("\n");
const EXPECTED_ATELO_SECTION = [
  "Reference: ATELO - Interior Gallery",
  "Screenshot: images/atelo-interior-gallery.png",
  "Aesthetic: warm architectural editorial (Monumental Editorial)",
  "Vocabulary: staggered five-image gallery, enlarged central photograph, faded peripheral images, cream ground and bronze accent, oversized offset sans headline, asymmetric whitespace, underlined case-study link",
  "What to borrow: Make the image strip the portfolio preview, then let a giant staggered headline anchor the lower half. The central image has visual priority; a screenshot alone does not establish carousel behavior.",
  "Composition: five separate interior images across the upper page with a larger central frame; use code for opacity differences, image sizing, bronze details, and oversized lower headline",
  "Image recipe: architectural editorial photograph of [SUBJECT: a contemporary interior with warm timber cabinetry and pale stone], soft daylight, restrained cream and walnut palette, realistic material detail, straight verticals, no text or graphics",
].join("\n");
const EXPECTED_ZUNO_SECTION = [
  "Reference: Zuno - Orange Workspace",
  "Screenshot: images/zuno-orange-workspace.png",
  "Aesthetic: white SaaS x orange product frame (Product-Led Minimalism)",
  "Vocabulary: centered two-line sans headline, orange corner-mark buttons, generous white space, dashboard as hero proof, peach gradient image frame, rounded application window, lightweight sidebar and metrics",
  "What to borrow: Use one large product view to substantiate a short promise; the warm surround highlights the dashboard while the page itself stays white.",
  "Composition: center headline and paired CTAs above a wide dashboard built in code or supplied as a real screenshot; place only the warm texture behind the dashboard frame",
  "Image recipe: soft peach and orange atmospheric texture with a subtle fine grain and brighter center, used behind [SUBJECT: a workspace dashboard], no interface, no text, no logos",
].join("\n");
const ATELO_OVERRIDES = [
  "Embrace the cream/bronze palette. Keep typography restrained and let whitespace carry the page.",
].join("\n");

const HOUSE_DNA: ReferenceDna = {
  name: "House DNA",
  description: "Constants that run under every collection. These make a page recognizably yours regardless of which look you deploy.",
  constants: [
    "One monumental image anchors the page - timeless subject matter (mountains, sea, statues, architecture), never abstract SaaS blobs",
    "Imagery is processed, never raw - halftone, dither, grain, ASCII, linework",
    "Technical marginalia - coordinates, IDs, ruler ticks, registration marks, timestamps",
    "Type at extremes - monumental display or tiny labels, little middle; serif display or giant cropped sans; mono for micro-labels",
    "Near-monochrome ground + single warm accent (ember, amber, terracotta, red)",
  ],
  never: [
    "Purple gradients",
    "Glossy 3D SaaS blobs",
    "Untextured stock photography",
    "Rounded-everything friendliness",
    "Icon-grid feature rows",
    "Inter/system-font-only typography",
    "Evenly-distributed colorful palettes",
  ],
};

const DNA_OFF: ReferencePreferences = { includeDna: false, overrides: "" };
const DNA_ON: ReferencePreferences = { includeDna: true, overrides: ATELO_OVERRIDES };

function makeCollection(overrides: Partial<CollectionFixture> = {}): ReferenceCollection {
  return {
    id: "collection",
    name: "Collection",
    description: "",
    deployFor: "",
    vocabulary: [],
    risk: "",
    accent: "#000000",
    imageStyle: "",
    recognize: [],
    examples: [],
    warning: null,
    kind: "collection",
    externalId: null,
    position: 0,
    referenceCount: 0,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function makeReference(
  collection: ReferenceCollection | null,
  previewPath: string,
  overrides: Partial<ReferenceFixture> = {},
): ReferenceFixture {
  return {
    id: "reference",
    name: "Reference",
    sourceUrl: "https://example.com",
    status: "ready",
    progress: 100,
    stage: "done",
    method: "manual",
    origin: "manual",
    failureReason: null,
    families: [],
    vocabulary: [],
    styleBrief: "",
    snapshots: [
      {
        breakpoint: "desktop",
        width: 1440,
        height: 900,
        kind: "fullpage",
        storageRef: "stored",
        hash: "hash",
        previewPath,
      },
    ],
    provenance: {
      url: "https://example.com",
      capturedAt: "2026-09-08T00:00:00.000Z",
      hash: "hash",
      method: "manual",
      note: null,
    },
    collectionId: collection?.id ?? null,
    collection,
    note: null,
    imageRecipe: null,
    heroUsage: null,
    family: null,
    documents: { design: null, guidelines: null, components: null },
    revision: 0,
    profile: null,
    evidence: [],
    usedInProjects: [],
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

const MONUMENTAL_EDITORIAL = makeCollection({
  id: "monumental-editorial",
  name: "Monumental Editorial",
  description: "Oversized typography, asymmetric white space, and carefully placed gallery images. The layout and type scale carry the identity.",
  deployFor: "Architecture, design studios, portfolios, galleries, and culture brands.",
  vocabulary: ["monumental sans typography","staggered headline lines","asymmetric editorial grid","extreme negative space","inset image gallery","restrained accent"],
  risk: "Let a headline span most of the viewport while a small image interrupts its geometry",
  accent: "#AD8969",
  imageStyle: "editorial image of [SUBJECT], deliberate gallery crop, natural material detail, restrained palette, no typography; build the oversized type and white space in code",
});

const PRODUCT_LED_MINIMALISM = makeCollection({
  id: "product-led-minimalism",
  name: "Product-Led Minimalism",
  description: "Clear white landing pages whose main visual is the actual product, framed by a controlled accent or atmospheric background.",
  deployFor: "SaaS platforms, productivity tools, dashboards, and workflow products.",
  vocabulary: ["clear sans hierarchy","white space","product screenshot as proof","restrained page chrome","contrasting CTA pair","framed interface demonstration"],
  risk: "Let a single readable product interaction occupy most of the hero",
  accent: "#FF671D",
  imageStyle: "subtle atmospheric background for [SUBJECT], controlled accent palette and calm center, no UI or text; use real screenshots or code for product demonstrations",
});

const EDITORIAL_MINIMALISM = makeCollection({
  id: "editorial-minimalism",
  name: "Editorial Minimalism",
  description: "Developer tools, B2B SaaS, buyers who distrust marketing",
  vocabulary: ["restraint","tight tracking","quiet confidence","keyboard-first","muted accent","small type allowed"],
  risk: "Shrink the headline below what feels safe and let whitespace carry the page",
  imageStyle: "minimal product UI screenshot floating on a calm near-white ground, soft single shadow, no scene, no decoration",
  recognize: ["calm neutral grounds, near-black ink","tight-tracked sans, medium weights","generous whitespace","one muted accent, used rarely"],
  examples: [{"name":"linear.app","url":"https://linear.app"},{"name":"stripe.com","url":"https://stripe.com"},{"name":"vercel.com","url":"https://vercel.com"}],
  kind: "style",
  externalId: "editorial-minimalism",
});

const ATELO = makeReference(
  MONUMENTAL_EDITORIAL,
  "images/atelo-interior-gallery.png",
  {
    id: "atelo-interior-gallery",
    name: "ATELO - Interior Gallery",
    family: "warm architectural editorial",
    vocabulary: ["staggered five-image gallery","enlarged central photograph","faded peripheral images","cream ground and bronze accent","oversized offset sans headline","asymmetric whitespace","underlined case-study link"],
    note: "Make the image strip the portfolio preview, then let a giant staggered headline anchor the lower half. The central image has visual priority; a screenshot alone does not establish carousel behavior.",
    imageRecipe: "architectural editorial photograph of [SUBJECT: a contemporary interior with warm timber cabinetry and pale stone], soft daylight, restrained cream and walnut palette, realistic material detail, straight verticals, no text or graphics",
    heroUsage: "five separate interior images across the upper page with a larger central frame; use code for opacity differences, image sizing, bronze details, and oversized lower headline",
  },
);

const ZUNO = makeReference(
  PRODUCT_LED_MINIMALISM,
  "images/zuno-orange-workspace.png",
  {
    id: "zuno-orange-workspace",
    name: "Zuno - Orange Workspace",
    family: "white SaaS x orange product frame",
    vocabulary: ["centered two-line sans headline","orange corner-mark buttons","generous white space","dashboard as hero proof","peach gradient image frame","rounded application window","lightweight sidebar and metrics"],
    note: "Use one large product view to substantiate a short promise; the warm surround highlights the dashboard while the page itself stays white.",
    imageRecipe: "soft peach and orange atmospheric texture with a subtle fine grain and brighter center, used behind [SUBJECT: a workspace dashboard], no interface, no text, no logos",
    heroUsage: "center headline and paired CTAs above a wide dashboard built in code or supplied as a real screenshot; place only the warm texture behind the dashboard frame",
  },
);

describe("reference briefs (T14, verbatim after the original)", () => {
  it("renders the single brief of ATELO exactly like the original", () => {
    const brief = buildReferenceBrief({
      references: [ATELO],
      dna: HOUSE_DNA,
      preferences: DNA_OFF,
    });
    expect(brief.kind).toBe("reference");
    expect(brief.text).toBe(EXPECTED_SINGLE_ATELO);
    expect(brief.status).toBe("Reference-led brief · House DNA is off.");
  });

  it("keeps the seven section lines in the order of the original", () => {
    const section = referenceBriefSection(ATELO);
    expect(section).toBe(EXPECTED_ATELO_SECTION);
    expect(section.split("\n").map((line) => line.slice(0, line.indexOf(":")))).toEqual([
      "Reference",
      "Screenshot",
      "Aesthetic",
      "Vocabulary",
      "What to borrow",
      "Composition",
      "Image recipe",
    ]);
    // No invented line of the old build leaks in.
    expect(section).not.toContain("A visual reference for your next project.");
  });

  it("renders the single brief with the House DNA exactly like the original", () => {
    const brief = buildReferenceBrief({
      references: [ATELO],
      dna: HOUSE_DNA,
      preferences: DNA_ON,
    });
    expect(brief.text).toBe(EXPECTED_SINGLE_ATELO_WITH_DNA);
    expect(brief.status).toBe(
      "Includes your general preferences. Project notes included.",
    );
  });

  it("renders the combined brief of two references exactly like the original", () => {
    const brief = buildReferenceBrief({
      references: [ATELO, ZUNO],
      dna: HOUSE_DNA,
      preferences: DNA_OFF,
    });
    expect(brief.text).toBe(EXPECTED_COMBINED);
    expect(brief.referenceIds).toEqual([ATELO.id, ZUNO.id]);
    // The sections are separated by ---, the set hint stands before the block.
    expect(brief.text).toContain(
      EXPECTED_ATELO_SECTION + "\n\n---\n\n" + EXPECTED_ZUNO_SECTION,
    );
    expect(brief.text).toContain(
      "Use these as a reference set. If they represent different aesthetics, create one direction per reference before choosing one; do not automatically blend them.",
    );
  });

  it("renders the style brief of Editorial Minimalism exactly like the original", () => {
    const brief = buildStyleFamilyBrief({
      collection: EDITORIAL_MINIMALISM,
      dna: HOUSE_DNA,
      preferences: DNA_OFF,
    });
    expect(brief.text).toBe(EXPECTED_STYLE);
    // Every canonical site travels as name plus url, one per line.
    expect(brief.text).toContain("References: linear.app https://linear.app");
    expect(brief.text).toContain("stripe.com https://stripe.com");
    expect(brief.text).toContain("vercel.com https://vercel.com");
  });

  it("renders the image prompt of ATELO exactly like the original", () => {
    expect(buildImagePrompt(ATELO)).toBe(EXPECTED_IMAGE_PROMPT);
    expect(buildImagePrompt(ATELO)).toMatch(
      /Use images\/atelo-interior-gallery\.png as a style reference\. Match treatment, texture, palette and balance while adapting the subject to our project\. Return the artwork asset only; keep interface text and controls in code\.$/,
    );
  });

  it("builds the collection brief as head, then the reference sections", () => {
    const brief = buildCollectionBrief({
      collection: MONUMENTAL_EDITORIAL,
      references: [ATELO],
      dna: HOUSE_DNA,
      preferences: DNA_OFF,
    });
    expect(brief.kind).toBe("collection");
    expect(brief.referenceIds).toEqual([ATELO.id]);
    expect(brief.text.startsWith(
      "Collection: Monumental Editorial\n" +
        "Oversized typography, asymmetric white space, and carefully placed gallery images. The layout and type scale carry the identity.\n" +
        "Vocabulary: monumental sans typography, staggered headline lines, asymmetric editorial grid, extreme negative space, inset image gallery, restrained accent\n" +
        "Direction to explore: Let a headline span most of the viewport while a small image interrupts its geometry\n\n" +
        "Build [describe the website or product] for [audience].",
    )).toBe(true);
    expect(brief.text).toContain("Reference: ATELO - Interior Gallery");
    expect(brief.text).not.toContain("Image direction:");
  });

  it("drops empty fields instead of printing empty section lines", () => {
    const bare = makeReference(null, "images/bare.png");
    const section = referenceBriefSection(bare);
    expect(section).not.toContain("Aesthetic:");
    expect(section).not.toContain("Vocabulary:");
    expect(section).not.toContain("What to borrow:");
    expect(section).not.toContain("Image recipe:");
    expect(section).toContain("Composition: Use the reference image for composition.");
    for (const line of section.split("\n")) {
      expect(line.trim()).not.toBe("");
      expect(line.endsWith(": ")).toBe(false);
    }
    expect(buildImagePrompt(bare)).toBeNull();

    // A collection without description, vocabulary and direction keeps a clean
    // head and never leaves an empty line behind.
    const emptyCollection = makeCollection({ name: "Nur ein Name" });
    const collectionBrief = buildCollectionBrief({
      collection: emptyCollection,
      references: [],
      dna: HOUSE_DNA,
      preferences: DNA_OFF,
    });
    expect(collectionBrief.text.startsWith("Collection: Nur ein Name\n\n")).toBe(true);
    expect(collectionBrief.text).not.toContain("Vocabulary:");
    expect(collectionBrief.text).not.toContain("Direction to explore:");
    expect(collectionBrief.text).not.toContain("\n\n\n");
  });

  it("keeps the House DNA behind the switch and gives project notes priority", () => {
    const off = buildPreferenceBlock({ dna: HOUSE_DNA, preferences: DNA_OFF });
    expect(off).toBe(
      "Follow the selected references and explicit project directions when they differ from general preferences.",
    );
    const on = buildPreferenceBlock({ dna: HOUSE_DNA, preferences: DNA_ON });
    expect(on.startsWith("General preferences (defaults, not absolute rules):\n")).toBe(true);
    expect(on).toContain("- One monumental image anchors the page");
    expect(on).toContain("Usually avoid: Purple gradients;");
    expect(on).toContain("Project-specific directions (take priority):\n" + ATELO_OVERRIDES);
    expect(preferenceStatus(DNA_OFF)).toBe("Reference-led brief · House DNA is off.");
    expect(preferenceStatus(DNA_ON)).toBe(
      "Includes your general preferences. Project notes included.",
    );
    const notesOnly = buildPreferenceBlock({
      dna: HOUSE_DNA,
      preferences: { includeDna: false, overrides: "Nur die Notizen." },
    });
    expect(notesOnly).not.toContain("General preferences");
    expect(notesOnly).toContain("Project-specific directions (take priority):\nNur die Notizen.");
  });
});
