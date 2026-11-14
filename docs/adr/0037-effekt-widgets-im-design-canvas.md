# ADR-0037: Effekt-Widgets im Design-Canvas

**Status:** Angenommen, 14.11.2026
**Betrifft:** `packages/editor` (Canvas, UI-State), `packages/app` (Topbar), `packages/widget-engine`, `packages/widgets`
**Ergänzt:** ADR-0035

## Kontext

Native Effekt-Widgets (Ribbon Gallery, Wave Background und künftige Shader-Kerne) liefen bisher
nur im Live-Modus. Der Design-Canvas zeigte den Poster bzw. die Platte. Für die Bearbeitung ist
das kein WYSIWYG: Größe, Ausschnitt und Wirkung des Effekts sind erst nach einem Moduswechsel
sichtbar. Der Host und der Poster liegen im Design bereits im DOM; `injectWidgetRuntime` ist
modus-unabhängig und beherrscht den In-Place-Pfad über `setProps`.

## Entscheidung

1. **Widget-Kerne laufen in Design und Live.** `injectWidgetRuntime` wird in `renderEntry` für
   beide Modi aufgerufen. Der Live-Modus behält `injectLiveMotion` (Loader, Lenis, Reveals);
   Seitenverhalten bleibt dort, im Design laufen nur die Widget-Effekte.
2. **Default an, mit einem sichtbaren Schalter.** Die Topbar hat neben „Live“ einen Schalter
   „Effekte“ (`data-action="canvas-effects"`). Er schaltet die Design-Effekte an/aus, ohne den
   Live-Modus zu verändern.
3. **Persistenz im UI-State.** `EditorUiState.effects` (Default `true`) wird wie Gerät, Zoom und
   Modus pro Seite gespeichert und beim nächsten Laden wiederhergestellt.
4. **Ein Design-Sheet.** Effekte laufen nur im aktiven Design-Rahmen; beim Umschalten des Geräts
   wird der Rahmen neu aufgebaut. Der Handle-Cache räumt entfernte Hosts ab.
5. **Poster-Fallback.** Bei deaktivierten Effekten, fehlendem WebGL oder einem Fehler bleibt der
   Poster sichtbar; der Host trägt `data-widget-state="pending"` bzw. `"failed"`.
6. **Umschalten ist ein Neumount.** `setEffects(false/true)` baut den Design-Rahmen neu auf.
   Dadurch entstehen keine toten Canvas-Elemente oder verwaisten WebGL-Kontexte.

## Verworfene Alternativen

- **Immer an, ohne Schalter:** kein Ausweg bei GPU-/CPU-Last oder vielen Effekten.
- **Nur ausgewähltes Widget oder Play-Knopf:** kein flächiges WYSIWYG, der Nutzer will den Effekt
  beim Bearbeiten sehen.
- **Separates Vorschaufenster:** zusätzliche Oberfläche und kein Bild im Canvas.

## Folgen

- **Positiv:** echte Effekte beim Bearbeiten; Inspector-Änderungen laufen über `setProps` ohne
  Remount; der Release-Weg bleibt unverändert.
- **Last:** mehrere WebGL-Kontexte auf einem Sheet. Der Schalter, ein Sheet und das bestehende
  Cleanup begrenzen das Risiko; der Poster bleibt der Fallback.
- **Abgrenzung:** Kein Loader, kein Lenis und keine Seiten-Reveals im Design. Der Live-Modus
  bleibt die release-nahe Vorschau.
- **Bake/Release:** unverändert; das Island-Script mountet weiterhin nur im gebackenen Dokument.

## Belege

- `packages/editor/src/canvas/canvas.ts` (`effects`, `setEffects`, `renderEntry`)
- `packages/editor/src/state/ui-state.ts` (`EditorUiState.effects`)
- `packages/app/public/app-editor-canvas.js` (Topbar-Schalter, Session-Anbindung)
- `packages/app/test/editor-widget-browser.test.ts` (Design-Mount, Poster, Schalter, setProps)
- `packages/editor/test/state/session.test.ts` (Persistenz Default/aus)
- `.scratch/origin-home/design-effects.png` (echter Editor, 484 Frames; aus/an)
