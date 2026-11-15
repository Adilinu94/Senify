// Die geschlossene Tabelle der portierten Framer-Komponenten (ADR-0036,
// ADR-0038). Sie liegt in einem eigenen Modul, weil sowohl der Mapper als auch
// die styleUrl-Anreicherung sie brauchen: Die Anreicherung muss die Bilder der
// Widget-Defaults als lokale Assets einplanen, bevor der Mapper sie referenziert.

// Schlüssel: normalisierter Komponentenname (klein, ohne Dateiendung, ohne
// Nicht-Alphanumerics). Wert: Widget-Typ.
export const COMPONENT_WIDGETS: Readonly<Record<string, string>> = {
  wavebackground: "wave-background",
  ribbongallery: "ribbon-gallery",
  reviewsticker: "framer-reviews",
  tickerreviewsitem: "framer-reviews",
  navbar: "framer-navbar",
  footer: "framer-footer",
  footer2: "framer-footer",
  step: "framer-step",
  step2: "framer-step",
};

export function widgetTypeForComponent(componentType: string | null): string | undefined {
  if (componentType === null) return undefined;
  const key = componentType
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]/g, "");
  return COMPONENT_WIDGETS[key];
}

// Der Name bleibt für die bestehende Code-Component-Abbildung erhalten; die
// Tabelle deckt seit ADR-0038 auch benannte Framer-Komponenten ab.
export function widgetTypeForCodeComponent(componentType: string | null): string | undefined {
  return widgetTypeForComponent(componentType);
}
