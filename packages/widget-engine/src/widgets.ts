import type { Control, PrimitiveDefinition, PropValue, SpacingValue, Unit } from "./types.ts";

type Extra = Omit<Partial<Control>, "key" | "label" | "kind" | "valueType" | "default">;

function ctrl(key: string, label: string, kind: Control["kind"], valueType: Control["valueType"], value: PropValue, extra: Extra = {}): Control {
  return { key, label, kind, valueType, default: value, ...extra };
}
const slider = (key: string, label: string, value: number, min: number, max: number, step: number, group: string, units: Unit[]): Control =>
  ctrl(key, label, "slider", "number", value, { min, max, step, units, group });
const factor = (key: string, label: string, value: number, min: number, max: number, step: number, group: string): Control =>
  ctrl(key, label, "number", "number", value, { min, max, step, group });
const choose = (key: string, label: string, options: [string, string][], value: string, group: string): Control =>
  ctrl(key, label, "choose", "enum", value, { options: options.map(([v, l]) => ({ value: v, label: l })), group });
const toggle = (key: string, label: string, value: boolean, group: string): Control =>
  ctrl(key, label, "switcher", "boolean", value, { responsive: false, group });
const text = (key: string, label: string, value: string, group: string): Control =>
  ctrl(key, label, "text", "string", value, { group, responsive: false });
const area = (key: string, label: string, value: string, group: string): Control =>
  ctrl(key, label, "textarea", "string", value, { group, responsive: false });
const url = (key: string, label: string, value: string, group: string): Control =>
  ctrl(key, label, "url", "string", value, { group, responsive: false });
const media = (key: string, label: string, value: string, group: string): Control =>
  ctrl(key, label, "media", "asset", value, { group, responsive: false });

const radiusDefault: SpacingValue = { top: "5px", right: "5px", bottom: "5px", left: "5px", isLinked: true, unit: "px" };

const linkField = (): Control => text("label", "Beschriftung", "", "Inhalt");
const targetField = (): Control => url("link", "Ziel", "", "Inhalt");

const toneControl = (): Control =>
  choose("tone", "Farbton", [["dark", "Dunkel"], ["light", "Hell"]], "dark", "Darstellung");

const ribbonControls: Control[] = [
  ctrl("images", "Bilder", "repeater", "list", [], {
    group: "Bilder", responsive: false, maxItems: 12,
    fields: [ctrl("image", "Bild", "media", "asset", "", { responsive: false })],
  }),
  choose("side", "Seite", [["left", "Links"], ["right", "Rechts"]], "left", "Seite"),
  choose("direction", "Richtung", [["auto", "Auto"], ["up", "Aufwärts"], ["down", "Abwärts"]], "auto", "Bewegung"),
  slider("speed", "Geschwindigkeit", 8.28, 0, 40, 0.1, "Bewegung", ["%"]),
  factor("curve", "Kurve", 1, 0, 2, 0.01, "Form"),
  factor("twist", "Twist", 0, 0, 3, 0.01, "Form"),
  slider("ribbonWidth", "Bandbreite", 32.7, 2, 100, 0.1, "Form", ["%"]),
  slider("gap", "Lücke", 6.8, 0, 40, 0.1, "Form", ["%"]),
  ctrl("radius", "Radius", "dimensions", "spacing", radiusDefault, { group: "Form", units: ["px", "rem", "em", "%"], linkable: true }),
  slider("phase", "Phase", 0, -25, 25, 0.1, "Form", ["%"]),
  factor("dispersion", "Dispersion", 1, 0, 3, 0.01, "Optik"),
  factor("smear", "Smear", 1, 0, 3, 0.01, "Optik"),
  factor("fringe", "Fringe", 1, 0, 3, 0.01, "Optik"),
  factor("bloom", "Bloom", 1, 0, 3, 0.01, "Optik"),
  slider("endZone", "Endzone", 18.5, 2, 45, 0.1, "Optik", ["%"]),
  choose("trigger", "Auslöser", [["layerInView", "Im Viewport"], ["appear", "Appear"], ["none", "Keiner"]], "layerInView", "Einblendung"),
  choose("start", "Start", [["top", "Oben"], ["center", "Mitte"], ["bottom", "Unten"]], "top", "Einblendung"),
  toggle("replay", "Wiederholen", false, "Einblendung"),
  slider("delay", "Verzögerung", 0.8, 0, 5, 0.01, "Einblendung", ["s"]),
  slider("stagger", "Staffelung", 0.075, 0, 1, 0.005, "Einblendung", ["s"]),
  slider("duration", "Dauer", 0.85, 0.1, 4, 0.01, "Einblendung", ["s"]),
];
// Framer-hidden-Logik: start/replay nur bei layerInView; delay/stagger/duration nicht bei none.
for (const c of ribbonControls) {
  if (c.key === "start" || c.key === "replay") c.condition = { prop: "trigger", equals: "layerInView" };
  if (c.key === "delay" || c.key === "stagger" || c.key === "duration") c.condition = { prop: "trigger", notEquals: "none" };
}

// WaveBackground hat in der Quelle keine propertyControls; diese Controls machen
// den portierten Shader im Inspector einstellbar. Defaults = bildgleich zur Quelle.
const waveControls: Control[] = [
  factor("speed", "Geschwindigkeit", 1, 0, 3, 0.01, "Bewegung"),
  factor("amplitude", "Wellenhöhe", 1, 0, 2, 0.01, "Form"),
  factor("zoom", "Zoom", 1, 0.2, 3, 0.01, "Form"),
  factor("glow", "Leuchten", 1, 0, 3, 0.01, "Optik"),
  factor("phase", "Farbphase", 0, 0, 6.28, 0.01, "Optik"),
  factor("saturation", "Sättigung", 1, 0, 1, 0.01, "Optik"),
  factor("steps", "Detail", 22, 4, 32, 1, "Qualität"),
];

/* ------------------------------------------------- Framer-Komponenten */

// Die vier Komponenten aus fluffy-rectangle-418998, deren Innenleben die
// Projekt-XML nicht ausgibt (Namen und Instanzen stehen dort, die Ebenen
// nicht). Die Defaults sind der gemessene Inhalt der veröffentlichten Seite
// (15.11.2026); der Import überschreibt sie bei Step 2 aus den Instanzwerten.
const navbarControls: Control[] = [
  text("brand", "Marke", "NICK WEBDESIGN", "Inhalt"),
  url("home", "Startseite", "/", "Inhalt"),
  media("logo", "Logo", "https://framerusercontent.com/images/K75U6dIeddSaktsQJqdpbyvHsM.webp?width=512&height=512", "Inhalt"),
  ctrl("links", "Links", "repeater", "list", [
    { label: "Projekte", link: "/projects" },
    { label: "Über mich & Kontakt", link: "/contact" },
  ], { group: "Inhalt", responsive: false, maxItems: 8, fields: [linkField(), targetField()] }),
  text("emailLabel", "E-Mail-Beschriftung", "Email:", "Kontakt"),
  text("email", "E-Mail", "adrian@nick-webdesign.de", "Kontakt"),
  text("ctaLabel", "Knopf-Text", "WhatsApp", "Aktionen"),
  url("ctaLink", "Knopf-Ziel", "https://api.whatsapp.com/send?phone=4915224458557&text=&source=&data=", "Aktionen"),
  toggle("sticky", "Oben haften", false, "Layout"),
  choose("appearance", "Hintergrund", [["transparent", "Transparent"], ["solid", "Deckend"]], "transparent", "Darstellung"),
  toneControl(),
];

const footerControls: Control[] = [
  text("headline", "Überschrift", "Bereit für deine neue Website?", "Inhalt"),
  area("subline", "Untertitel", "Lass uns über Dein Projekt sprechen.\nWir klären, was du brauchst und ob ich dir helfen kann.\nDanach entscheidest du in Ruhe, wie es weitergeht.", "Inhalt"),
  text("formTitle", "Formular: Titel", "Projekt anfragen", "Formular"),
  area("formText", "Formular: Text", "Das Formular wird über Fillout geladen. Öffne es in einem neuen Tab, um dein Projekt zu beschreiben.", "Formular"),
  text("formLabel", "Formular: Knopf", "Formular öffnen", "Formular"),
  url("formUrl", "Formular: Adresse", "https://forms.fillout.com/t/aDdzczda8Mus", "Formular"),
  text("authorName", "Name", "Adrian Nick", "Kontakt"),
  text("authorRole", "Rolle", "WordPress Webdesign Profi", "Kontakt"),
  media("avatar", "Porträt", "https://framerusercontent.com/images/oJAubpok1FvUAyl0yzlWey1Jao.webp?width=561&height=701", "Kontakt"),
  text("contactLabel", "Kontakt: Beschriftung", "Schreib mir", "Kontakt"),
  text("email", "E-Mail", "adrian@nick-webdesign.de", "Kontakt"),
  area("note", "Hinweis", "Wir klären, was du brauchst und ob ich dir helfen kann. Danach entscheidest du in Ruhe, wie es weitergeht.", "Kontakt"),
  ctrl("social", "Soziale Links", "repeater", "list", [
    { label: "Instagram", link: "https://www.instagram.com/nickwebdesign/", icon: "instagram" },
    { label: "WhatsApp", link: "https://api.whatsapp.com/send?phone=4915224458557&text=&source=&data=", icon: "whatsapp" },
    { label: "E-Mail", link: "mailto:adrian@nick-webdesign.de", icon: "mail" },
  ], {
    group: "Kontakt", responsive: false, maxItems: 8,
    fields: [
      linkField(),
      targetField(),
      choose("icon", "Symbol", [["instagram", "Instagram"], ["whatsapp", "WhatsApp"], ["mail", "E-Mail"], ["website", "Website"]], "website", "Inhalt"),
    ],
  }),
  text("footerBrand", "Fußzeile: Marke", "Nick Webdesign", "Fußzeile"),
  media("logo", "Fußzeile: Logo", "https://framerusercontent.com/images/8NulX8sEgiW5OAVpT1p8buN96DI.png?scale-down-to=512&width=1024&height=1024", "Fußzeile"),
  text("legal", "Rechtlicher Text", "Copyright © Nick Webdesign, 2026", "Fußzeile"),
  ctrl("legalLinks", "Rechtliche Links", "repeater", "list", [
    { label: "Impressum", link: "/impressum" },
    { label: "Datenschutzerklärung", link: "/datenschutz" },
  ], { group: "Fußzeile", responsive: false, maxItems: 8, fields: [linkField(), targetField()] }),
  toneControl(),
];

const reviewsControls: Control[] = [
  ctrl("items", "Bewertungen", "repeater", "list", [
    {
      rating: "4.5",
      author: "Markus B.",
      quote: "Adrian hat unsere Website komplett neu aufgesetzt. Das Ergebnis war besser als erwartet - modern, schnell und genau auf unsere Zielgruppe zugeschnitten.",
      avatar: "https://framerusercontent.com/images/jCTtgnV2B1AGNUeBE2tbucgeEQI.png?width=72&height=72",
    },
    {
      rating: "5.0",
      author: "Hassan Hamdaoui",
      quote: "Für uns wurde eine richtig tolle Website erstellt. Modern, übersichtlich und genau auf unsere Bedürfnisse zugeschnitten. Wir sind wirklich super zufrieden mit dem Ergebnis!",
      avatar: "https://framerusercontent.com/images/T5NZF22pmDIFSkLvOUYFDW2WdA.webp?width=320&height=318",
    },
    {
      rating: "5.0",
      author: "Heike Kortmann",
      quote: "Top Arbeit! Die neue Seite läuft einwandfrei und die Ladezeiten sind deutlich besser als vorher. Sehr zufrieden.",
      avatar: "https://framerusercontent.com/images/JjPTFX8Cq4fkN8njEQDVshGOhX0.png?width=72&height=72",
    },
    {
      rating: "5.0",
      author: "Ahlam Lagmouchi",
      quote: "Adrian hat unser komplettes WordPress-Projekt übernommen und sauber umgesetzt. Klare Empfehlung für alle die eine zuverlässige Umsetzung suchen.",
      avatar: "https://framerusercontent.com/images/vJ74FOiSnbR8L7xeuRKTKmy3pZM.webp?scale-down-to=512&width=573&height=485",
    },
    {
      rating: "5.0",
      author: "Burhan Kaya",
      quote: "Schnelle Umsetzung, faire Preise und ein super Ergebnis. Genau das was man sich von einem Webdesigner wünscht.",
      avatar: "https://framerusercontent.com/images/YEFLU55KbfAgBozm5M4ZlLTRig.png?scale-down-to=512&width=800&height=800",
    },
  ], {
    group: "Inhalt", responsive: false, maxItems: 12,
    fields: [
      text("rating", "Bewertung", "", "Inhalt"),
      text("author", "Name", "", "Inhalt"),
      area("quote", "Zitat", "", "Inhalt"),
      media("avatar", "Bild", "", "Inhalt"),
    ],
  }),
  slider("speed", "Laufzeit", 40, 4, 120, 1, "Bewegung", ["s"]),
  toggle("pause", "Bei Hover anhalten", true, "Bewegung"),
  toneControl(),
];

const stepControls: Control[] = [
  text("nr", "Nummer", "01", "Inhalt"),
  text("title", "Leistung", "Webdesign", "Inhalt"),
  area("text", "Beschreibung", "Ich gestalte Webseiten, die heute funktionieren und morgen noch gut aussehen.", "Inhalt"),
  ctrl("points", "Punkte", "repeater", "list", [
    { label: "Klare Layouts:", text: "Ruhige Farben und saubere Strukturen, die Besucher sofort verstehen." },
    { label: "Individuelles Design:", text: "Keine Baukasten-Lösung — deine Seite passt genau zu dir und deinem Angebot." },
    { label: "Responsiv:", text: "Deine Website sieht auf jedem Gerät gut aus — Handy, Tablet und Desktop." },
  ], {
    group: "Inhalt", responsive: false, maxItems: 6,
    fields: [text("label", "Beschriftung", "", "Inhalt"), area("text", "Text", "", "Inhalt")],
  }),
  toneControl(),
];

export const WIDGET_PRIMITIVES: readonly PrimitiveDefinition[] = [
  {
    type: "ribbon-gallery",
    name: "Ribbon Gallery",
    category: "media",
    description: "Bildband als WebGL-Shader (portiert aus Framer). Läuft im Release als Widget-Island, im Editor live; Einstellungen über den Inspector.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: ribbonControls,
    styleGroups: ["spacing", "size", "border", "effects"],
  },
  {
    type: "wave-background",
    name: "Wave Background",
    category: "media",
    description: "Vollflächiger Wellen-Shader als Hintergrund (portiert aus Framer WaveBackground). Läuft im Release als Widget-Island, im Editor live; Einstellungen über den Inspector.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: waveControls,
    styleGroups: ["spacing", "size", "border", "effects"],
  },
  {
    type: "framer-navbar",
    name: "Framer Navigation",
    category: "layout",
    description: "Kopfzeile aus der Framer-Komponente Navbar (fluffy-rectangle): Marke, Links, E-Mail und WhatsApp-Knopf mit Mobilmenü. Inhalte über den Inspector.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: navbarControls,
    styleGroups: ["spacing", "size"],
    dom: true,
  },
  {
    type: "framer-footer",
    name: "Framer Footer",
    category: "layout",
    description: "Fußzeile aus der Framer-Komponente Footer 2: große Ansprache, Formular-Platzhalter, Kontakt, soziale Links und Rechtliches.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: footerControls,
    styleGroups: ["spacing", "size"],
    dom: true,
  },
  {
    type: "framer-step",
    name: "Framer Prozess-Schritt",
    category: "basic",
    description: "Ein Schritt aus der Framer-Komponente Step 2: Leistung, Nummer, Beschreibung und bis zu drei Punkte.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: stepControls,
    styleGroups: ["spacing", "size"],
    dom: true,
  },
  {
    type: "framer-reviews",
    name: "Framer Bewertungs-Ticker",
    category: "basic",
    description: "Laufband aus der Framer-Komponente Ticker reviews item: Bewertungskarten mit Sternen, Zitat und Porträt; hält bei Hover an.",
    container: false,
    allowedChildren: "none",
    slots: {},
    controls: reviewsControls,
    styleGroups: ["spacing", "size"],
    dom: true,
  },
];

const WIDGET_TYPES = new Set(WIDGET_PRIMITIVES.map((p) => p.type));
export function isWidgetPrimitive(type: string): boolean {
  return WIDGET_TYPES.has(type);
}
export function widgetPrimitive(type: string): PrimitiveDefinition | undefined {
  return WIDGET_PRIMITIVES.find((p) => p.type === type);
}
