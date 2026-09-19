# Strategische Überholspuren: Wann wird Senify besser als Instatic?

**Stand:** 17.09.2026 · **Frage:** „Was könnte Senify besser werden als Instatic, wenn wir alles
nach dem Plan (`02-bauplan-aenderungen.md`) umbauen?"
**Bezug:** `01-analyse.md` (Tiefenanalyse nach Code-Lektüre) · `02-bauplan-aenderungen.md` (B1–B12)
· Instatic-Gegenbasis: `Repos/instatic/research/instatic/` (insb. `02`, `05`, `06`, `15`, `20`).

> **Die ehrliche Antwort vorab:** Ja — aber nicht als „besseres Instatic". Nach dem Umbau wäre
> Senify in fünf Disziplinen vorn, die Instatic **prinzipiell nicht nachrüsten kann, ohne sein
> eigenes Fundament umzubauen**. Und Instatic bliebe in fünf anderen Achsen vorn. Das sind zwei
> Profile für zwei Märkte — der eigentliche Gewinn des Plans ist, dass Senify einen Markt besetzt,
> der heute niemandem gehört.

---

## 1. Die fünf Überholspuren (mit Belegen)

### Spur 1 — Gemessene statt versprochene Wahrheit: Canvas = Release

**Heute bei Instatic:** Die Parität Canvas↔Release ist *konzeptuell* garantiert — ein Walker
(`dynamicDetection.ts`) speist die Bake-Entscheidung **und** die Island-Emission, kann also nicht
auseinanderdriften. Gut gebaut, aber es gibt **kein Tor, das es misst**. Im Test-Kontext weiß ich
aus eigener Arbeit (Nachbau nick-webdesign.de): Der Canvas-Render und der publizierte Output sind
leicht unterschiedlich sichtbar (Canvas-Artefakte bei Lazy-Bildern), und niemand bemerkt es, weil
keine Messung existiert.

**Senify nach Plan:** Der Durchstich beweist die Parität bereits — Pixel-Diff 0,000056 bei Toleranz
0,01, mit **scharfer Gegenprobe** (0,485 ohne Grund-CSS; `widget-slice-browser.test.ts`). Nach
**B11** (Releases-Cutover) und der Kopplung des Tors an `pnpm verify` als CI-Blocker (O9) wird aus
dem Beweis ein **permanentes Release-Gate**: Kein Publish ohne messbar identischen Canvas.

**Warum das strategisch zählt:** Für Agenten ist das der Unterschied zwischen „ich hoffe, der
Entwurf stimmt" und „die Vorschau **ist** die ausgelieferte Seite, beweisbar bei jedem Build".
Ein Agent, der auf Parität vertrauen darf, braucht keine Publish-and-check-Schleifen — das senkt
die Iterationskosten massiv. Instatic könnte dieses Tor nachrüsten, müsste dafür aber seinen
drei-Layer-Publisher (Bake + LRU + Islands) in einer Messpipeline abbilden — machbar, aber niemand
hat es gebaut. Der Vorsitz ist eine **Kultur-**Position („gemessen statt gefordert"), keine
Feature-Position.

### Spur 2 — Die Quality-Fence für Agenten-Output

**Heute bei Instatic:** Freie NodeTree, freie Klassen, freie CSS-Regeln — der Agent kann alles.
Das ist Instatics Identität als Freihand-Editor (und für menschliche Gestalter die richtige
Entscheidung). Der Preis: Agenten-Output schwankt in Qualität, es sei denn, der Agent trägt seine
eigene Disziplin mit (Prompts, Skills, Glanzleistungen wie `site_insert_html`).

**Senify nach Plan:** Registry-als-Gesetz (28 Sections + 23 Primitives, TypeBox-Props) + **B12**
(Agent-Style-Gate als harte Tests: nur Token-Werte, Roh-Hex wird abgelehnt, wenn `{ $token: … }`
verfügbar wäre; Scoped-Custom-CSS mit Grenzen) + **B1** (Style-Rules mit `origin: user|agent|preset`
— die Herkunft jedes Werts ist Datum). Der Compiler + ein Markup-Beschreiber konstruktiv-driften-
unfähig.

**Warum das strategisch zählt:** Das ist der Kern der Senify-These aus `RESEARCH.md` §3.2 („AI-
Websites sehen generisch aus, weil Modelle ohne Identität + ohne strikte Systeme generieren").
Instatic kann diese Disziplin **nur haben, wenn es aufhört, Instatic zu sein** — seine Liberalität
ist das Produkt. Umgekehrt kann Senify Instatics Freiheit nicht haben, ohne die Registry
aufzugeben. **Diese Spur ist die einzige, die nicht einmal theoretisch kopierbar ist.** Das macht
sie zum strategischen Zentrum.

### Spur 3 — Transaktionales Schreiben + serverseitige History

**Heute bei Instatic:** Yjs-CRDT mit kontinuierlicher Persistenz; `validateSite` beim Laden,
Mutations-Gates pro Op. Ein 100-Op-Agenten-Batch wird Op für Op durchgelassen; das
Ganzdokument-Wissen liegt im CRDT, nicht in einer Prüfung.

**Senify heute (nicht erst nach Plan):** `EditorStore.apply` = Parse → Operation → Patch →
**`validateDocument` über das ganze Dokument (14 Invarianten: Zyklen, zwei-Eltern-Knoten, Waisen,
volle Slots, unbekannte Klassen …)** → bei Verstoß wird **nichts** geschrieben. Dazu erbt jeder
Save über die Bridge Konflikt-Check (optimistic locking via `baseDraftVersion`), Version-Bump,
Hard-Guardrails — und `audit_entries` speichert pro Batch auch `undo_patch`: **die Undo-History
liegt zusätzlich serverseitig**. Ein Agent-Batch, der die Hälfte eines Baums umbaut, ist auf dem
Server vollständig rekonstruierbar.

**Warum das strategisch zählt:** „Viele Mutationen, eine Transaktion, alles oder nichts" ist das
genaue Nutzungsprofil von Agenten. Instatics CRDT-Modell ist für *gleichzeitiges* menschliches
Tippen gebaut; für Batch-Writes ist die transaktionale Ebene die passendere. Senify hat sie schon;
Instatic müsste sie neben dem CRDT bauen (zweites Persistenzmodell = genau die Zweigleisigkeit,
die Instatics Architektur bewusst vermeidet).

### Spur 4 — Der Review-Flow als erste Klasse

**Heute bei Instatic:** Publish ist ein expliziter, capability-gated MCP-Call (`site_publish`);
Drafts sind strikt von Published getrennt. Aber es gibt **keine Diff-Approval-Queue**: Der Mensch
sieht den Zustand, nicht die *Änderung* des Agenten als prüfbares Objekt.

**Senify heute (im Fundament, nicht im Chrome):** `review_items` mit `structure_diff`,
`guardrails`, `thread` + `previews` + MCP-Tools `submit_for_review` / `get_review_feedback` +
`page_revisions` (unveränderliche Snapshots) + Patches als reviewbare Diffs (Spur 3). Das
Datenmodell der „Approval-Queue für Nicht-Devs" aus `RESEARCH.md` §4.3 **existiert bereits** —
es fehlt nur die UI-Hülle (Phase 3-Chrome + Dashboard).

**Warum das strategisch zählt:** Der Review-Flow ist die Antwort auf E4 („Agenten dürfen direkt
veröffentlichen") und die eigentliche Marktfrage des agent-native-Claims: Wer baut, wenn Agenten
bauen? Nicht Entwickler — Kunden, Agenturen, Non-Techs. Die brauchen nicht einen Editor, sondern
**„Übernehmen / Verwerfen" mit Screenshot-Diff und Ein-Klick-Rollback** (RESEARCH §4.3, wörtlich).
Senifys Datenmodell ist genau darauf gelegt; Instatic müsste Diff-Erzeugung + Approval-Queue +
Revision-Semantik neu bauen — nebeneben zum laufenden Produkt, mit Live-Installationen.

### Spur 5 — Headless-Skalierung des Agentenzugangs

**Heute bei Instatic:** Alle 52 Tools mit `execution: 'browser'` werden an den **offenen
Site-Workspace** des Nutzers gebunden (Live-Bridge über `(userId, scope)`, `editorBridge.ts`).
Elegant für Co-Editing; aus eigener Praxis dokumentiert (`Repos/instatic/research/instatic/01-mcp-workflow.md`):
Ohne offenen Workspace scheitern alle Schreib-Tools — und der 220-Knoten-Editor hat den headless
Browser zweimal abgehängt. Das Modell ist: **eine Session, ein Scope, ein Browser.**

**Senify nach Plan:** Plan-first-MCP über die kanonische Mutations-API, headless; nach **B10**
auch für Style-Rules; nach **B12** mit harten Guardrails im Schreibpfad; Phase 5 (SSE-Follow)
macht den Bau für den Menschen sichtbar, ohne dass er den Editor offen halten muss.

**Warum das strategisch zählt:** **Viele Agenten auf vielen Sites gleichzeitig** — CI, Cron,
Batch-Jobs, Agentur-Pipelines — ist mit Senifys Modell frei Haus, mit Instatics Modell eine
Umbauarbeit am Live-Bridge-Konzept (das für sein Co-Editing zwingend ist). Der Flaschenhals
„offener Browser" ist für den Mensch-am-Werkzeug-Modus richtig und für den Fabrik-Modus falsch.
Senify baut nur den Fabrik-Modus — mit Follow statt Co-Editing als menschlicher Teilnahme.

---

## 2. Wo Instatic auch danach vorn bleibt (ehrliche Tabelle)

| Achse | Warum Instatic vorn bleibt | Kann Senify das holen? |
|---|---|---|
| **Editor-UX/Chrome** | Jahre an Feinschliff: Spotlight, Inline-Edit, Selector-Picker, Settings, Step-up-Dialog; meine 31-Szenarien-Begehung fand solide Arbeit | Phase 3 schließt die Lücke **funktional**, nicht im Feinschliff — realistisch: 12–18 Monate hinterher |
| **Co-Editing** | Yjs + Site-Socket, fertig, kontinuierlich persistiert | **Nein, absichtlich** (E3; Patch-Undo statt CRDT ist Senifys These). Bleibt Produktunterschied, kein Mangel |
| **Dynamik-Layer** | Islands (`<instatic-hole>` + IntersectionObserver-Runtime) + LRU-Render-Cache; „Seite mit Suche/Warenkorb" hat nur Instatic eine elegante Antwort | Teilweise: Formulare + Loops decken Marketing-Sites; ein Islands-Äquivalent wäre eigenes Ticket nach Phase 5 |
| **Self-Hosting-Flexibilität** | PG **und** SQLite auf dem billigsten Host; Dialekt-Parität als Gate | B6 macht die PG-only-Entscheidung ehrlich, ändert sie aber nicht. Für „läuft auf jedem Shared-Host" bleibt Instatic die Wahl |
| **Plugin-Ökosystem** | QuickJS-WASM-Sandbox mit Permission-System, Manifest-Lifecycle, Editor-/Server-Erweiterung | Nein — Senifys Registry ist bewusst First-Party-kuriert. Andere Erweiterungsphilosophie, nicht nachholbar ohne Widerspruch |

**Fazit der Tabelle:** Instatic behält den **Werkzeug-Markt** (Menschen gestalten selbst, gemeinsam,
auf billigem Hosting, mit Plugins). Senifys Plan zielt genau daneben: der **Plattform-Markt**
(Agenten bauen, Menschen geben frei, Qualität wird erzwungen, skalierbar headless).

---

## 3. Die Bedingung, damit es mehr als Theorie wird

„Nach dem Plan" heißt konkret drei Dinge — sonst bleiben die fünf Spuren Papier:

1. **Das Paritäts-Tor wird CI-Blocker** (nicht „Beweis in der Suite"). Sonst ist Spur 1 ein
   Testbericht. → B11 + O9-Kopplung.
2. **B1/B10/B12 landen vor dem Inspektor.** Sonst wächst die UI am falschen Style-Rule-Modell
   (B1), der Save-Pfad wird zum Nachtrag (B10), und die Quality-Fence wird nachträglich
   passend gestückelt (B12). → Reihenfolge in `02`, Abschnitt „Reihenfolge auf einen Blick".
3. **Phase 3/Chrome liefert wirklich — mit B7 vorgezogen.** Spur 4 (Review-Flow) ist ohne
   bedienbaren Editor nicht vermarktbar: Der Mensch, der „Übernehmen/Verwerfen" klicken soll,
   braucht eine Arbeitsfläche, nicht einen Formularbaum.

---

## 4. Wie man es beweist statt behauptet: der Agent-Benchmark

Der sauberste Beleg für (oder gegen) die Überholspuren ist ein kontrollierter Vergleich. Design:

**Auftrag (identisch in beiden Systemen):** „Baue die Startseite von nick-webdesign.de nach —
Hero, Leistungen, Referenzen, Testimonials, Kontakt. Deutsche Inhalte, responsive."

**Durchführung:** Derselbe Agent-Typ (Claude Code) mit dem MCP des jeweiligen Systems; gleiche
Token-Zeit; gleiche Anzahl erlaubter Iterationen; Start aus leere Site. Mehrere Läufe pro System
(≥ 3), um Varianz zu sehen.

**Messgrößen:**

| Metrik | Erhebung | Prognose-Direction |
|---|---|---|
| **Bruchrate** | Anteil der Läufe, die ohne menschlichen Fix durch die QA-Gates kommen (O9-artig: keine 404, Bilder geladen, kein Overflow, Heading-Ordnung) | Senify klar besser (Registry + Ganzdokument-Gates + Parität) |
| **Output-Konsistenz** | Streuung über die Läufe: gleicher Auftrag → wie ähnlich sind die Ergebnisse (Struktur-Diff, Design-Token-Treue) | Senify besser (Systeme erzwingen, Agent erfindet weniger) |
| **Iterationszahl bis Bestehen** | MCP-Calls bis QA grün | Offen — Instatics `site_insert_html` ist ein starker Einzelzug, Senifys Mutations-Batches sind stark; könnte unentschieden enden |
| **CSS-Bytes / Regel-Komplexität** | `measureCss`-artige Messung des Output-Stylesheets | Senify besser (Token-Zwang) |
| **Zeit bis Publish** | Wanduhr inkl. menschlicher Review-Schleife | Senify besser, *sobald* der Review-Flow UI hat (Spur 4); ohne UI verliert es hier |
| **Visuelle Qualität** | Blind-Vergleich der Ergebnisse (menschliche Jury, kein automatisches Urteil — meine Sichtprüfung ist strukturell, nicht ästhetisch) | Offen; hängt am Agenten, nicht am System — genau deshalb ist die Fence-Metrik wichtiger |

**Interpretationsrahmen:** Das erwartete Profil — Senify gewinnt Bruchrate + Konsistenz +
Bytes, Instatic gewinnt Bedienbarkeit + Iterationsgeschwindigkeit durch die offene Welt — wäre
**kein Patt, sondern die Bestätigung der Marktthese**: Zwei Systeme, zwei optimale Nutzungen.
Der Benchmark macht die Überholspuren von Behauptungen zu Messungen; sein Ergebnis könnte die
Plan-Verzerrungen auch falsifizieren (dann wären Spur 2 und 5 zu relativieren).

---

## 5. Schluss in einem Satz

Nach dem Plan wäre Senify die bessere **Plattform für Agenten, die bauen, und Menschen, die
freigeben** — gemessene Parität, erzwungene Qualität, transaktionale Batches, skalierbar headless —
während Instatic das bessere **Werkzeug für Menschen, die selbst gestalten, gemeinsam** bleibt:
freier Editor, Co-Editing, Plugins, läuft überall. Der Plan zahlt nicht darauf ein, Instatic zu
schlagen — sondern darauf, **den Markt zu besetzen, den noch niemand besetzt**.
