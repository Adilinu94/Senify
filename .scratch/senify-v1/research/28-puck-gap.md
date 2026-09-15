# Research 28 — Puck-v0.23-Gap-Analyse (Ticket 24 „Editor-Alignment: Instatic-Muster")

> **Stand:** 15.09.2026 · **Ticket:** `24-editor-alignment` · **Status:** abgeschlossen
> **Quelle:** Shallow-Clone `C:\Users\adini\projects\Senify\Repos\puck` — `@puckeditor/core@0.23.0` (Commit `cb7360dd`, 15.09.2026; Release 0.23.0 laut CHANGELOG 07.08.2026). Alle Pfade sind relativ zum Clone-Root.
> **Auftrag:** Gap-Analyse der 10 Instatic-Editor-Muster (Ticket 24) gegen Puck v0.23: Was ist out-of-the-box (OOB), was braucht Overrides, was Eigenbau — mit Aufwand S/M/L und Belegen.
> **Kontext-Dateien:** `research/16-editor-basis.md` (Puck-Basisentscheid), `research/23-instatic-deepdive.md` (§3 Editor-Muster), `research/26-instatic-delta.md` (§1 Content-Workspace/LiveCanvas).

---

## Executive Summary

1. **Puck v0.23 deckt deutlich mehr ab als Research 16 (Stand v0.23-Doku) vermutete.** Insbesondere existieren **Inline-Editing** (seit 0.20, inkl. exportiertem `InlineTextField` und TipTap-Inline-Rich-Text seit 0.21), ein **Plugin-Panel-System** (IconRail + Panels), **i18n** (Dictionary, neu in 0.23) und eine **kompositionelle UI** (`Puck.Preview/Components/Fields/Outline/Header/Drawer` als Bausteine).
2. **Der iframe-Canvas ist vollständig vorhanden** (`AutoFrame`, same-origin `srcdoc`-iframe mit React-Portal + Style-Mirroring) und by default an; Viewports (4 Presets) + Zoom (25–200 % + Auto) sind OOB. **Aber: Es ist immer genau EIN Frame.** Multi-Frame nebeneinander ist im Kern nicht vorgesehen — `lib/get-frame.ts` sucht global `#preview-frame`, `Preview` rendert eine feste ID, DnD/Overlays sind auf einen Canvas ausgelegt. Das ist der größte Gap.
3. **„Live-Modus" ist als Zustand vorhanden** (`ui.previewMode: "edit" | "interactive"`, Hotkey Cmd/Ctrl+I, rendert `<Render>` statt Editor-Seite im selben Frame), hat aber keine fertige Umschalt-UI/Fokusmodus im Default-Header; `_experimentalFullScreenCanvas` (experimental) kommt am nächsten.
4. **Selection-/Hover-Rings und Selected-Layer-Toolbar sind OOB** (`DraggableComponent`-Overlay + `ActionBar` mit Select-Parent/Duplicate/Delete, Rich-Text-Menü beim Inline-Editieren) — allerdings mit offenem 0.23-Bug **#1829** (Overlay/ActionBar mountet in manchen Setups nie). **Alt-Inspect-Ladder existiert nicht** (kein `altKey` im Kern; Search-Hit-frei).
5. **Cmd+K-Spotlight und URL-Deep-Links existieren nicht** (Spotlight: 0 GitHub-Issue-Treffer; Deep-Links: keinerlei URL-State im Kern). Beide sind aber via `usePuck`/`dispatch(setUi)` mit überschaubarem Aufwand baubar; `ui` ist als Initial-Prop injizierbar.
6. **Media-Panel: nichts OOB** (kein Media-Manager, kein Upload, kein `file`-Feld). Bausteine: Plugin-Panel + `custom`-Field + `external`-Field (`fetchList` mit Suche/Filter) + `overrides.fieldTypes`. Media-Backend selbst ist Ticket 25.
7. **Slots/Fields ↔ Senify-Section-Registry ist OOB**: `Config.components[].fields` (11 Feldtypen), `slot`-Feld mit `allow`/`disallow`, `resolveData`/`resolvePermissions`, `fieldTransforms` als Erweiterungspunkt — 1:1 als Registry-Format nutzbar (Feld-Transform macht daraus auch Inline-Editing).
8. **Wichtigste Aufwandstreiber:** (a) Multi-Frame-Canvas (Eigenbau L, wegen Single-Frame-Annahmen im Kern: globaler `#preview-frame`-Lookup, ein Store, DnD-/Overlay-Topologie), (b) die Eigenbau-Panels/Spotlight/Deep-Links (je M, aber additive Shell-Arbeit über stabile Public APIs), (c) 0.23-Bugrisiken bei Inline/Overlay (#1829, #1794) — Vorab-Spikes einplanen.
9. **Empfehlung:** Für v1 die OOB-Muster sofort übernehmen (Iframe, Zoom/Viewport-Switcher, Inline-Editing, Outline/Blocks-Panels, Slots/Fields, Selection-Toolbar). Multi-Frame als **v1.1-Spike** einplanen: erst „aktiver Frame editierbar, restliche Frames read-only `<Render>`" (M), dann Vollausbau (L). Der Custom-UI-Showcase im Repo (`apps/demo/app/custom-ui/[...puckPath]/client.tsx`) ist die Blaupause für die eigene Shell.

---

## Gap-Tabelle (10 Muster)

Legende: **OOB** = direkt nutzbar · **Override** = Puck-UI überschreiben/komponieren · **Eigenbau** = neuer Code auf Public APIs. Aufwand grob: S ≤ 1–2 Tage · M ≈ 1–2 Wochen · L ≥ 3+ Wochen (Editor-Seite).

| # | Muster | Puck-Stand | Aufwand | Beleg (Dateipfad im Clone / URL) |
|---|---|---|---|---|
| 1 | Breakpoint-Frames **nebeneinander** (Zoom/Pan) | **Eigenbau** (Zoom+Viewport-Switcher OOB, Multi-Frame nicht) | **L** | `packages/core/components/Canvas/index.tsx` (ein Frame, `zoomConfig`), `lib/get-frame.ts` (`#preview-frame` global), `apps/docs/pages/docs/integrating-puck/viewports.mdx` (Composition-Hinweis) |
| 2 | Live-Modus (ein Frame, volle Größe, scrollbar) | **Override** (Zustand `previewMode` OOB; UI/Fokusmodus Eigenbau) | **M** | `components/Puck/components/Preview/index.tsx:69-105`, `lib/use-preview-mode-hotkeys.ts`, `components/Puck/index.tsx:93` (`_experimentalFullScreenCanvas`) |
| 3 | Inline-Text-Editing (Klick → tippen, live) | **OOB** (text/textarea/custom/richtext; Escape-Revert fehlt) | **S** | `components/InlineTextField/index.tsx`, `lib/field-transforms/default-transforms/{inline-text,rich-text}-transform.tsx`, `types/Fields.ts:27,41,58,166`, Guide `apps/docs/.../rich-text-editing.mdx` |
| 4 | Explorer-Tabs (Layers/Seiten/Vorlagen/Media) | **Override** (Rail+Tabs OOB: Blocks/Outline/Fields; Seiten/Vorlagen/Media = eigene Plugins) | **M** | `components/Puck/components/Layout/index.tsx:199-283` (Plugin-Rail), `plugins/{blocks,outline,fields}/index.tsx`, `types/API/index.ts:46-54` (Plugin-Typ) |
| 5 | Cmd+K-Spotlight | **Eigenbau** (keine Suche/Palette vorhanden) | **M** | Search-Hit-frei im Core; GitHub-Issue-Suche „cmd+k / spotlight / command palette“ → 0 Treffer (15.09.2026) |
| 6 | URL-Deep-Links (`?page=&node=`) | **Eigenbau** (kein URL-State; `ui`-Prop + `setUi` als Haken) | **S** | kein `searchParams`/`location.search` im Core; `types/AppState.tsx:13-45` (`ui.itemSelector/plugin/viewports/previewMode`), `lib/use-puck.ts` |
| 7 | Media-Panel | **Eigenbau** (kein Manager; Brücke via Plugin + custom/external Field) | **M** (Backend separat, Ticket 25) | `types/Fields.ts:135-168` (`external`/`custom`), `components/ExternalInput/*`, `types/API/Overrides.ts:9-20`; Docs `apps/docs/.../fields/external.mdx` |
| 8 | Selection-/Hover-Rings + Alt-Inspect + Toolbar | **Override** (Rings+ActionBar OOB; Alt-Ladder Eigenbau) | **M** | `components/DraggableComponent/index.tsx:716-843` (ActionBar: Select-Parent/Duplicate/Delete), `DraggableComponent/styles.module.css:19-83` (Hover/Selected-Outlines), `lib/dictionary.ts:17-19`; kein `altKey` im Core |
| 9 | iframe-Isolation | **OOB** | **S** | `components/AutoFrame/index.tsx` (srcdoc, Portal, Style-Mirroring), `types/API/index.ts:19-23` + `lib/style-config.ts` (`enabled/waitForStyles/syncHostStyles`), `components/Puck/components/Preview/index.tsx:130-153` |
| 10 | Slots/Fields ↔ Senify-Section-Registry | **OOB** | **S** | `types/Config.tsx` (components/fields/resolveData/resolvePermissions), `types/Fields.ts:170-174` (`SlotField` allow/disallow), `lib/data/is-component-allowed.ts`, Docs `apps/docs/.../fields/slot.mdx` |

---

## Details je Muster

### 1. Breakpoint-Frames nebeneinander (Zoom/Pan) — Eigenbau, L

**Ist-Stand Puck:**
- Viewport-Switcher mit 4 Presets (Small 360 / Medium 768 / Large 1280 / Full-width) in `components/ViewportControls/default-viewports.ts`; umschaltbar über `viewports`-Prop ([Puck-Docs Viewports](https://puckeditor.com/docs/integrating-puck/viewports)).
- Zoom-Leiste mit Chrome-DevTools-Optionen (25/50/75/100/125/150/200 %) plus „Auto“-Zoom (`components/ViewportControls/index.tsx:57-66`); Auto-Zoom resettet bei Resize/Viewport-/Sidebar-Wechsel (`components/Puck/components/Canvas/index.tsx:101-147`).
- Der Canvas skaliert per `transform: scale(zoom)` und klemmt die Höhe auf `frameHeight / zoom` (`Canvas/index.tsx:297-315`). Pan = Scrollen des Canvas-Bereichs (kein Space-Drag/Pan-Tool).

**Lücke (warum L):** Es gibt **immer genau einen** Preview-Frame:
- `components/Puck/components/Preview/index.tsx:132` rendert `AutoFrame` mit fester `id="preview-frame"`.
- `lib/get-frame.ts` sucht **global** `document.querySelector("#preview-frame")` — d. h. bei mehreren Frames ist der Lookup mehrdeutig (Hotkeys, Drop-Resolution, Overlay-Ziele).
- Overlays werden bewusst in den Frame-Body portalt (`DraggableComponent/index.tsx:271-277` → `ref.current.ownerDocument.body`), DnD ist ein einzelner `DragDropContext` über der Layout— ein zweiter gleichzeitig aktiver Canvas widerspricht der Architektur.
- Die Doku kennt nur **einen** Preview in der Composition: „the `viewports` API will have no effect … the viewport size can be controlled by the dimensions of the wrapping element“ ([Composition](https://puckeditor.com/docs/extending-puck/composition), [Viewports-Doc](https://puckeditor.com/docs/integrating-puck/viewports)). GitHub-Suche: kein Issue/PR zu „side-by-side viewports“ (54 Treffer zu „side-by-side“, keiner passt; 15.09.2026).
- Bekannte Nachbar-Issues: #1170/#1832 (Selection geht beim Viewport-Wechsel verloren), #883/#1828 (Custom-Höhen inkonsistent), #1227 (Viewport-Menü in Composition).

**Senify-Empfehlung:** Stufe 1 (M): **aktiver** Puck-Frame + weitere `<Render>`-Frames read-only daneben (Skalierung per CSS-Transform, wie in der Doku für Composition beschrieben). Stufe 2 (L): Vollausbau „alle Frames editierbar“ — dafür eigenen Multi-Canvas-Layer um Puck bauen (eigene Frames + eigene Overlay-Logik, Puck nur als Store/Felder). Vorab-Spike nötig (vgl. Offene Fragen).

### 2. Live-Modus (ein Frame, volle Größe, scrollbar) — Override, M

**Ist-Stand Puck:**
- `ui.previewMode: "edit" | "interactive"` (`types/AppState.tsx:21`). Im Preview wird bei „interactive“ statt der Editor-Seite `<Render data={…}>` gerendert (`Preview/index.tsx:91-106`) — also echte Ausgabe, Overlays aus (CSS über `data-puck-preview-mode`, `Preview/index.tsx:68-82`), Interaktion im iframe möglich.
- Hotkey Cmd/Ctrl+I schaltet den Modus (`lib/use-preview-mode-hotkeys.ts`); im Default-Header gibt es **keinen** Button — der Demo-Showcase baut ihn selbst (`apps/demo/app/custom-ui/[...puckPath]/client.tsx:34-78` „Switch to interactive“).
- `_experimentalFullScreenCanvas` (Puck-Prop, experimental): Vollbild-Canvas mit schwebendem Viewport-Switcher ([Puck-Prop-Referenz](https://puckeditor.com/docs/api-reference/components/puck)); `components/Puck/index.tsx:93,132-134`.

**Lücke:** Kein fertiger „Live-Modus“-Umschalter mit 100 % Zoom + echter Fensterhöhe + freiwilligem Verlassen; Puck hält Zoom/Fit-Logik immer aktiv. Real scrollbar ist der iframe-Inhalt prinzipiell (`height: auto`-Viewport füllt den Frame).

**Senify:** Eigene Header-Aktion (wie Demo) + Shell-Override (Zoom aus, Container volle Höhe) + `previewMode: interactive`. Für eine davon getrennte Content-Live-Canvas (Draft-Preview im echten Template, vgl. `research/26` §1.6) kann Senify unabhängig davon `<Render>`/eigene Preview-Route nutzen — Puck-`Render` ist dafür designed.

### 3. Inline-Text-Editing — OOB, S

**Ist-Stand Puck (stärker als in Research 16 angenommen):**
- Seit **0.20** (14.08.2025): Inline-Editing für `text`/`textarea`/`custom` über `field.contentEditable: true`; seit 0.21 auch `richtext` mit TipTap-Editor direkt im Canvas (`CHANGELOG.md`, Zeilen 265-273).
- Baustein: **`InlineTextField`** (public exportiert, `packages/core/bundle/core.ts:22`): `contentEditable="plaintext-only"` direkt am gerenderten Wert; jeder `input`-Event committet über `resolveAndReplaceData(..., "replace", true)` in den Store (`components/InlineTextField/index.tsx:56-84`). Caret-Erhalt ist in 0.23 gefixt (CHANGELOG 0.23: „don't reset caret position…“, „use the latest component position in inline fields“).
- Rich-Text: `getRichTextTransform` rendert lazy den TipTap-Editor inline (`lib/field-transforms/default-transforms/rich-text-transform.tsx`), Floating-Menü via `RichTextMenu` in der Selected-Layer-Toolbar (`DraggableComponent/index.tsx:799-809`).
- **Eigener Transform möglich:** Docs zeigen, wie man `contentEditable` **auf das echte Element** legt (`<p ref contentEditable>` + `registerOverlayPortal`, `apps/docs/.../field-transforms.mdx` „Making it interactive“) — exakt das Instatic-Muster.
- **Undo:** History recordet Replace-Actions, aber mit **250 ms Debounce** (`store/slices/history.ts:37-67`) → ein Tipp-Burst = ein Undo-Eintrag (ähnlich Instatics „ein Undo-Eintrag“, nur zeit- statt transaktionsbasiert).

**Lücken/Kosten (S):**
- **Escape = Revert** gibt es nicht (Instatic-Muster) — kleiner Eigenbau im Transform.
- `contentEditable` wandelt den String-Prop im Editor-Render in ein ReactNode-Objekt (Doku-Warnung im `text.mdx`); Typen der Senify-Sektionen entsprechend `string | ReactNode`.
- Bekannte offene Issues: **#1794** (Inline-Fields funktionieren nicht im Root-Component; 0.23), #1748 (Richtext mit contentEditable nicht reorderbar), #1707 (Rich-Text-Editor-Komponente für Inline-Editing exportieren), #1795/#1819 (Inline-Platzhalter), #1797 (long-running `resolveData` kann Inline-Richtext in Loading-State hängen). Für Senify relevant: **#1794 vor Section-Bau prüfen** (unsere Sektionen sind normale Components, nicht Puck-Root → sollte nicht greifen, aber testen).

### 4. Explorer-Tabs (Layers/Seiten/Vorlagen/Media) — Override, M

**Ist-Stand Puck:**
- Icon-Rail (Nav) + linke Sidebar sind **plugin-getrieben**: eingebaute Tabs **Blocks** (Komponenten-Liste, kategorisierbar), **Outline** (Layer-Baum, in 0.23 drag-fähig), **Fields** (kann rechts oder als eigenes Panel links andocken) — `components/Puck/components/Layout/index.tsx:199-283`, `plugins/{blocks,outline,fields}/index.tsx`.
- Custom-Plugin = `{ name, label, icon, render, overrides?, fieldTransforms?, mobilePanelHeight? }` (`types/API/index.ts:46-54`), wird automatisch als weiterer Tab in Rail/Sidebar verdrahtet (`Layout/index.tsx:227-260`).
- Demo-Beispiel mit 4 Tabs (Components/Fields/Outline/Headings) in einer Bottom-Bar: `apps/demo/app/custom-ui/[...puckPath]/client.tsx:80-315`.

**Lücke:** **Pages/Templates** existieren in Puck nicht (Site-Konzepte = Senify-Ebene, vgl. Instatic Site-Explorer) und **Media** ebenfalls nicht. Beides sind eigene Plugins/Panels; die Tab-Mechanik selbst ist OOB. Blocks-Panel hat **keine Suche** (`components/ComponentList/index.tsx` — nur Kategorien/Collapse) → Teil von Muster 5.

**Senify:** Rail-Tabs „Sektionen“ (Blocks), „Layers“ (Outline), „Pages/Templates/Media“ als eigene Plugins — Aufwand überwiegend Daten-/Panel-Code, nicht Editor-Kern.

### 5. Cmd+K-Spotlight — Eigenbau, M

**Befund:** Keine Spotlight-/Command-Palette-/Suchfunktion in v0.23. Code: keine Treffer für `spotlight`, `commandPalette`, `cmd+k`; GitHub-Issue-Suche repo-weit: **0 Treffer** zu „cmd+k / spotlight / command palette“ (15.09.2026). Das Blocks-Panel ist eine reine Kategorien-Liste.

**Bausteine für Eigenbau (M):**
- `usePuck()` liefert `appState.ui.itemSelector`, `dispatch`, `config`, `history` (`lib/use-puck.ts`; Demo-Nutzung in `custom-ui/client.tsx`).
- Aktionen: Insert (`dispatch({type:"insert", …})`), Select (`setUi({itemSelector})`), Publish/Actions über Host; `onAction`-Hook für Audit.
- Must-kosten: Command-Registry (Sektionen, Panels, Aktionen), Fuzzy-Suche, Tastatur-Handling kollidiert mit Puck-Hotkeys (Hotkey-Layer in `lib/use-hotkey.ts` beachten).
- Optional: `_experimentalVirtualization` für lange Listen.

### 6. URL-Deep-Links (`?page=`, `?node=`, `?table=&row=`) — Eigenbau, S

**Befund:** Der Puck-Kern synchronisiert **keinen** UI-State in die URL (kein `searchParams`/`location.search` im Core). Es gibt aber den idealen Haken:
- `ui`-Prop (initial) + `setUi`/`dispatch` zur Laufzeit (`types/AppState.tsx:13-45`: `itemSelector`, `plugin.current`, `viewports.current`, `previewMode`, `leftSideBarVisible`, …).
- `itemSelector` ist exakt das Deep-Link-Ziel (Component-ID → Selector via `getSelectorForId`, `lib/get-selector-for-id.ts`).

**Senify:** Dünne Host-Schicht: URL lesen → `ui`-Prop injizieren; Editor-Änderungen → URL schreiben (debounced). Page/Table-Row-Wahl ist ohnehin Senify-Shell (nicht Puck). Aufwand S; Achtung: `ui` ist initial — für spätere URL-Änderungen (Back/Forward) `setUi` dispatchen.

### 7. Media-Panel — Eigenbau, M (Backend separat)

**Befund:** Kein Media-Manager, keine Uploads, kein `file`- oder `image`-Feld im Kern (Feldtypen siehe `types/Fields.ts` — `text/number/textarea/select/radio/richtext/array/object/external/custom/slot`). Bilder werden üblicherweise über `text`-URL, `external` oder `custom` gelöst.

**Bausteine:**
- Panel: eigenes **Plugin** als Rail-Tab (Mechanik s. Muster 4).
- Feld-Brücke: **`custom`-Field** (`render` + `onChange`, `types/Fields.ts:154-168`) für einen Media-Picker im Fields-Panel; oder **`external`-Field** (`fetchList({query, filters})`, `showSearch`, `mapProp`, `renderFooter`, `filterFields`, Cache — `types/Fields.ts:135-152`, Docs `fields/external.mdx`) für eine durchsuch-/filterbare Asset-Liste; oder global via `overrides.fieldTypes` alle Bildfelder ersetzen (`types/API/Overrides.ts:65-81`).
- Drag&Drop aus Media-Panel in den Canvas: `Drawer`/`Drawer.Item` sind public (`components/Drawer`), Drag-Quelle kann also auch ein eigenes Panel sein.
- Media-Backend (Ordner, Smart Folders, Ladder, Replace) ist **Ticket 25** — nicht Teil dieser Gap; hier zählt nur, dass Puck keinen Blocker darstellt.

### 8. Selection-/Hover-Rings + Alt-Inspect + Element-Toolbar — Override, M

**Ist-Stand Puck:**
- **Hover-/Selection-Rings:** Overlay-Wrapper pro Component mit eigenem Styling (`components/DraggableComponent/styles.module.css:19-83`); überschreibbar via **`overrides.componentOverlay`** (`{componentId, componentType, hover, isSelected, children}`, `types/API/Overrides.ts:55-61`) — exakt der Instatic-Anpassungspunkt.
- **Selected-Layer-Toolbar:** `ActionBar` mit **Select-Parent** (nur in verschachtelten Areas, `DraggableComponent/index.tsx:716-729`), Duplicate, Delete; beim Inline-Editieren eines Rich-Text-Feldes erscheint das **Rich-Text-Menü** in derselben Toolbar (`:799-809`). Überschreibbar via `overrides.actionBar`.
- **Alt-Inspect-Ladder:** **nicht vorhanden** — kein `altKey`-Handling im Core; kein Issue dazu gefunden. Teilersatz: „Select Parent“-Button (eine Ebene hoch, mit `getSelectorForId`-Infrastruktur).
- **Risiko:** offenes Issue **#1829** (0.23.0): In bestimmten Setups (DropZone/Root-Legacy-Zones) **mountet das Per-Item-Overlay inkl. ActionBar nie**, obwohl die Selection im Store korrekt ist. Da Senify auf **Slots** (nicht Zones) setzt, ist eine Prüfung im Spike Pflicht; #1794 (Inline im Root) passt ins gleiche Umfeld.

**Aufwand:** Rings+Toolbar = OOB/Override (S); Alt-Ladder (Hover-Hierarchie hoch/runter steppen: `getSelectorForId` + DropZone-Context `depth`/`areaId`, `DraggableComponent/index.tsx:731-750`) = Eigenbau (S–M). Gesamt M inkl. 0.23-Bug-Workaround-Monitoring.

### 9. iframe-Isolation — OOB, S

**Ist-Stand Puck:**
- `AutoFrame` (`components/AutoFrame/index.tsx`): same-origin `srcdoc`-iframe mit `#frame-root`-Mount, React-**Portal** in den Frame, **Style-Mirroring** (style/link-Kopien + MutationObserver), `html`/`body`-Attribut-Sync.
- Konfiguration: `iframe.enabled` (default true), `waitForStyles` (Spinner bis Styles geladen), `syncHostStyles` (default true; `false` = volle Style-Isolation) — `lib/style-config.ts`, `types/API/index.ts:19-23`, Docs [iframe-Override](https://puckeditor.com/docs/api-reference/overrides/iframe).
- Overlays/DnD sind frame-bewusst: Overlay-Portal in `ref.current.ownerDocument.body` (`DraggableComponent/index.tsx:271-277`), Pointer-Events werden aus dem Frame gebubbelt (`Preview/index.tsx:15-66`), Hotkeys werden in den Frame-Doc delegiert (`Layout/index.tsx:162-170`, `lib/use-hotkey.ts`).
- Bekannte Kanten: CSS-Link-Inlining kann Styles auslassen (#543), `waitForStyles`-Hänger-Fixes historisch (CHANGELOG 0.22.x). Für Senify (Tailwind-Styles via `syncHostStyles` oder eigener `iframe`-Override-Injection) unkritisch, aber Test mit Utility-CSS einplanen.

### 10. Slots/Fields ↔ Senify-Section-Registry — OOB, S

**Ist-Stand Puck:**
- `Config.components[Name] = { fields, defaultProps, render, resolveData, resolvePermissions, permissions, label, categories, metadata, ai? }` (`types/Config.tsx:53-94`) — genau die Registry-Form aus Research 16 §2.3.
- **Fields (11):** `text, number, textarea, select, radio, richtext, array, object, external, custom, slot` (`types/Fields.ts`). `slot` = verschachtelte Components-Arrays mit **`allow`/`disallow`** (Guardrail für Agenten!) und enforced via `lib/data/is-component-allowed.ts` (DropZone prüft bei Drop/Insert, `components/DropZone/index.tsx:312-313,393-394`). `zones` ist deprecated → Slots sind der Pfad.
- **Dynamik:** `resolveData` (async Props zur Render-Zeit, z. B. Bindings), `resolvePermissions` (per-Instanz-Rechte), `fieldTransforms` (eigene Editier-UI/Inline-Editing), `transformProps`/`migrate` serverseitig (`lib/transform-props.ts`, `lib/migrate.ts`).
- **Permissions:** global `{drag, duplicate, delete, edit, insert, +Record}` (`types/API/index.ts:11-17`), per Component/`resolvePermissions`, dynamisch refreshbar (`store/slices/permissions.ts`; Demo-Locks in `custom-ui/client.tsx:360-493`). Offenes Issue #1285 („Support setting permissions programmatically“) betrifft nur die API-Bequeemlichkeit.
- **i18n:** alle UI-Strings zentral in `lib/dictionary.ts` (~80 Keys, type-safe), überschreibbar per `dictionary`-Prop; `useMessage()` als einziges Lesemuster (`lib/use-message.ts`), Labels/Viewport-Namen kommen aus Config. Docs: `apps/docs/.../localization.mdx`.

**Senify-Mapping:** Section-Registry = `Config.components`; Feldschema = `fields` (plus `metadata`/`label`/`categories` für MCP-Spiegelung); verschachtelte Bereiche = `slot` mit `allow`; Agent-Guardrails zusätzlich über `resolvePermissions`. Keine Anpassung nötig — nur Konventionen (Envelope, ID-Schema) definieren.

---

## Was Puck zusätzlich bietet (nicht im Instatic-Katalog, aber relevant)

- **Header/Shell frei komponierbar:** `Puck.Header`-Override, `renderHeader`, `headerTitle/headerPath`; `Puck.{Components,Fields,Outline,Preview}` + `Drawer`, `FieldLabel`, `AutoField`, `Button`, `IconButton`, `ActionBar` als Bausteine (`components/Puck/index.tsx:371-375`, `apps/docs/.../composition.mdx`).
- **Undo/Redo** mit Debounce (250 ms) und `initialHistory`-Injection; Hotkeys Cmd/Ctrl+Z, Shift+Cmd+Z, Cmd+Y (`store/slices/history.ts:184-190`).
- **`onChange`/`onPublish`/`onAction`** als Host-Integration (Save-Maschine liegt bei Senify; `data`-Prop bleibt initial-only — Remount/`dispatch(setData)` nötig).
- **`_experimentalVirtualization`** (lange Seiten) und `_experimentalFullScreenCanvas` — beide als experimental markiert.
- **Overrides-API-Status: „highly experimental … likely to experience breaking changes“** (`apps/docs/pages/docs/extending-puck/ui-overrides.mdx:5-8`) — Upgrade-Risiko einplanen (vgl. Research 16 §10).
- **Agent-Skills** von Puck (`npx skills add`, MIT) — nützlich für Coding-Agenten bei der Integration.

---

## Offene Fragen

1. **Multi-Frame-Strategie:** Stufe 1 (aktiver Puck-Frame + read-only `<Render>`-Frames) oder direkt Vollausbau? Stufe 1 umgeht `getFrame()`-Mehrdeutigkeit, kostet aber „alle Frames editierbar“ (Instatic-Parität). Entscheidung + Spike in Ticket 24/Folge-Ticket.
2. **iframe-Styles für Senify:** `syncHostStyles: true` (Host-CSS spiegeln) vs. eigener `iframe`-Override mit kontrollierter Injection (Semify-Tailwind + Kit-Styles)? Beeinflusst Druck/Auto-Zoom und #543-Risiko.
3. **`contentEditable`-Typen:** Senify-Sektionen, die Inline-Editing nutzen, müssen Props als `string | ReactNode` typisieren — Konsequenz für Codegen/MCP-Schemas (agentische Props bleiben Strings im JSON; nur Editor-Render wandelt um).
4. **Escape-Revert + Undo-Snapshot:** Eigenen Inline-Transform bauen (Escape → letzter Snapshot, ein History-Eintrag) oder Puck-Debounce akzeptieren?
5. **ActionBar-Bug #1829:** Betrifft uns Slots statt Zones? Muss im Spike mit einer Minimal-Sektion getestet werden (plus #1794 Root-Inline).
6. **Spotlight/Befehle:** Welche Kommandos braucht v1 (Insert by Name, Seitenwechsel, Media öffnen, Publish)? Ohne Scope wird das Muster schnell L.
7. **Deep-Link-Schema:** `?page=&node=` — Node-IDs sind Puck-Instanz-IDs (`props.id`); stabile Slugs/Anker aus Senify-Sicht definieren (Agenten/Menschen).
8. **Media-Brücke:** `custom`-Field vs. `external`-Field für den Picker — abhängig von Ticket-25-Media-API (Suche/Ordner).

---

## Quellen

**Primärquelle (lokal):** Puck-Clone `C:\Users\adini\projects\Senify\Repos\puck` — Shallow-Clone, `@puckeditor/core@0.23.0`, Commit `cb7360dd` (15.09.2026). Hinweis: Der Clone enthält **keine** GitHub-Issues/PRs; Issues wurden über die GitHub-API/Websuche geprüft (Stand 15.09.2026).

**Code (Pfade relativ zum Clone):**
- Canvas/Iframe: `packages/core/components/AutoFrame/index.tsx` · `components/Puck/components/Preview/index.tsx` · `components/Puck/components/Canvas/index.tsx` · `lib/get-frame.ts` · `lib/style-config.ts` · `types/API/index.ts`
- Viewports/Zoom: `components/ViewportControls/index.tsx` · `components/ViewportControls/default-viewports.ts`
- Inline/Rich-Text: `components/InlineTextField/index.tsx` · `lib/field-transforms/default-transforms/inline-text-transform.tsx` · `…/rich-text-transform.tsx` · `components/RichTextEditor/*` · `types/Fields.ts`
- Layout/Panels/Plugins: `components/Puck/components/Layout/index.tsx` · `plugins/blocks/index.tsx` · `plugins/outline/index.tsx` · `plugins/fields/index.tsx` · `components/ComponentList/index.tsx`
- Overlays/Toolbar: `components/DraggableComponent/index.tsx` · `components/DraggableComponent/styles.module.css` · `components/ActionBar/index.tsx`
- Store/History/Permissions: `store/slices/history.ts` · `store/slices/permissions.ts` · `lib/use-hotkey.ts` · `lib/use-preview-mode-hotkeys.ts` · `lib/use-delete-hotkeys.ts`
- Registry/Fields: `types/Config.tsx` · `types/Fields.ts` · `lib/data/is-component-allowed.ts` · `lib/use-puck.ts`
- i18n: `lib/dictionary.ts` · `lib/use-message.ts`
- Doku im Repo (`apps/docs/pages/docs/`): `integrating-puck/viewports.mdx` · `integrating-puck/composition.mdx` · `integrating-puck/rich-text-editing.mdx` · `extending-puck/ui-overrides.mdx` · `extending-puck/field-transforms.mdx` · `api-reference/components/inline-text-field.mdx` · `api-reference/fields/{text,slot,external}.mdx` · `api-reference/overrides/iframe.mdx`
- Demo-Blueprint: `apps/demo/app/custom-ui/[...puckPath]/client.tsx`
- Changelog: `CHANGELOG.md` (0.20 Inline-Text, 0.21 Rich-Text/Plugins, 0.22 Styles, 0.23 Dictionary/Draggable Outline)

**Extern (abgerufen 15.09.2026):**
- Docs: https://puckeditor.com/docs · https://puckeditor.com/docs/integrating-puck/viewports · https://puckeditor.com/docs/extending-puck/composition · https://puckeditor.com/docs/extending-puck/ui-overrides · https://puckeditor.com/docs/api-reference/components/puck · https://puckeditor.com/docs/api-reference/overrides/iframe
- GitHub-Issues (API-verifiziert): [#1829](https://github.com/puckeditor/puck/issues/1829) (0.23 Overlay/ActionBar mountet nicht) · [#1794](https://github.com/puckeditor/puck/issues/1794) (Inline-Fields im Root) · [#1748](https://github.com/puckeditor/puck/issues/1748) · [#1707](https://github.com/puckeditor/puck/issues/1707) · [#1170](https://github.com/puckeditor/puck/issues/1170)/[#1832](https://github.com/puckeditor/puck/issues/1832) · [#883](https://github.com/puckeditor/puck/issues/883)/[#1828](https://github.com/puckeditor/puck/issues/1828) · [#543](https://github.com/puckeditor/puck/issues/543) · [#1227](https://github.com/puckeditor/puck/issues/1227) · [#1285](https://github.com/puckeditor/puck/issues/1285)
- Diskussionen: [#397 v0.14](https://github.com/puckeditor/puck/discussions/397) (Iframe+Viewports) · [#1245 v0.20](https://github.com/puckeditor/puck/discussions/1245) (Inline-Editing) · [#1499 v0.21](https://github.com/puckeditor/puck/discussions/1499) (Rich-Text/Plugins)
- Projektkontext: `.scratch/senify-v1/research/{16,23,26}-*.md`
