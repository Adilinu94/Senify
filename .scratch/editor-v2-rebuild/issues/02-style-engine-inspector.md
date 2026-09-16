# Editor v2 - Style-Engine und Inspektor (Phase 2)

Status: offen
Abhaengig von: 01-widget-engine-canvas

## Ziel

Der kritische Pfad fuer "Framer like": jede Widget-Instanz ist komplett individuell stylbar.
Phase 2 des Umbauplans.

## Umfang

1. Style-Rule-Registry im Engine-Store: sites.style_rules_json (Migration additiv).
   kind class|ambient|scoped, contextStyles, origin, Kaskaden-Reihenfolge.
2. Inspektor mit drei Tabs (Content / Style / Advanced), Controls generiert aus
   Widget-Definition - nie handgebaut (Registry -> UI bleibt Senify-Philosophie).
3. Style-Tab mit vollen CSS-Faehigkeiten pro Widget:
   - Layout: display, flex-direction/justify/align/gap/wrap, grid-template,
     width/height/min/max, position (static/relative/absolute/sticky), overflow, z-index
   - Box-Model: margin/padding mit verbundenen Feldern + Link-Symbol,
     Einheiten px/%/em/rem/vw, Radius pro Ecke
   - Typografie: font, size, weight, line-height, letter-spacing, align, decoration,
     transform, color
   - Farbe/Hintergrund: Solid, Gradient-Editor, Bild-Fills (asset-ref)
   - Border/Shadow: Border pro Seite, mehrschichtiger Box-Shadow (Layer-Editor)
   - Effekte: Opacity, Blur, Backdrop-Filter, Blend-Mode, Transition
   - Transform: rotate/scale/translate
   - Custom CSS: pro Widget (scoped Rule)
4. Breakpoint-Override-UX: Geraetepunkte an jedem Control (Klick -> Override an/aus,
   Signal bei bestehendem Override, Reset je Breakpoint) - konsistent fuer jede Style-Gruppe.
5. Pseudo-States (:hover / :focus / :active / :disabled) pro Regel mit Forced-State-Preview
   im Canvas (verdoppelter data-node-id-Selektor, Instatic-Muster).
6. Token-Picker neben Freitext in jedem Style-Control ({ $token: accent } bleibt Senify-DNA).
7. MCP-Erweiterung: get_widget, list_widgets, set_styles, create_style_rule.
   Agent bekommt dieselben Style-Faehigkeiten wie der Editor; Guardrails bleiben
   (registrierte Widgets + Schema + Tokens, kein freier CSS-Code vom Agenten).

## Abnahme

- Ein Container wird komplett per Inspektor umgestylt (Farbe, Radius, Shadow, Hover-State,
  Mobil-Override) ohne eine Zeile Section-Code
- Publizierter Output zeigt identisches Ergebnis (Pixel-Diff Canvas vs Bake = 0)
- Geraetepunkt-Signal erscheint bei Override, Reset raeumt auf
