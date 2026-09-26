---
title: Redesign aus Referenzen
description: Eine bestehende Seite anhand einer oder mehrerer Referenzen neu bauen: Plan, angebotene Richtungen, menschliche Wahl, bearbeitbarer Draft, Prüfung und Review.
path: /guides/redesign-aus-referenzen
group: Guides
order: 11
---

Der ausführbare Agent-Workflow liegt als `senify-referenz-redesign.md` im Senify-Skillpaket. MCP-Werkzeuge, Skill und dieser Guide verwenden denselben Ablauf.

## 1. Quellseite und Referenzen bestimmen

Ausgangspunkt sind eine Quell-`siteId`, die konkrete `pageId` und eine bis drei Referenz-IDs.

- `search_references` oder `list_references` findet Kandidaten in der Bibliothek.
- `find_duplicate_references` verhindert doppelte Analysen einer bereits bekannten URL.
- `get_reference`, `get_reference_brief` und `get_reference_docs` liefern Profil, Regeln, Vokabular, Theme-Belege und importierte Design-Dokumente.
- Eine Referenz ohne Profil kann keinen Theme-Patch ableiten. Sie braucht zuerst `analyze_reference` oder ein Design-Dokument aus dem Import.

## 2. Redesign-Plan lesen

```text
plan_redesign { pageId: "<Quellseite>", referenceIds: ["<A>", "<B>"] }
```

Das Paket ist ein reiner Lesevorgang. Es enthält:

| Feld | Bedeutung |
|------|-----------|
| `source.outline` | Typ, Variante und lesbare Text-Props der Quellseite |
| `targets[]` | je Referenz Theme-Patch, Theme-Vorschau, Gegenprobe, Begründung, Regeln und Dokumente |
| `warnings[]` | fehlende Belege oder Risiken vor dem Apply |
| `steps[]` | vorgesehene technische Schrittfolge |

Mehrere Referenzen im Plan sind Kandidaten, kein automatischer Blend. Der Mensch bekommt jede Richtung als eigene Direction Card zu sehen und entscheidet sich für genau eine.

## 3. Richtung anbieten lassen

```text
create_redesign_proposal { pageId: "<Quellseite>", referenceIds: ["<A>", "<B>"], idempotencyKey: "<stabil>" }
```

Der Server leitet aus den Referenz-Profilen **selbst** ein bis drei Direction Cards ab und speichert sie unveränderlich. Ein Agent kann keine Cards, Theme-Patches oder Entscheidungen einspeisen.

Je Card stehen:

| Feld | Bedeutung |
|------|-----------|
| `id` | stabile Kennung der Richtung; nur innerhalb des Proposals eindeutig |
| `reference` | Name, Quelle, Sammlung, Familie, Vokabular |
| `screenshot` | **private Kopie** des Referenzbildes im Proposal, mit Hash und Alt-Text |
| `theme.patch` | der abgeleitete Theme-Patch, den die Richtung später schreibt |
| `theme.specimen` | Marke, Neutral, Display- und Fließschrift, Typo- und Radiusbasis — die kleine Vorschau |
| `rationale` | je Wert die Belegstelle aus dem Referenzprofil |
| `rules` | Grundsätze und No-Gos aus den Guidelines |
| `warnings` | Risiken dieser Richtung (fehlendes Design.md, Gegenprobe, leere Skalen) |
| `sectionPlan` | Bauumfang: Zieltyp und Variante je Quell-Section, vollständiges Variant-Preset, erhaltene Inhalte, Slots, Medienbedarf |
| `offerHash` | Fingerabdruck des Angebots; ändert er sich, ist die Karte nicht mehr das Angebotene |

Das Proposal merkt sich zusätzlich die Planbasis: Draft- und Theme-Version, Source-Tree, Site-Profil, Design-Contract, Mapping-Version, Profilstand der Referenzen sowie die Hashes der verwendeten Bausteine.

### Was der Sektions-Plan sagt

Der Plan entsteht serverseitig aus dem vollständigen Quellbaum und der aktuellen Baustein-Bibliothek. Er beantwortet für jede Section der Quellseite:

- **Zieltyp** — registrierte Typen bleiben erhalten. Unbekannte, veraltete oder strukturelle Typen werden `manual`; geraten wird nichts.
- **Zielvariante** — eine gültige vorhandene Variante bleibt, sonst greift die Vorgabe des Bausteins. Das **vollständige Preset** der Variante steht mit drin, weil ein reiner Variantenwechsel die Preset-Werte nicht nachträglich setzt.
- **Inhalte** — bleiben erhalten. Der Plan nennt die Inhaltsschlüssel, ändert aber keine Texte.
- **Slots** — als vollständige Endbestände, inklusive erlaubter Typen und Anzahl.
- **Medienbedarf** — siehe unten.

### Medienbedarf

| Behandlung | Bedeutung |
|-----------|----------|
| `reuse` | vorhandenes Asset dieser Site, Status `ready`, mit Hash — es wird weiterverwendet |
| `select` / `upload` | im Draft referenziert, aber fehlend, fremd oder nicht bereit — es ist Ersatz nötig |
| `generate` | eine visuelle Rolle ohne vorhandenes Bild — mit konkretem Prompt als spätere Arbeitsanweisung |
| `avoid` | Logo, Schrift oder identitätsgefährdendes Vorbild-Medium — **nicht** übernehmen |
| `manual` | ein Mensch entscheidet |

Beim Anlegen des Proposals wird **kein** Bild geladen, kopiert oder erzeugt. Referenzmedien sind Stilbeleg, kein Ziel-Asset.

## 4. Richtung bestätigen (nur durch einen Menschen)

Die Bestätigung ist ein **menschliches Kommando** und läuft ausschließlich im lokalen Programm, nie über MCP. Ein Agent-Token erhält `403`.

Im Canvas der Quellseite erscheint ein nichtmodaler Hinweis („2 Richtungen“). Er öffnet ein Fenster mit den Cards: Bild, Theme-Specimen, Regeln, Bauumfang und Medienbedarf je Richtung. Keine ist vorbelegt, und erst die Auswahl aktiviert die Bestätigung.

- **Plan veraltet?** Wird die Quellseite, das Theme, das Site-Profil, die Design-DNA oder ein verwendeter Baustein zwischenzeitlich geändert, blockiert die Bestätigung mit einer verständlichen Meldung. Es wird nichts automatisch neu berechnet — neu planen.
- **Karte nachträglich verändert?** Der gespeicherte Inhalt wird vor der Bestätigung neu gehasht. Stimmt er nicht mehr, wird abgelehnt.
- **Bestätigt:** Die Entscheidung wird gespeichert, dann entsteht der Draft mit dem gespeicherten Theme. Die Antwort nennt `siteId` und `pageId`; der Editor öffnet genau diese Seite.
- **Noch einmal geklickt:** Es entsteht kein zweiter Entwurf. Ein erneuter Lauf liefert das gespeicherte Ergebnis.

### Was die Bestätigung schreibt

```json
{
  "scope": "scaffold-theme",
  "sectionPlanApplied": false,
  "planHash": "…",
  "siteId": "…",
  "pageId": "…"
}
```

`scope` und `sectionPlanApplied` sagen ausdrücklich: bestätigt und geschrieben wurden **Theme und Draft-Grundstruktur**, nicht die Sections. Die Sections setzt der Agent im nächsten Schritt aus dem Sektions-Plan um.

Die Bestätigung ist **eine Transaktion**: Direction Decision, neue Site, Theme, Grundstruktur, Protokoll und der Status des Vorschlags werden zusammen geschrieben. Bricht etwas ab, bleibt nichts halb stehen — der Vorschlag bleibt offen und kann erneut bestätigt werden. Ein Vorschlag kann darum nicht dauerhaft im Status „wird angewendet“ hängen bleiben.

## 5. Projekte duplizieren: Medien gehören mit

Eine Projektkopie nimmt die genutzten Medien mit: jedes Bild bekommt eine eigene Kennung und einen eigenen Speicherpfad, Bildleister und Ordnerstruktur wandern mit, und die Seiten der Kopie zeigen danach auf die Kopie. Die beiden Projekte sind unabhängig — ein Löschen in der Kopie lässt das Original unberührt.

Zugriffe auf Medien brauchen immer das Projekt: `GET`, `PATCH`, `DELETE`, `restore`, `purge`, `history` und `restore-history` liegen unter `/api/sites/{siteId}/assets/…`. Eine Kennung aus einem fremden Projekt wird abgewiesen, bevor etwas geschrieben oder gelöscht wird.

## 6. Den Entwurf bearbeiten

`create_redesign_proposal` schreibt nur Theme und Draft-Grundstruktur. Leere Seiten bekommen `hero → content → cta` (`seeded: true`); bestehende Seiten behalten ihre Sektionen (`seeded: false`).

Der sichtbare Umbau läuft über den normalen Editor-Schreibpfad und folgt **exakt** dem Sektions-Plan der bestätigten Card:

```text
get_page
→ get_section
→ apply_mutations { baseDraftVersion, mutations }
```

Dabei gilt:

- Zieltyp und Zielvariante kommen aus dem Plan; ein Variantenwechsel materialisiert das vollständige Preset.
- Inhalte bleiben erhalten, das Design ändert sich.
- Slots werden als vollständige Endbestände geschrieben.
- Medien: `reuse` weiterverwenden, `select`/`upload`/`generate` erledigen, `avoid` nie übernehmen.
- Varianten, Props und Breakpoints kommen aus Registry und Golden Example.
- Theme-Tokens kommen Literalen vor.
- `dry_run: true` prüft unsichere Batches vor dem Write.
- Bei 409 wird `get_page` neu geladen und der Batch auf dem aktuellen Draft neu aufgebaut.
- Originaltexte, Logos, Fotos und 1:1-Layouts der Referenz werden nicht übernommen.

Der Canvas lädt das gespeicherte Site-Theme als Theme-Objekt und Theme-CSS, nicht das Default-Theme der Programmshell.

## 6. Messen, korrigieren, prüfen

```text
get_design_report { siteId }
diff_reference { referenceId, siteId, pageId }
create_preview { siteId }
```

- `get_design_report` liefert Score und benannte Design-Findings.
- `diff_reference` backt den aktuellen Draft temporär und vergleicht die Referenz-Slots mit Pixelzahlen, Bounds und Heatmap.
- `create_preview` erzeugt eine signierte Vorschau des aktuellen Drafts.

Nach jeder sichtbaren Korrektur laufen Design-Report und Referenz-Diff erneut.

## 7. Review und Freigabe

```text
submit_for_review { siteId, pageIds, note }
get_review_feedback { reviewId }
```

`submit_for_review` baut Vorschau, Struktur-Diff und harte Checks. Der Workflow endet hier. `publish_release` ist eine getrennte Entscheidung nach ausdrücklicher menschlicher Freigabe.

## Automatischer Weg ohne Menschen

`apply_redesign` bleibt als autonomer Weg bestehen: Der Agent reicht `referenceIds` oder `collectionId` direkt ein und erhält sofort einen Draft. Das ist für unbeaufsichtigte Läufe gedacht, nicht für eine gestalterische Entscheidung. Beide Wege nutzen dieselbe Apply-Funktion.

## Nur das Theme übernehmen

Wenn kein Seitenumbau gewünscht ist, reicht der Leseweg:

```text
import_design_system { referenceId, siteId }
```

Er liefert einen Patch, Evidenzstufen, Lücken, Font-Hinweise und Konflikte. Geschrieben wird erst mit `update_theme` oder über eine bestätigte Richtung.

## Grundregeln

- **Vault first:** vorhandene Analysen und Dublettenprüfung vor neuer Erfassung.
- **Erst planen, dann vorschlagen:** `plan_redesign` ist read-only.
- **Card ist Angebot, Decision ist Wahl:** eine Richtung wählt ein Mensch, ein Agenten-Token darf das nicht.
- **Plan ist Arbeitsauftrag, kein Write:** bestätigt werden Theme und Grundstruktur; die Sections setzt der Agent über kanonische Mutationen.
- **Scaffold und Umbau trennen:** das Apply erzeugt die Basis, `apply_mutations` verändert bestehende Sektionen.
- **Token first, Registry is law.**
- **Referenz schützt Inhalte:** Copy, Marken, Fotos und identische Layouts gehören nicht in den Entwurf.
- **Aktives Release bleibt unberührt** bis zur ausdrücklichen Veröffentlichung.
