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

const radiusDefault: SpacingValue = { top: "5px", right: "5px", bottom: "5px", left: "5px", isLinked: true, unit: "px" };

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
];

const WIDGET_TYPES = new Set(WIDGET_PRIMITIVES.map((p) => p.type));
export function isWidgetPrimitive(type: string): boolean {
  return WIDGET_TYPES.has(type);
}
export function widgetPrimitive(type: string): PrimitiveDefinition | undefined {
  return WIDGET_PRIMITIVES.find((p) => p.type === type);
}
