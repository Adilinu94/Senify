/* =====================================================================
   Senify — Prototyp, Daten und Symbole
   =====================================================================

   Alles hier ist Demo-Material (synthetisch bzw. eigene Inhalte des
   Betreibers). Keine erfundenen Kunden, Preise oder Benchmarks.
   Symbole: eigene Zeichnungen, 16x16, ein Strich (1,5), runde Enden —
   keine Unicode-Zeichen als Symbolersatz.
   ===================================================================== */

window.ICONS = (() => {
  const P = {
    home: "M2.5 7.5 8 3l5.5 4.5M4 7v5.5h8V7",
    pages: "M4.5 2.5h4.5l2.5 2.5v8.5h-7zM9 2.5V5h2.5",
    editor: "M3 13l1-3.5L11.5 2 14 4.5 6.5 12z M10.5 3l2.5 2.5",
    cms: "M8 2.5c2.8 0 5 .9 5 2s-2.2 2-5 2-5-.9-5-2 2.2-2 5-2zM3 4.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7M3 8c0 1.1 2.2 2 5 2s5-.9 5-2",
    media: "M2.5 3.5h11v9h-11zM2.5 10.5l3-3 2.5 2.5L11 7l2.5 2.5M5.8 6.3a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8z",
    references: "M3 3.5h6.5v9.5H5A2 2 0 0 1 3 11zM9.5 3.5H13v9.5h-3.5M5.5 6h2.5M5.5 8.5h2.5",
    review: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM5.5 8.3l1.8 1.8 3.4-3.7",
    releases: "M4 2.5v11M4 3h7.5L10 5.5 11.5 8H4",
    jobs: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 5.2V8l2 1.4",
    settings: "M8 5.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM8 2.2v1.6M8 12.2v1.6M2.2 8h1.6M12.2 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12",
    design: "M2.5 3.5h11v11h-11zM2.5 8h11M8 8v6.5",
    agent: "M8 2.5l1.1 3.4L12.5 7 9.1 8.1 8 11.5 6.9 8.1 3.5 7l3.4-1.1zM12.3 11l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z",
    plus: "M8 3.5v9M3.5 8h9",
    minus: "M3.5 8h9",
    chevronDown: "M4.5 6.5 8 10l3.5-3.5",
    chevronRight: "M6.5 4.5 10 8l-3.5 3.5",
    chevronUp: "M4.5 9.5 8 6l3.5 3.5",
    search: "M7.2 3.2a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM10.2 10.2 13 13",
    eye: "M1.5 8S4 4.5 8 4.5 14.5 8 14.5 8 12 11.5 8 11.5 1.5 8 1.5 8zM8 6.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z",
    eyeOff: "M2 2l12 12M6.6 4.4A6.7 6.7 0 0 1 8 4.3c4 0 6.5 3.7 6.5 3.7a12 12 0 0 1-2.4 2.6M4.2 5.8A12 12 0 0 0 1.5 8s2.5 3.7 6.5 3.7c.8 0 1.6-.2 2.3-.5",
    lock: "M3.5 7h9v6h-9zM5.5 7V5a2.5 2.5 0 0 1 5 0v2",
    unlock: "M3.5 7h9v6h-9zM5.5 7V5a2.5 2.5 0 0 1 4.8-.8",
    undo: "M3 8h6.5a3 3 0 0 1 0 6H6M3 8l3-3M3 8l3 3",
    redo: "M13 8H6.5a3 3 0 0 0 0 6H10M13 8l-3-3M13 8l-3 3",
    play: "M5.5 3.5 12 8l-6.5 4.5z",
    pause: "M6 3.5v9M10 3.5v9",
    grid: "M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z",
    ruler: "M2 6h12v4H2zM5 6v2M8 6v2.6M11 6v2",
    magnet: "M4 3v6a4 4 0 0 0 8 0V3M4 3h2.5M9.5 3H12M4 6h2.5M9.5 6H12",
    monitor: "M2 3h12v8H2zM6 13h4M8 11v2",
    tablet: "M4 2h8v12H4zM7.4 12h1.2",
    phone: "M5 2h6v12H5zM7.4 12h1.2",
    trash: "M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.6 9h4.8l.6-9M7 7v4M9 7v4",
    copy: "M5.5 5.5h8v8h-8zM3.5 10.5V4a1.5 1.5 0 0 1 1.5-1.5h6.5",
    grip: "M5.6 4.4a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4zM10.4 4.4a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4zM5.6 8.7a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4zM10.4 8.7a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4zM5.6 13a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4zM10.4 13a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4z",
    arrowUp: "M8 12.5v-9M4.5 7 8 3.5 11.5 7",
    arrowDown: "M8 3.5v9M4.5 9 8 12.5 11.5 9",
    arrowLeft: "M3.5 8h9M7 4.5 3.5 8 7 11.5",
    arrowRight: "M12.5 8h-9M9 4.5 12.5 8 9 11.5",
    x: "M4 4l8 8M12 4l-8 8",
    check: "M3.5 8.5l3 3 6-7",
    alert: "M8 2.5l6 11H2zM8 6.5v3.5M8 11.7h.01",
    info: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 7.5V11M8 5.1h.01",
    sun: "M8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1",
    moon: "M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z",
    layers: "M8 2.5 14 6l-6 3.5L2 6zM2 9.5 8 13l6-3.5",
    component: "M8 2l6 6-6 6-6-6z",
    text: "M3.5 4V3h9v1M8 3v10M6 13h4",
    box: "M8 2.5l5.5 3v5l-5.5 3-5.5-3v-5zM2.5 5.5 8 8.5l5.5-3M8 8.5v5.5",
    link: "M6.5 9.5a2.5 2.5 0 0 1 0-3.5l2-2a2.5 2.5 0 0 1 3.5 3.5l-1 1M9.5 6.5a2.5 2.5 0 0 1 0 3.5l-2 2a2.5 2.5 0 0 1-3.5-3.5l1-1",
    filter: "M2.5 4h11M4.5 8h7M6.5 12h3",
    download: "M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10",
    upload: "M8 11.5v-8M4.5 6.5 8 3l3.5 3.5M3 13.5h10",
    refresh: "M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5",
    external: "M6 4H4.5A1.5 1.5 0 0 0 3 5.5v6A1.5 1.5 0 0 0 4.5 13h6a1.5 1.5 0 0 0 1.5-1.5V10M9.5 3H13v3.5M13 3 7.5 8.5",
    more: "M8 4.6a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6zM8 8.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6zM8 13a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6z",
    moreH: "M4.6 8a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0zM8.8 8a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0zM13 8a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0z",
    folder: "M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z",
    clock: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 5.2V8l2 1.4",
    rocket: "M8 2.5c2 1.5 3 3.6 3 6l-3 2-3-2c0-2.4 1-4.5 3-6zM5 10.5 3.5 13M11 10.5 12.5 13M8 7.2h.01",
    flag: "M4 2.5v11M4 3h7.5L10 5.5 11.5 8H4",
    dot: "M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
  };
  return {
    /** Symbol als SVG-Zeichenkette. */
    get(name, size) {
      const d = P[name] || P.box;
      const s = size || 16;
      return `<svg class="icon" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    },
    has(name) { return !!P[name]; },
  };
})();

window.PROTO = {
  site: {
    name: "Nick Webdesign",
    slug: "nick-webdesign",
    profile: "showcase",
    domain: "nick-webdesign.de",
    updated: "Heute, 14:26",
  },

  pages: [
    { id: "home", title: "Home", path: "/", status: "published", version: 12, updated: "Heute, 14:26", author: "Mensch", sections: 5 },
    { id: "leistungen", title: "Leistungen", path: "/leistungen", status: "draft", version: 7, updated: "Heute, 11:02", author: "Agent", sections: 4 },
    { id: "ueber", title: "Über mich", path: "/ueber", status: "published", version: 4, updated: "Gestern, 18:40", author: "Mensch", sections: 3 },
    { id: "blog", title: "Blog", path: "/blog", status: "published", version: 3, updated: "19.09., 09:15", author: "Agent", sections: 3, dynamic: true },
    { id: "kontakt", title: "Kontakt", path: "/kontakt", status: "draft", version: 2, updated: "19.09., 08:50", author: "Mensch", sections: 3 },
  ],

  releases: [
    { id: "r12", n: "12", at: "Heute, 14:31", author: "Mensch", note: "Startseite: Hero getauscht, CTA ergänzt", pages: 5, active: true, parity: "3 abweichende Bildpunkte von 53.760 (0,000056)" },
    { id: "r11", n: "11", at: "Gestern, 19:04", author: "Agent", note: "Leistungen: Karten mit Bindings", pages: 5, active: false, parity: "0 abweichende Bildpunkte" },
    { id: "r10", n: "10", at: "20.09., 16:22", author: "Mensch", note: "Blog: Detailseiten-Route", pages: 5, active: false, parity: "1 abweichender Bildpunkt" },
    { id: "r9", n: "9", at: "19.09., 20:10", author: "Mensch", note: "Erstes Release nach Umbau", pages: 4, active: false, parity: "0 abweichende Bildpunkte" },
  ],

  jobs: [
    { id: "j-214", kind: "bake", label: "Re-Bake /blog/detail", detail: "Auslöser: Entry „10 Dinge …“ veröffentlicht", status: "running", at: "14:31", attempts: 1 },
    { id: "j-213", kind: "bake", label: "Re-Bake / und /leistungen", detail: "Auslöser: Release 12", status: "done", at: "14:31", attempts: 1 },
    { id: "j-212", kind: "image", label: "Bild: hero-werkstatt.png", detail: "Provider: image-use (ChatGPT), 1536×1024", status: "done", at: "13:58", attempts: 1 },
    { id: "j-211", kind: "bake", label: "Re-Bake /kontakt", detail: "Auslöser: Seitenänderung", status: "failed", at: "11:07", attempts: 3, error: "Formular-Token: Signatur-Schlüssel fehlt (SENIFY_FORM_SECRET)" },
    { id: "j-210", kind: "image", label: "Bild: team-portrait.png", detail: "Provider: ComfyUI (lokal)", status: "queued", at: "11:02", attempts: 0 },
  ],

  collections: [
    { id: "blog", name: "Blog", slug: "blog", entries: 4, published: 3, fields: ["Titel", "Slug", "Datum", "Bild", "Lesezeit", "Kategorie", "Status"] },
    { id: "leistungen", name: "Leistungen", slug: "leistungen", entries: 4, published: 4, fields: ["Titel", "Beschreibung", "Bild", "Reihenfolge"] },
    { id: "referenzen", name: "Kundenstimmen", slug: "kundenstimmen", entries: 3, published: 3, fields: ["Zitat", "Name", "Projekt"] },
  ],

  entries: {
    blog: [
      { id: "e1", title: "10 Dinge, die niemand über Webdesign erzählt", slug: "10-dinge-webdesign", date: "23.07.2026", read: "8 Min", category: "Freelance", status: "published", updated: "25.07.2026, 22:21" },
      { id: "e2", title: "Die Geschichte des Webdesigns", slug: "geschichte-des-webdesigns", date: "12.07.2026", read: "6 Min", category: "Wissen", status: "published", updated: "12.07.2026, 10:05" },
      { id: "e3", title: "Die besten Ressourcen online", slug: "beste-ressourcen", date: "02.07.2026", read: "4 Min", category: "Tools", status: "published", updated: "02.07.2026, 09:12" },
      { id: "e4", title: "Der schlechteste Rat, den ich je bekam", slug: "schlechtester-rat", date: "28.06.2026", read: "5 Min", category: "Meinung", status: "draft", updated: "Heute, 14:02" },
    ],
  },

  submissions: [
    { id: "s1", form: "Kontakt", name: "M. Berger", email: "m.berger@example.com", message: "Ich brauche eine neue Seite für mein Studio.", at: "Heute, 13:12", status: "neu" },
    { id: "s2", form: "Kontakt", name: "L. Sommer", email: "l.sommer@example.com", message: "Relax: Bestehende Seite modernisieren.", at: "Gestern, 17:44", status: "neu" },
    { id: "s3", form: "Newsletter", name: "T. Kraus", email: "t.kraus@example.com", message: "Double-Opt-In bestätigt.", at: "20.09., 09:31", status: "bestätigt" },
  ],

  assets: [
    { id: "a1", name: "hero-werkstatt.png", w: 1536, h: 1024, kb: 284, alt: true, tag: "Bilder" },
    { id: "a2", name: "hero-desktop.webp", w: 1440, h: 900, kb: 156, alt: true, tag: "Bilder" },
    { id: "a3", name: "hero-mobile.webp", w: 390, h: 780, kb: 74, alt: true, tag: "Bilder" },
    { id: "a4", name: "team-portrait.png", w: 1024, h: 1024, kb: 210, alt: false, tag: "Bilder" },
    { id: "a5", name: "projekt-shop.webp", w: 1200, h: 800, kb: 132, alt: false, tag: "Projekte" },
    { id: "a6", name: "logo-nick.svg", w: 320, h: 96, kb: 12, alt: true, tag: "Marke" },
    { id: "a7", name: "muster-raster.svg", w: 64, h: 64, kb: 3, alt: false, tag: "Flächen" },
    { id: "a8", name: "werkstatt-02.jpg", w: 1920, h: 1280, kb: 421, alt: false, tag: "Projekte" },
  ],

  refCollections: ["Alle", "SaaS & Tech", "Portfolio", "Editorial", "Shop"],
  references: [
    { id: "ref1", name: "Syntiq", collection: "SaaS & Tech", family: "Swiss Grid", url: "syntiq.example", vocabulary: ["Raster", "Zahl", "Ruhe"], color: "#0f172a" },
    { id: "ref2", name: "Mondrian Blocks", collection: "Portfolio", family: "Constructivist", url: "mondrian.example", vocabulary: ["Block", "Kante", "Rot"], color: "#b91c1c" },
    { id: "ref3", name: "The Cobb Hotel", collection: "Editorial", family: "Editorial Serif", url: "cobb.example", vocabulary: ["Serif", "Luft", "Foto"], color: "#44403c" },
    { id: "ref4", name: "Carbon Lab", collection: "SaaS & Tech", family: "Dark Technical", url: "carbon.example", vocabulary: ["Dunkel", "Mono", "Daten"], color: "#111827" },
    { id: "ref5", name: "Hotcurls", collection: "Shop", family: "Playful", url: "hotcurls.example", vocabulary: ["Rund", "Farbe", "Bewegt"], color: "#db2777" },
    { id: "ref6", name: "Virtal Vital", collection: "SaaS & Tech", family: "Soft Gradient", url: "virtal.example", vocabulary: ["Weich", "Verlauf", "Karte"], color: "#2563eb" },
  ],

  reviews: [
    {
      id: "rev-31", page: "Leistungen", at: "Heute, 11:04", author: "Agent", status: "offen",
      summary: "Karten-Sektion mit Bindings an die Collection „Leistungen“; 2 Sektionen ersetzt, 1 neu.",
      diff: [
        { kind: "same", before: "section.hero", after: "section.hero" },
        { kind: "del", before: "div.cards-static", after: "" },
        { kind: "add", before: "", after: "div.cards[data-collection=leistungen]" },
        { kind: "add", before: "", after: "component.card (×4)" },
        { kind: "same", before: "section.cta", after: "section.cta" },
      ],
      checks: [
        { kind: "ok", label: "Links", note: "34 geprüft, 0 tot" },
        { kind: "ok", label: "Alt-Texte", note: "4 Bilder, 4 gesetzt" },
        { kind: "warn", label: "Kontrast", note: "1 Hinweis: .card-sub auf #f4f4f8" },
        { kind: "ok", label: "Parität", note: "0 abweichende Bildpunkte" },
      ],
    },
  ],

  motionPresets: [
    { id: "fade-up", name: "Fade up", detail: "Auftritt, 24 px" },
    { id: "fade", name: "Fade", detail: "Auftritt, nur Deckkraft" },
    { id: "slide", name: "Slide", detail: "Auftritt, seitlich" },
    { id: "scale", name: "Scale", detail: "Auftritt, 96 % → 100 %" },
    { id: "blur", name: "Blur", detail: "Auftritt, Weichzeichnen" },
    { id: "stagger", name: "Stagger", detail: "Reihe, versetzt" },
    { id: "scroll-scrub", name: "Scroll-Scrub", detail: "an die Scrollposition gebunden" },
    { id: "hover-lift", name: "Hover-Lift", detail: "Zeiger, 2 px" },
    { id: "page-fade", name: "Page-Fade", detail: "Seitenwechsel" },
    { id: "webgl-scene", name: "3D-Szene", detail: "showcase, 1× je Seite" },
  ],

  chat: [
    { who: "human", text: "Bau die Leistungen-Sektion auf die Collection um und zeig mir den Plan." },
    { who: "agent", text: "Ich lese die Seite und die Collection „Leistungen“ (4 Einträge). Plan: statische Karten durch eine Liste mit Bindings ersetzen, Bild und Titel binden, Rest bleibt.", tools: [
      { name: "get_page", status: "fertig", result: "9 Sektionen, 214 Knoten" },
      { name: "get_collection", status: "fertig", result: "4 Felder, 4 Einträge" },
    ] },
    { who: "agent", text: "Ich schreibe in den Entwurf (2 Mutationen) und baue eine Vorschau.", tools: [
      { name: "apply_mutations", status: "fertig", result: "2 Mutationen, Entwurf v43" },
      { name: "create_preview", status: "fertig", result: "Vorschau 30 Tage gültig" },
    ] },
    { who: "human", text: "Sieht gut aus. Übernimm die Karten-Varianten." },
    { who: "agent", text: "Der nächste Schritt schreibt in den Entwurf. Das braucht deine Freigabe.", approval: {
      title: "4 Karten-Instanzen anlegen",
      detail: "component.card@3 wird 4× mit Overrides aus der Collection eingesetzt (Entwurf v43 → v44).",
    } },
    { who: "agent", text: "Erledigt. Ein Undo-Schritt je Richtung; der aktive Release bleibt unverändert.", tools: [
      { name: "update_component_instances", status: "fertig", result: "4 Instanzen auf v3 gehoben" },
    ], revert: true },
  ],

  publishChecks: [
    { kind: "ok", label: "Struktur", note: "NodeTree gültig, keine verwaisten Regeln" },
    { kind: "ok", label: "Links", note: "34 Links, 0 tot" },
    { kind: "ok", label: "Alt-Texte", note: "8 Bilder, 7 mit Alt-Text, 1 dekorativ markiert" },
    { kind: "warn", label: "Kontrast", note: "1 Hinweis: .card-sub auf #f4f4f8 (4,4:1 statt 4,5:1)" },
    { kind: "ok", label: "Motion", note: "Reduced-Motion-Regel vorhanden, Presets erlaubt (showcase)" },
    { kind: "ok", label: "Komponenten", note: "keine Drift, alle Instanzen aktuell" },
  ],

  tree: [
    { id: "n1", kind: "section", tag: "section", label: "Hero", classes: "hero", open: true, children: [
      { id: "n2", kind: "container", tag: "div", label: "Container", classes: "wrap", open: true, children: [
        { id: "n3", kind: "text", tag: "h1", label: "Ich kümmere mich um deine Webseite", classes: "hero-title" },
        { id: "n4", kind: "text", tag: "p", label: "Ich gestalte einzigartige Webseiten …", classes: "hero-lead" },
        { id: "n5", kind: "container", tag: "div", label: "Actions", classes: "hero-actions", open: true, children: [
          { id: "n6", kind: "component", tag: "a", label: "Button", classes: "btn btn--primary" },
          { id: "n7", kind: "component", tag: "a", label: "Button quiet", classes: "btn btn--quiet" },
        ] },
      ] },
      { id: "n8", kind: "image", tag: "img", label: "hero-werkstatt.png", classes: "hero-media" },
    ] },
    { id: "n9", kind: "section", tag: "section", label: "Leistungen", classes: "services", open: true, children: [
      { id: "n10", kind: "text", tag: "h2", label: "Meine Leistungen im Überblick", classes: "section-title" },
      { id: "n11", kind: "container", tag: "div", label: "Karten", classes: "cards", open: false, children: [
        { id: "n12", kind: "component", tag: "article", label: "Card", classes: "card" },
        { id: "n13", kind: "component", tag: "article", label: "Card", classes: "card" },
        { id: "n14", kind: "component", tag: "article", label: "Card", classes: "card" },
      ] },
    ] },
    { id: "n15", kind: "section", tag: "section", label: "Stimme", classes: "quote", open: false, children: [
      { id: "n16", kind: "text", tag: "blockquote", label: "„Schnell, sauber, direkt.“", classes: "quote-text" },
    ] },
    { id: "n17", kind: "section", tag: "section", label: "CTA", classes: "cta", open: false, children: [
      { id: "n18", kind: "text", tag: "h2", label: "Bereit für eine Seite, die passt?", classes: "cta-title" },
      { id: "n19", kind: "component", tag: "a", label: "Button", classes: "btn btn--primary" },
    ] },
    { id: "n20", kind: "section", tag: "footer", label: "Footer", classes: "footer", open: false, hidden: false, locked: true, children: [
      { id: "n21", kind: "text", tag: "p", label: "© 2026 Nick Webdesign", classes: "footer-copy" },
    ] },
  ],

  inspector: [
    { id: "layout", title: "Anzeige", open: true, fields: [
      { key: "display", label: "Anzeige", kind: "select", value: "Flex", options: ["Block", "Flex", "Grid", "Inline"] },
      { key: "direction", label: "Richtung", kind: "select", value: "Spalte", options: ["Zeile", "Spalte"] },
      { key: "align", label: "Ausrichten", kind: "select", value: "Start", options: ["Start", "Zentriert", "Ende", "Gestreckt"] },
      { key: "justify", label: "Verteilen", kind: "select", value: "Start", options: ["Start", "Zentriert", "Ende", "Zwischen"] },
    ] },
    { id: "size", title: "Größe", open: true, fields: [
      { key: "w", label: "Breite", kind: "number", value: "100", unit: "%" },
      { key: "h", label: "Höhe", kind: "number", value: "auto", unit: "" },
      { key: "maxW", label: "Max. Breite", kind: "number", value: "1120", unit: "px", device: true },
      { key: "minH", label: "Min. Höhe", kind: "number", value: "0", unit: "px" },
    ] },
    { id: "type", title: "Typografie", open: true, fields: [
      { key: "family", label: "Schrift", kind: "select", value: "Inter Display", options: ["Inter", "Inter Display", "System"] },
      { key: "size", label: "Größe", kind: "number", value: "56", unit: "px", device: true },
      { key: "weight", label: "Gewicht", kind: "select", value: "600", options: ["400", "500", "600"] },
      { key: "lh", label: "Zeilenhöhe", kind: "number", value: "1.08", unit: "" },
      { key: "track", label: "Laufweite", kind: "number", value: "-0.02", unit: "em" },
      { key: "align", label: "Ausrichtung", kind: "select", value: "Links", options: ["Links", "Zentriert", "Rechts"] },
    ] },
    { id: "color", title: "Farben", open: true, fields: [
      { key: "color", label: "Schrift", kind: "color", value: "#111116", token: "ink-strong" },
      { key: "bg", label: "Fläche", kind: "color", value: "transparent", token: "" },
    ] },
    { id: "spacing", title: "Abstand", open: false, fields: [
      { key: "pad", label: "Innen", kind: "quad", value: ["0", "0", "48", "0"], unit: "px" },
      { key: "margin", label: "Außen", kind: "quad", value: ["0", "0", "0", "0"], unit: "px" },
      { key: "gap", label: "Zwischenraum", kind: "number", value: "16", unit: "px" },
    ] },
    { id: "border", title: "Rahmen", open: false, fields: [
      { key: "bw", label: "Stärke", kind: "number", value: "0", unit: "px" },
      { key: "bs", label: "Stil", kind: "select", value: "Kein", options: ["Kein", "Fest", "Gepunktet"] },
      { key: "radius", label: "Radius", kind: "number", value: "0", unit: "px" },
    ] },
    { id: "effects", title: "Schatten", open: false, fields: [
      { key: "shadow", label: "Schatten", kind: "select", value: "Kein", options: ["Kein", "Schwebend", "Dialog"] },
      { key: "opacity", label: "Deckkraft", kind: "slider", value: 100, unit: "%" },
    ] },
    { id: "motion", title: "Bewegung", open: false, fields: [
      { key: "preset", label: "Preset", kind: "select", value: "fade-up", options: ["kein", "fade-up", "fade", "slide", "scale", "stagger", "scroll-scrub"] },
      { key: "intensity", label: "Intensität", kind: "slider", value: 5, unit: "" },
      { key: "trigger", label: "Auslöser", kind: "select", value: "Sichtbar", options: ["Sichtbar", "Scrollen", "Zeiger", "Laden"] },
      { key: "delay", label: "Verzögerung", kind: "number", value: "0", unit: "ms" },
    ] },
  ],

  tokenScales: {
    color: ["#111116", "#2e2e33", "#55545f", "#75747f", "#94939b", "#ceced1", "#e3e2ec", "#f4f4f8", "#ffffff"],
    lime: ["#c9f24c"],
    type: ["13", "15", "17", "20", "24", "30", "34", "44"],
    motion: ["120 ms", "160 ms", "200 ms", "240 ms", "1200 ms"],
  },

  audit: [
    { at: "14:31", actor: "mensch", action: "publish_release", detail: "Release 12 aktiviert" },
    { at: "14:26", actor: "mensch", action: "apply_mutations", detail: "3 Mutationen, Entwurf v43" },
    { at: "11:04", actor: "agent", action: "submit_for_review", detail: "Leistungen: Karten-Bindings" },
    { at: "11:02", actor: "agent", action: "apply_mutations", detail: "2 Mutationen, Entwurf v42" },
    { at: "09:15", actor: "agent", action: "create_preview", detail: "Vorschau für Review 31" },
  ],
};
