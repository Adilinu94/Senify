---
title: Redesign aus Referenzen
description: Eine Seite im Stil einer oder zweier Referenzen neu bauen: Paket holen, je Referenz eine Kopie, Theme schreiben, prüfen.
path: /guides/redesign-aus-referenzen
group: Guides
order: 11
---

## 1. Referenzen wählen

Die Bibliothek liegt im Referenzen-Tab des Programms und über MCP bereit:

- `list_references` mit `q`, `collection` oder `sort` findet Kandidaten (Name, Familie, Sammlung, Notiz).
- `get_reference` lädt das Profil (Tokens mit Belegstellen, Typo-Skala, Familien, Regeln, Evidenz) und seit dem Import der Framer-Sammlung auch die Dokumente `design`, `guidelines`, `components`.
- `list_reference_collections` zeigt die Kategorien (Business, Portfolio, SaaS, Agentur, …); `get_reference_brief` liefert den Brief im Text des Vorbilds.

Eine Referenz ohne Profil (reiner Bild-Upload) kann kein Theme ableiten: erst `analyze_reference` mit der URL laufen lassen, oder die Referenz über das Import-Skript mit Design.md einspielen (`import-referenzsites`).

## 2. Paket holen

```text
plan_redesign { pageId: "<Seite xy>", referenceIds: ["<Referenz A>", "<Referenz B>"] }
```

Das Paket enthält:

| Feld | Bedeutung |
|------|-----------|
| `source.outline` | Die Sektionen der Zielseite mit Typ, Variante und den lesbaren Text-Props |
| `targets[].themePatch` | Der abgeleitete Patch (`scales`, `fonts`, `motion`) für `update_theme` |
| `targets[].themePreview` | Was der Patch auf dem aktuellen Theme ergibt (Marke, Schriftpaar, Radien, Bewegung) |
| `targets[].verification` | Die Gegenprobe: idempotent, Skalen stabil, Theme gültig |
| `targets[].rationale` | Warum welcher Wert aus welchem Token kommt |
| `targets[].documents` | design.md, Guidelines und Komponenten im Originaltext |
| `targets[].rules` | Grundsätze und No-Gos der Referenz (aus den Guidelines) |
| `steps` | Die Schrittfolge, die dieses Paket erwartet |

Das Paket ist ein Lesevorgang: Seite, Theme und Drafts bleiben unangetastet.

## 3. Bauen: eine Kopie je Referenz

Zwei Referenzen sind eine **Auswahl, kein Blend**: jede bekommt ihre eigene Richtung.

```text
duplicate_site { siteId: "<Quell-Site>", name: "<Name> im Stil von A", withContent: true }
update_theme   { siteId: "<Kopie>", theme: <targets[0].themePatch> }
```

- `duplicate_site` übernimmt Seiten, Artikel und Sammlungen der Quelle (`withContent: true`); ohne Inhalt entsteht nur der Rahmen.
- `update_theme` schreibt den Patch; die Skalen-Engine erzeugt daraus Farben, Typo-Skala, Radien und Bewegung. Ohne diesen Schritt bleibt das Theme der Quelle stehen.
- Dasselbe Paar noch einmal mit `targets[1]` und einem zweiten Namen.

## 4. Seite anpassen

Die Kopie bringt den Inhalt mit; der Stil kommt aus dem Theme. Für alles, was das Theme nicht trägt:

- `get_page` prüft die Struktur gegen `source.outline`, `get_nodes` liefert die vollen Props.
- `apply_mutations` ändert `variant` oder Props; **token-first** (`{ "$token": "accent" }`) statt Rohwerte, Rohwert-Warnungen sind ein Signal.
- `list_sections` und `get_section` liefern den Katalog (Golden Example als Vorlage): nichts improvisieren.
- Regeln der Referenz beachten: `targets[].rules.never` ist die Liste der No-Gos, `targets[].rules.constants` die Grundsätze. Originaltexte, Logos und Fotos der Referenz werden nie übernommen.

## 5. Prüfen und übergeben

- `create_preview` je Kopie: den Entwurf ansehen, bevor er irgendwo auftaucht.
- Struktur gegen das Paket lesen (`get_page`), bei Motion-Änderungen die Video-Checkliste.
- `submit_for_review` erzeugt das Review-Item mit Preview und Struktur-Diff; das Publish bleibt bei einem Menschen oder einem bewusst ausgestatteten Publish-Agenten.

## Grundregeln

- **Erst Paket, dann Bau**: die Werte kommen aus dem Profil, nicht aus dem Bauchgefühl.
- **Eine Richtung je Referenz**: nicht mischen, sondern nebeneinander stellen und entscheiden lassen.
- **Der Bake bleibt unberührt**, solange kein Theme geschrieben und kein Release angelegt wird.
- Referenzen ohne Profil und ohne Design.md zuerst nachziehen: siehe [Site aus Brief](/guides/site-aus-brief).
