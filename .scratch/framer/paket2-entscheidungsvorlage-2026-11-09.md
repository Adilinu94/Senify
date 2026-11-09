# Paket 2: Entscheidungsvorlage — Ausgabearten und Kompatibilität (09.11.2026)

**Stand:** Branch `integration/c-auf-g-2026-11-08`, HEAD `43357c2`.
**Grundlage:** Paket-1-Beleg (`.scratch/framer/paket1-beleg-2026-11-09.md`), ADR-0010 (Island-Payload), ADR-0026 (Struktur-Baum als vollwertige Seite), ADR-0005 (Wert-Grammatik als Sicherheitsgrenze).
**Zweck:** Entscheidungen vor der Umsetzung des ersten strukturierten Zielpfads (Paket 3) fachlich treffen und dokumentieren. Diese Vorlage entscheidet nichts still; sie legt Optionen, Empfehlung und Kompatibilitätsfolgen offen. Maßgeblich bleiben `docs/adr/`, `docs/fahrplan.md`, `docs/current/stand.md`.

## 1. Ausgangslage (belegt)

- Der Import erzeugt bei erkannter Framer-Runtime **immer** einen seitenweiten Träger `framer-runtime-payload` (`coversPage:true`, Pflicht-Poster aus `og:image`), unabhängig vom Normalisierungsmodus `dna|fidelity` (`packages/framer-import/src/import.ts:625/688/823`). `mode` steuert heute nur die Normalisierung, **nicht** die Ausgabeart.
- Der Release zeigt den Payload statt der Struktur (`renderTreeOf`, `packages/renderer/src/bake.ts`); `editableShare {editable:0, original:100}`. Der Editorbaum ist eine Karte, nicht die ausgelieferte Seite (Paket-1-Fall-B: editierter Text steht in keiner gebauten HTML-Datei).
- ADR-0026 macht den Struktur-Baum zur vollwertigen Seite und führt `active` als Schalter ein; **der Payload bleibt der Standard** (ADR-0026 §3). Der Baum ohne Payload trägt keine Scroll-Choreografie/Lenis/three.js — bewusster Preis.
- **Blocker B1:** Der dokumentierte Schalter `active:false` scheitert für jeden Träger mit Pflicht-Poster an der Prop-Grenze (`checkPropValue` weist `{assetId:…}` ab, `packages/widget-engine/src/prop-boundary.ts:118/93`). Betrifft auch `image.asset`. Damit ist der bestehende Rückweg in den Baum für reale Importseiten nicht ausführbar und strukturierte Bearbeitung von Bild-Trägern blockiert.

## 2. Die zwei Ausgabearten (Zielbild)

| | **Original / Payload** (Bestand, Standard) | **Struktur / runtimefrei** (neu, additiv) |
|---|---|---|
| Auslöser | Framer-Runtime erkannt, Träger aktiv | Gewählter Modus; kein seitenweiter Runtime-Träger im Zielmodus |
| Ausgelieferte Seite | Fremd-Runtime (1:1-Optik, Bewegung) | Senify-Baum (editierbar, eigene Einblendungen) |
| Bearbeitbarkeit | 0 % im Release (Struktur nur Vorschau) | voll im Release; Änderung sichtbar nach Build |
| Runtime-Freiheit | nein (bewusst) | Ziel: ja — auch lokal gebündelte Framer-Runtime zählt als Fremd-Runtime |
| Kennzeichnung | „Original · Framer-Runtime“, `editableShare 0/100` | eigener Modus-Name + Befund je nicht übersetzter Komponente |
| ADR-Deckung | ADR-0010, ADR-0026 §3 | neue Entscheidung (Vorschlag: ADR-0032) + ADR-0026-Nachtrag |

Leitplanke aus ADR-0026 („Grenze, die bleibt“): Zwei Quellen für eine Seite heißen zwei Wahrheiten. Der Modus muss sichtbar machen, welcher Quelle der Release folgt — nicht verstecken.

## 3. Offene Entscheidungen (mit Empfehlung)

### D1 — Blocker B1: Asset-Referenz an der Prop-Grenze

- **Option A (Empfehlung):** Konsistenz-Bugfix. `checkPropValue` schickt eine von `matchesValueType("asset"|"link", …)` bereits akzeptierte Referenz nicht erneut durch die CSS-Grammatik (`checkSafeValue`), sondern behandelt sie wie der Primitiv-Schnellpfad (`assertPropValue`, `validation.ts:154`): opaque Referenz, kein CSS. Asset-IDs bleiben String-geprüft; die Medien-Pipeline löst sie sicher auf. Regressionstest: `payload.poster`/`image.asset` als `{assetId}` werden akzeptiert, unsichere CSS-Werte weiter abgelehnt; der Träger-Toggle gelingt mit Pflicht-Poster.
  - Einordnung: schwächt ADR-0005 nicht (Asset-Referenz ist kein CSS-Wert), beseitigt die Divergenz zweier Türen. Als **Nachtrag zu ADR-0005** dokumentieren, damit die Wert-Grenze ausdrücklich auch Referenz-Werte nennt.
- **Option B:** B1 als Architektur-Thema in die neue Ausgabeart-Entscheidung ziehen und erst mit Paket 3 beheben. Nachteil: der bereits beschlossene ADR-0026-Schalter bleibt bis dahin kaputt; jede Bild-Bearbeitung im Registry-Zweig bleibt blockiert.
- **Empfehlung:** A, zeitnah und mit Test, noch vor Paket 3. Begründung: B1 blockiert einen **bestehenden, beschlossenen** Pfad (ADR-0026), nicht erst den neuen.

### D2 — Name und API-Fläche der Ausgabeart

- **Option A (Empfehlung):** Neues Feld im Import-Body, z. B. `output: "original" | "structure"` (Default `"original"`), unabhängig von `mode` (Normalisierung). CLI/MCP/UI reichen denselben Wert durch; der Bericht nennt den gewählten Modus.
- **Option B:** `mode` um eine dritte Ausprägung erweitern. Nachteil: vermischt Normalisierungstreue und Ausgabeart, schwer rückwärtskompatibel zu erklären.
- **Empfehlung:** A. Saubere Trennung: `mode` = wie genau wird normalisiert, `output` = welche Quelle der Release zeigt.

### D3 — Standardverhalten und Migration

- **Option A (Empfehlung):** Default bleibt `"original"` (ADR-0026 §3). Bestehende gespeicherte Seiten und Reimports werden **nicht** still umgewandelt; der Modus wird je Seite/Projekt persistiert und bei Reimport respektiert. Rollback stellt den vorherigen Modus wieder her.
- **Option B:** Structured als neuer Default. Verworfen für diese Scheibe: bricht die 1:1-Zusage bestehender Projekte und ADR-0026 §3 ohne explizite Entscheidung.
- **Empfehlung:** A. Eine Modusänderung ist ein expliziter, auditierter Schreibvorgang, kein Seiteneffekt.

### D4 — Vertrag und Kennzeichnung über alle Oberflächen

- Import-Bericht, Vorschau, Build-Manifest, CLI, MCP und UI zeigen denselben Zustand: gewählter Modus, Payload-Herkunft (provenance/license, ADR-0010 §3/4), sichtbare Bearbeitbarkeit (`editableShare`), erkannte bzw. nicht geprüfte Abhängigkeiten, Blocker-Gründe.
- **Regel:** Ein absichtlich vorhandener Framer-Payload (auch lokal gebündelt) verhindert die Einstufung „runtimefrei“. `editableShare 0/100` bleibt die ehrliche Zahl für den Original-Modus.
- Nicht übersetzte Komponenten, fehlende Assets, nicht unterstützte Selektoren und Motion werden als **konkrete Teil-Ergebnisse oder Blocker** gemeldet; kein undurchsichtiges Original-Bundle als „strukturiert bearbeitbar“ ausgegeben.

### D5 — Bedeutung und Prüfung von „runtimefrei“ (Vorgriff auf Paket 4)

- „Runtimefrei“ heißt: keine Framer-Site-Runtime im ausgelieferten Pfad — **nicht** bloß „keine Anfrage an eine Framer-Domain“. Der Paket-1-Beweis zeigt warum: die Fixture-Runtime ist lokal gebündelt, `framerAnfragen:0`, und wird im Payload-Pfad trotzdem ausgeführt (DOM „montiert“).
- Die Herkunfts-/Abhängigkeitsprüfung (Paket 4) muss Bundles, statische/dynamische Imports, Skripte, CSS, Assets, Workers klassifizieren; nicht zuverlässig Klassifizierbares gilt als **unbekannt**, ein eingeschleuster Framer-Payload als **nicht runtimefrei**.
- Für Paket 2 reicht die Vertragszusage; die Prüfung selbst ist Paket 4. Die Vorlage benennt die Anforderung, damit der Modus-Name nicht mehr verspricht als geprüft ist.

### D6 — ADR-Bedarf

- **ADR-0032 (neu, Vorschlag):** „Zwei Ausgabearten für den Framer-Import: Original-Payload und strukturierter, runtimefreier Baum“ — Name, Default, API, Migration, Kennzeichnung, Verhältnis zu ADR-0010/0026.
- **ADR-0005-Nachtrag:** Wert-Grenze nennt ausdrücklich auch Asset-/Link-Referenzen als zulässige Nicht-CSS-Werte (D1 Option A).
- **ADR-0026-Nachtrag:** `active`-Schalter und Ausgabeart-Modus werden zusammengespannt; der Structured-Modus erzeugt im Zielmodus keinen seitenweiten Runtime-Träger.
- Keine Wiederverwendung bestehender ADR-Nummern für ein anderes Thema (Dokumentationsvertrag).

## 4. Kompatibilitäts- und Migrationstests (Paket-2-Gate)

| Fall | Erwartung |
|---|---|
| Bestehendes Projekt, Reimport ohne Modus-Angabe | bleibt Original-Payload; keine stille Umwandlung |
| Import `output:"structure"` | kein seitenweiter Runtime-Träger im Zielmodus; Bericht nennt Modus + Blocker |
| Import `output:"original"` | unveränderte Payload-Ausgabe, `editableShare 0/100` |
| Gespeicherte Seite mit Payload, Moduswechsel | explizit, auditiert; Rollback stellt alten Modus her |
| Widersprüchlicher Zustand (Payload vorhanden + „runtimefrei“ behauptet) | Einstufung „nicht runtimefrei“ / Blocker, kein falscher Erfolg |
| Alte Antwortform (ohne `output`) | rückwärtskompatibel interpretiert als `"original"` |
| B1-Regression | Träger-Toggle mit Pflicht-Poster gelingt; `{assetId}` akzeptiert; unsichere CSS-Werte weiter abgelehnt |
| CLI/MCP/UI | zeigen denselben Modus- und Bearbeitbarkeitsstatus |

## 5. Empfohlene Reihenfolge

1. **D1 Option A** (B1-Konsistenzfix + Regressionstest + ADR-0005-Nachtrag) — macht den bestehenden ADR-0026-Pfad wieder ausführbar.
2. **ADR-0032** entscheiden und annehmen (D2–D4), bevor der strukturierte Zielpfad implementiert wird.
3. **Paket 3:** erste kleine echte Seite oder ein abgegrenzter Abschnitt im Structured-Modus (Kandidat `/about`), Editor → Speichern → Reload → Build mit sichtbarer Änderung; Undo/Redo; Bericht nennt ungeprüfte Teile.
4. Danach Paket 4 (Runtime-Prüfung), Paket 5 (Mehrseiten/CMS), Paket 6 (Darstellung/Motion) in der geplanten Reihenfolge.

## 6. Was diese Vorlage nicht entscheidet

- Die endgültige API-Schreibweise und Persistenz des Modus (Detail der ADR-0032-Implementierung).
- Die Runtime-Klassifizierung selbst (Paket 4).
- Motion-Erweiterungen über ADR-0006/ADR-0029 hinaus (eigene Entscheidung, Paket 6).
- Lizenz-/Nutzungsgrenzen des Unframer-Snapshots (ADR-0028, Paket 5).