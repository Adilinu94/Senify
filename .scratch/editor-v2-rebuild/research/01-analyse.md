# Senify Editor v2 — Tiefenanalyse (korrigierte Fassung, 17.09.2026)

**Basis:** Volltext-Lektüre von `packages/editor/src/state/*` (store, patches, operations,
document, migration, consistency), `canvas/*` (canvas, rules, insert), `history.ts`,
`packages/widget-engine/src/*` (catalog, markup, css/cascade, css/compile, css/properties),
`packages/engine/src/db.ts` (komplettes Schema), `engine/src/mutations/{editor-contract,editor-bridge}.ts`,
`engine/src/http.ts` (Save-Pfad), `packages/mcp/src/tools.ts` (47 Tools), dazu alle Plan-Dokumente
(`map.md`, `ledger.md`, `ui-plan.md`, `ui-design.md`, `ui-aufgaben.md` vollständig, `ui-elementor.md`
vollständig, `issues/01–06`), `HANDOFF.md`, `CONTEXT.md`.
**Diese Fassung ersetzt die erste Analyse vom selben Tag** — vier Aussagen darin waren falsch oder
unzureichend belegt; die Korrekturen stehen in §1. Die konkreten Bauplan-Änderungen stehen in
`02-bauplan-aenderungen.md`.

---

## 1. Korrekturen zur ersten Analyse (Ehrlichkeit zuerst)

1. **„Keine Media-Welt" war falsch.** Die Engine hat eine vollständige Media-Welt:
   `assets` (inkl. `alt_text`, `decorative`, `tags`, Hash-Dedupe via `assets_site_hash_idx`),
   `asset_variants` (Breiten-/Format-Leiter AVIF/WebP), `asset_blurhash`, `asset_folders`,
   `asset_history`, dazu sechs MCP-Tools (`list/upload/update/replace/delete/restore_asset`).
   **Was fehlt, ist nur die Anbindung an den v2-Editor** (Media-Picker = Aufgabe ..; der Katalog
   kennt den Control-Typ `media` mit valueType `asset`). Wichtiger noch: **Alt-Text lebt auf dem
   Asset** — genau die Single-Source-of-Truth-Regel, die ich Instatic als Verbesserung empfahl,
   hat Senify im Schema schon richtig.
2. **„Per-Concept-Tabellen vs. alles-ist-eine-Zeile" war die falsche Frage.** Das Schema ist reich
   und bewusst gebaut: `pages` (draft jsonb + `draft_version`), `collections`/`entries`/
   `entry_versions` — mit dem Kommentar *„collections embed their field definitions
   (Payload/Instatic pattern)"* —, `page_revisions`, `releases`, `active_releases`, `previews`,
   `review_items` (mit `structure_diff`, `guardrails`, `thread`), `audit_entries`, Formular-/
   Newsletter-Infrastruktur, Referenz-Analyse (T14). Senify folgt dem Payload/Instatic-Muster für
   Content und hat Pages als eigene Tabelle. Das ist eine gewachsene, defensible Antwort — kein
   offenes Chaos. Die echte offene Frage ist eine andere (Dialekt, siehe unten).
3. **`sites.style_rules_json` existierte nicht** (korrigiert am 18.09.). Diese Fassung behauptete,
   die Spalte sei „bereits als additive Spalte im Schema" vorhanden. Der Gegenbeweis:
   `git grep style_rules_json HEAD` findet den Namen nur in Plan-Dokumenten, nie in `packages/`.
   Die additive Spalte (`ALTER TABLE sites ADD COLUMN IF NOT EXISTS style_rules_json jsonb`) wurde
   am 18.09. **uncommittet im Arbeitsbaum** angelegt (Ticket 13). Ticket 02 Punkt 1 ist damit
   serverseitig gebaut; die Arbeit liegt im Editor-Dokument-Modell und der Bridge.
4. **MCP ist breiter als dargestellt:** 47 Tools — vollständiges Asset-CRUD, Entries mit
   Versionen/Publish/Restore, References (Analyse/Apply/Brief), `submit_for_review`/
   `get_review_feedback`, `publish_release`, `rollback_release`, `restore_revision`. Der
   Review-Flow (`review_items` mit Guardrails und Thread) ist genau die „Approval-Queue für
   Nicht-Devs" aus RESEARCH.md §4.3 — als **optionale** Spur neben E4 (direktes Veröffentlichen).

---

## 2. Was der Rebuild heute wirklich ist (Stand nach Code-Lektüre)

### 2.1 Der Store ist ein transaktionales Schreibtor — stärker als angenommen

`EditorStore.apply` (`state/store.ts`, 297 Zeilen) läuft in fester Reihenfolge:
`parseEditorMutation` (TypeBox, gleiche Maschinerie wie der Section-Vertrag) → Operation
(rein, liefert forward/inverse Patches) → `applyDocumentPatches` → `validateDocument` →
**bei Verstoß: nichts wird geschrieben** → History-Eintrag (inverse Patch als Undo,
`coalesceKey` für Tipp-Bursts und Züge).

`validateDocument` (`consistency.ts`) prüft **14 Invarianten-Arten** auf das ganze Dokument:
falsche Version, fehlender/falscher Root, unbekanntes Primitiv, hängende Kinder/Slots,
**Knoten mit zwei Eltern**, Waisen, nicht erlaubte Kinder (Katalog-Regeln), unbekannte/volle
Slots, undefinierte Klassen, **Zyklen**. Das ist eine harte Write-Gate-Ebene, die Instatic in
dieser Form nicht hat (dort validiert `validateSite` beim Laden und die Mutations-Gates pro Op;
ein Ganzdokument-Check nach jedem Schreiben existiert dort nicht). Für Agenten, die große
Mutationen in einem Batch schicken, ist das ein echter Sicherheitsgewinn.

### 2.2 Save-Pfad: der Canvas erbt die komplette Engine-Infrastruktur gratis

Der entscheidende Strangler-Satz steht in `editor-bridge.ts`: *„The canvas therefore has no save
path of its own."* Der Ablauf: Store → `onAction` (Shell spiegelt) → `POST apply_editor_mutations`
→ `editorMutationsToSection` → `applyMutationsToPage` — und damit erbt jeder Canvas-Schreibvorgang
**Konflikt-Check (optimistic locking via `baseDraftVersion`), Version-Bump, Audit-Log
(`audit_entries` speichert pro Batch auch `undo_patch` — die Undo-History liegt also zusätzlich
serverseitig!), Hard-Guardrails**. Der Bridge-Kommentar nennt es explizit. Das ist die eigentliche
Stärke des v2-Ansatzes: neue Editor-Welt, ein Persistenzweg, keine zweite Wahrheit.

**Die scharfe Kante desselben Designs:** der Bridge unterstützt heute nur `setNodeProp`,
`clearNodeProp`, `insertNode`, `deleteNode`, `moveNode`, `duplicateNode`. **Klassen- und
StyleRule-Ops schlagen laut fehlend** („kann im Abschnitts-Baum noch nicht gespeichert werden").
Der Editor kann Klassen lokal im Dokument halten (`document.classes`, Compiler rendert sie im
Canvas), aber sie werden **nicht persistiert**. Genau das ist die Phase-2-Arbeit — und der Grund,
warum die Modell-Alignierung (Bauplan-Änderung B1) vor dem Inspektor-Bau kommen muss.

### 2.3 Compiler und Kaskade — die Details nach Lektüre

- **Eine Schicht** `@layer user-authored`, Emissionsordnung `base → device → state → class →
  inline`; `kind` ist Datum. State-Emission in fester Ordnung hover → focus → active.
- **Breakpoints aus einer Quelle:** `DEVICE_BREAKPOINTS` (tablet 1024, mobile 640) wiederverwenden
  die Bestands-Konstanten; Media-Query-Offset 0,02 verhindert Grenzfall-Treffer. Geräte-Erbe als
  flache Suffixe (`_tablet`/`_mobile`) mit `resolveAllForDevice`-Erbe — pragmatisch, ausdrucks-
  gleich zu Instatics verschachtelten Overrides.
- **Klassen-Ankerung pro Knoten:** `classSelector` emittiert `[data-node-id="…"].cls` — jede
  Klassenregel wird **je tragendem Knoten** geschrieben, nicht einmal global. Das hält die
  Spezifität-Geschichte trivial (gleiche Spezifität wie State-Regeln, Gewinn per Quellordnung),
  **kostet aber CSS-Bytes bei klassengetriebenen Seiten** (Regel × Knoten). Instatic emittiert
  globale `.cls`-Regeln und löst State-Ordering über doppelte Selektoren. Beide Wege sind
  legitim — aber die Byte-Wirkung ist messbar (`measureCss` existiert!) und sollte **vor** dem
  Inspektor-Bau entschieden werden, nicht danach. → Bauplan-Änderung B8.
- **Forced-State-Preview als ungeschichtetes Chrome:** `forcedStateCss` wird außerhalb der Schicht
  emittiert, gewinnt also immer — der Preview-Mechanismus ist sauber vom Release-Stylesheet
  getrennt (`compileCss` kennt die Vorschau nicht).
- **Struktur statt String:** `CompiledRule[]` gibt die Regelstruktur als Daten zurück — der
  Renderer kann Regeln lesen, ohne CSS zu parsen. Für Phase 2 (Inspektor zeigt „wo kommt dieser
  Wert her?") ist das Gold.

### 2.4 Canvas: Parität durch Enthaltsamkeit

`canvas.ts` + `rules.ts`: ein iframe je Gerät, `FRAME_BASE_CSS` ist absichtlich minimal
(Margin-Reset, weißes Blatt, **keine Typografie**) — der Kommentar nennt den Grund: eine
frame-eigene Schrift würde vom Release abdriften, und genau das misst das Paritäts-Tor.
Fonts kommen lokal gebündelt (`editorFontFaceCss`), keine Netzabrufe.

**Ein echter Inkonsistenz-Befund:** Die In-Frame-Marker (`CANVAS_CHROME_CSS`) tragen **hardgecodete
Alt-Palette** — Auswahl `#d004d4` (das alte Magenta), Hover `#0ea5e9` (Sky) — während die
Editor-Haut drumherum Tiefwasser malt. Der Grund ist strukturell: die Regel „0 `--ed-*` im
iframe" (Inhaltsneutralität) lässt die Marker im Frame ohne Tokens. Der Plan (ui-plan §8) löst
das bereits richtig: **Overlay in einem Portal ÜBER dem Canvas** statt im Frame — dort lebt
Chrome- CSS außerhalb des Inhaltsdokuments und darf Tokens nutzen. Der Plan ist also die
Korrektur eines realen, heute sichtbaren Defekts (magenta Auswahl im Tiefwasser-Editor);
er sollte als solcher priorisiert werden. → Bauplan-Änderung B9.

### 2.5 Insert-Planung: Ablehnungen mit Grund, kein Rate-Los

`insert.ts` plant „hinter/hinein in die Auswahl" rein datengetrieben und lehnt unzulässiges
Einfügen **mit konkretem Grund** ab (welcher Slot fehlt, welche Typen erlaubt sind, welcher Slot
voll ist). Zyklus- und Kind-Regeln liegen im Katalog, nicht in der UI. DnD fehlt bewusst
(Ticket 01 Punkt 7) — meine Empfehlung, es in Phase 2 vorzuziehen, steht.

### 2.6 Migration: additiv, mit Rollback — und einem dokumentierten Datenverlust

`migration.ts` (O2): v1-Erkennung, Lift nach v2 (Overrides → Device-Suffixe), `reindexDocument`
(entspricht Instatics `reindexNodeParents`), Rollback auf letztes valides Dokument, v2→v1
**bewusst nicht** angeboten. **Aber:** die Migration verwirft das **pro-Breakpoint `hidden`**-
Flag (Kommentar: „which the v2 node model does not carry yet"). Seiten, die einen Knoten nur auf
Mobil verstecken, verlieren das stumm. Das ist ein echter Fix-noch-vor-Cutover-Punkt.
→ Bauplan-Änderung B5.

### 2.7 Skin, Prüfkultur, Beweise

Nach Lektüre der Rundenberichte bestätigt sich der Eindruck: 116/116 Tokens am Wurzelknoten
(Editor **und** Canvas-Ansicht), 36/36 Symbole, 41/41 Kontraste, 96-Zellen-Zustandsprobe,
Panel-Ziehen mit Grenzen/Reset/Reload-Persistenz als Browser-Test verankert, flüchtige Instanz
als Prüfmittel, ehrliche „offen"-Listen. Dazu ein Lauterkeitsbefund: die `ui-elementor.md` ist
kein Inspirationssammelsurium, sondern eine **Beleg-Auswertung mit je Eintrag
Übernehmen/Abwandeln/Verwerfen + Begründung** (z. B. „Favoriten: kein Fund im Repo → keine
Pflichtaufgabe; eine erfundene Funktion ist teurer als eine fehlende"). Diese Belegdisziplin ist
selten und sollte nicht aufgegeben werden.

### 2.8 Plan-Dokumente: Qualität und zwei echte Widersprüche

`ui-plan.md` legt je Baustein neun Dinge fest (Zweck, Aufbau, Maße/Tokens, Zustände, Verhalten,
Tastatur, Bewegung mit Kurve, Kontrast, Prüfkriterium) — verbindlich, mit Herkunft je Zahl.
`ui-aufgaben.md` hat 47 Aufgaben mit Prüfkriterien und Runden-Gates. **Zwei Widersprüche
zwischen Plan und Datenmodell:**

1. **Gerätestationen:** Plan 5.13 nennt acht Stationen (aus Elementors `iconsMap`), das
   Datenmodell kennt genau `desktop/tablet/mobile` (`DeviceSchema`, `DEVICE_BREAKPOINTS`).
   Der Plan kürzt „bei knapper Breite" zwar auf drei — aber drei ist hier nicht die Fallback-
   Stufe, sondern die **gesamte** Ausdruckskraft des Modells. → B2.
2. **Zustände:** Ticket 02 verspricht `:hover/:focus/:active/:disabled`, `cascade.ts` kennt
   `StateName` mit genau drei Werten und `STATE_ORDER` ohne disabled. Wird die Inspektor-UI vor
   der Compiler-Erweiterung gebaut, verdrahtet sie drei Zustände hart. → B..

Dazu eine Lücke: Ticket 02 verspricht die Layout-Gruppe (display, flex-Eigenschaften, position,
overflow, z-index) als Style-Fähigkeit — `STYLE_PROPERTIES` kennt nur spacing/size/typography/
color/border/effects, **keine** Position/Overflow/z-index; `display` ist heute ein `frame`-Control.
Das Vokabular für die versprochene Gruppe existiert nicht. → B4.

---

## 3. Instatic-Vergleich (geprüft, wo sich Korrekturen ergeben)

Die philosophischen Gegenüberstellungen der ersten Analyse halten (Patch-Undo vs. CRDT,
freie Kaskade vs. StyleRule-Registry, plan-first MCP vs. same-session, 23-Primitives-Regime vs.
freie NodeTree). **Drei Bewertungen ändern sich:**

1. **Media-Welt:** Senify hat sie im Backend + MCP; die Lücke ist editor-seitig (Picker, Alt-Warnung,
   Verbindung Asset ↔ `media`-Control). Damit ist der Abstand zu Instatic deutlich kleiner als
   in Analyse 1 behauptet — und der Instatic-Befund „HTML-Import verwirft Alt-Texte" kann Senify
   konstruktiv vermeiden, weil `assets.alt_text` schon die SoT ist.
2. **Publishing-Tiefe:** Senify hat `releases`, `active_releases`, `previews`, `page_revisions`
   und Rollback **im Schema und in den MCP-Tools** (`publish_release`, `rollback_release`).
   Was fehlt, ist der Cutover des Durchstichs von `bakeSite` auf `POST /api/releases` — ein
   geplanter, enger Schritt, kein konzeptionelles Loch.
3. **Architektur-Gates:** Senifys Ganzdokument-Validierung nach jedem Schreiben (14 Invarianten)
   + ererbte Engine-Gates (Konflikt, Audit, Guardrails, serverseitiges `undo_patch`) sind eine
   Härte, die Instatic so nicht hat. Instatics 81 Architektur-Tests sind breiter im UI- und
   Dokumentations-Bereich; Senifys Gates sind tiefer im Schreibpfad.

Unverändert voraus ist Instatic bei: **Chrome** (komplette Arbeitsfläche), **Co-Editing**
(Yjs vs. bewusst ausgeklammert), **Dynamik-Layer** (Islands/LRU — Senify hat Formulare+Loops,
keine Islands), **dual dialect** (Instatic fährt PG **und** SQLite mit Paritäts-Gates; Senify ist
faktisch Postgres-only: `jsonb`, `timestamptz`, `ALTER … ADD COLUMN IF NOT EXISTS` — SQLite
kann davon zwei von drei nicht, und es gibt explizit „kein Migration-Tooling in v1").
Der Dialekt-Punkt ist kein Mangel, aber eine **ungetroffene Entscheidung** → B6.

---

## 4. Fazit der vertieften Analyse

Der Rebuild ist stärker als meine erste Fassung es beschrieb: das Schreibtor ist transaktional,
der Save-Pfad erbt die gesamte Engine-Infrastruktur, Media und Releases existieren im Fundament,
die Prüfkultur misst statt behauptet. Die Risiken liegen nicht im Gebauten, sondern in **vier
Modell-Widersprüchen zwischen Plan und Code** (Geräte, Zustände, Klassen-Modell, Layout-Vokabular)
und in **einem dokumentierten Migrationsverlust** (per-Breakpoint hidden). Alle fünf sind vor bzw.
am Anfang von Phase 2 billig zu beheben — danach werden sie teuer. Die konkrete, priorisierte
Änderungsliste steht in `02-bauplan-aenderungen.md`.
