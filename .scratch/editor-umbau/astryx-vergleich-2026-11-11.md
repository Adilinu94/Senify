# Astryx gegen Senify: Dialog-Vergleich (Paket E, erste Stufe)

Stand: 11.11.2026. Messskript: `.scratch/editor-umbau/astryx-vergleich-2026-11-11.mts` (tsx, Playwright, Chromium headless).
Senify-Seite: `askConfirm` aus `packages/app/public/app-core.js`, aufgerufen von einem Test-Knopf, den das Skript in die Dashboard-Seite legt.
Astryx-Seite: der isolierte Prototyp aus `astryx-probe-2026-11-11.md` (`@astryxdesign/core` 0.7.13, React 19.2). Nichts davon ist im Senify-Code integriert.

## Ergebnis je Zustand

| Prüfung | Senify `askConfirm` | Astryx `Dialog` |
| --- | --- | --- |
| Bauart | native `<dialog>` mit `showModal()` | native `<dialog>` mit `aria-modal="true"` |
| Name | `aria-labelledby` auf die Überschrift | `aria-label`, vom Aufrufer gesetzt |
| Startfokus bei Löschfrage | „Abbrechen" | „Abbrechen" |
| Enter auf dem Startfokus | schließt, löscht nicht | schließt, löscht nicht |
| Tab | verlässt den Dialog nur zur Browseroberfläche (`activeElement` ist dann `body`), nie zur Seite dahinter | Fokus kreist im Dialog |
| Escape | schließt, Fokus zurück auf den Auslöser | schließt, Fokus zurück auf den Auslöser |
| Klick auf den Hintergrund | schließt | schließt nicht |
| 390 x 844, langer Name | Dialog im Viewport, kein Seitenüberlauf; **Überschrift ragte aus dem Dialog (467 px in 316 px)** | Dialog im Viewport, kein Seitenüberlauf; die Überschrift ist Inhalt des Prototyps und hat denselben Überlauf |
| Kontrast Überschrift hell / dunkel | 10,43 / 14,2 | 21 / 15,13 |

## Befund und Korrektur

Der lange Name ohne Leerzeichen ragte in Senifys Rückfrage aus der Überschrift. Der Absatz darunter brach schon um (`overflow-wrap: anywhere`), die Überschrift nicht. Das ist ein Senify-Fehler, kein Astryx-Argument.
Korrektur: `dialog.ask-dialog h2 { overflow-wrap: anywhere; }` in `packages/app/public/app.css`. Roter Test vor der Korrektur (467 > 317), danach grün: `packages/app/test/dialog-langer-titel-browser.test.ts`.

## Einordnung

- Beide Dialoge sind native `<dialog>`. Astryx liefert im Dialog kein Verhalten, das Senify nicht schon hat; es fehlt dort der Klick auf den Hintergrund.
- Senifys Oberfläche (Dashboard, Inspector, Strukturbaum) ist aus DOM-Bauern ohne React gebaut; React kommt nur im Canvas-Renderer vor (`packages/editor/src/react-renderer.tsx`), in `packages/app/public/*.js` gar nicht. Astryx-Komponenten sind React-Komponenten mit `@stylexjs/stylex` als Peer-Abhängigkeit. Jedes Control im Inspector bräuchte eine eigene React-Wurzel oder den Umbau der Inspector-Zeilen auf React. Das ist die eigentliche Integrationskosten-Frage, nicht das Aussehen.
- Größe: der eigenständige Probe-Build ist 553 925 Byte JavaScript und 298 560 Byte CSS (mit React). `askConfirm` kostet keine zusätzlichen Byte. Der Anteil in Senify wäre nur mit einem echten Produktions-Bundle messbar; das ist nicht geschehen.
- Der Probe-Build setzt `data-theme` und `data-astryx-theme` am Dokumentelement. Senify schaltet über `data-mode`; eine Wechselwirkung ist ungeprüft.

## Nicht geprüft

- Inspector-Control (Textfeld) in den Zuständen Hover, Fokus, deaktiviert, Fehler. Der Dialog zeigt keinen Verhaltensgewinn, der Integrationsaufwand hängt nicht am Control; deshalb nicht gemessen.
- Screenreader, Canvas-Interaktion, CSS-Isolation von `reset.css`, Produktions-Bundle, Lizenzkette der Abhängigkeiten.

## Empfehlung

Astryx jetzt nicht integrieren. Der Vergleich liefert keinen Dialog-Vorteil und eine Architekturhürde (React-Inseln in einer DOM-gebauten Oberfläche). Ein neuer Versuch lohnt erst, wenn die Inspector-Zeilen ohnehin auf React umgestellt werden oder ein Control fehlt, das Senify nicht in vertretbarer Zeit selbst baut.
