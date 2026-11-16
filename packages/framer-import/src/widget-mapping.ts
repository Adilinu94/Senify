// Die geschlossenen Tabellen der portierten Framer-Komponenten (ADR-0036,
// ADR-0038, ADR-0040). Die Trennung ist wichtig: Ein Code-Component-Placeholder
// (`ReviewsTicker.tsx`) wird auch im HTML-Capture-Pfad zum Widget; eine reguläre
// Framer-Komponente (`Button 2`) nur im Projekt-XML-Pfad, weil ihr Innenleben im
// Capture bereits nativ vorliegt und nicht durch Widget-Defaults ersetzt werden
// darf.

// Schlüssel: normalisierter Komponentenname (klein, ohne Dateiendung, ohne
// Nicht-Alphanumerics).
const CODE_COMPONENT_WIDGETS: Readonly<Record<string, string>> = {
  wavebackground: "wave-background",
  ribbongallery: "ribbon-gallery",
  reviewsticker: "framer-reviews",
};

// Die vier Ports, die auch im HTML-Capture-Pfad aktiv sind. Sie waren vor
// ADR-0040 bereits durch die Fixture-/Visual-Gates abgedeckt; der Capture liefert
// dort dieselben Instanzen. Die fünf neuen Komponenten bleiben Projekt-XML-only,
// weil ihr Instanz-Innenleben im Capture schon nativ vorliegt.
const CAPTURE_COMPONENT_WIDGETS: Readonly<Record<string, string>> = {
  tickerreviewsitem: "framer-reviews",
  navbar: "framer-navbar",
  footer: "framer-footer",
  footer2: "framer-footer",
  step: "framer-step",
  step2: "framer-step",
};

const FRAMER_COMPONENT_WIDGETS: Readonly<Record<string, string>> = {
  ...CAPTURE_COMPONENT_WIDGETS,
  avatarinfo: "framer-avatar-info",
  avatarinfo2: "framer-avatar-info",
  button: "framer-button",
  button2: "framer-button",
  button3: "framer-button",
  ticker: "framer-stats",
  ticker2: "framer-stats",
  viewall: "framer-view-all",
  viewall2: "framer-view-all",
};

function componentKey(componentType: string | null): string | null {
  if (componentType === null) return null;
  return componentType
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]/g, "");
}

export function widgetTypeForComponent(componentType: string | null): string | undefined {
  const key = componentKey(componentType);
  return key === null ? undefined : FRAMER_COMPONENT_WIDGETS[key];
}

export function widgetTypeForCapturedComponent(componentType: string | null): string | undefined {
  const key = componentKey(componentType);
  return key === null ? undefined : CAPTURE_COMPONENT_WIDGETS[key];
}

export function widgetTypeForCodeComponent(componentType: string | null): string | undefined {
  const key = componentKey(componentType);
  if (key === null) return undefined;
  // Die vier Bestandsports waren historisch auch für Capture-Platzhalter aktiv;
  // das hält die Fixture-Gates bei den exportierten Seiten stabil. Die fünf
  // neuen Ports bleiben bewusst außen vor (ADR-0040).
  return CODE_COMPONENT_WIDGETS[key] ?? CAPTURE_COMPONENT_WIDGETS[key];
}
