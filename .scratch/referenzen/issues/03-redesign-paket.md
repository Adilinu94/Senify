# Referenzen 03 - Redesign-Paket für den Agenten

Status: **erledigt (20.09.)** - Route, drei MCP-Tools und Leitfaden stehen; Tests grün
Abhaengig von: 01-framer-import (Profil aus den Dokumenten) und der bestehenden Theme-Ableitung (`references-theme.ts`)
Herkunft: `.scratch/referenzen/spec.md`, Entscheidungen 3 und 4

## Ziel

Der Satz „Erstelle mir ein Redesign meiner Seite xy im Stil der Referenzseite A und B" muss für einen per MCP verbundenen Agenten ausführbar sein. Zwei Referenzen sind eine **Auswahl, kein Blend**: jede Richtung bekommt ihre eigene Site, weil das Theme in Senify site-weit gilt.

## Umfang

1. **Engine-Route** `GET /api/pages/:pageId/redesign-package?referenceIds=a,b` (Lesezugriff, neues Modul `redesign-package.ts`):
   - `source`: Site, Seite, `draftVersion`, Theme-Version und die Outline der Seite (Typ, Variante, lesbare Text-Props, eine Ebene tief genug für Sektionen und ihre Kinder).
   - `targets[]`: je Referenz der `themePatch` (`scales`, `fonts`, `motion`) aus `deriveThemeDraft`, die Vorschau der aufgelösten Werte, die Gegenprobe (`verifyThemeRoundTrip`), die Begründung je Wert, Dokumente, Regeln (Grundsätze/No-Gos aus den Guidelines), Vokabular und Komponenten.
   - `steps` und `warnings`. Eine Referenz ohne Profil wird mit Hinweis abgelehnt (409), fehlende `referenceIds` und mehr als drei Referenzen mit 400.
   - Der Aufruf ändert nichts: kein Theme, kein Draft, kein Release (im Test geprüft).
2. **MCP-Tools:**
   - `plan_redesign` (read) ruft die Route und erklärt in der Beschreibung die Schrittfolge.
   - `duplicate_site` (write) kopiert eine Site (`withContent` Default true) und benennt die Kopie optional um.
   - `create_site` (write) legt ein Projekt an (fehlte bisher im MCP).
   - Annotations-Matrix bleibt vollständig (readOnly/destructive/idempotent/openWorld je Tool explizit).
3. **Leitfaden** `packages/docs-portal/content/docs/redesign-aus-referenzen.md` (Gruppe Guides, Order 11): Referenzen wählen, Paket holen, je Referenz duplizieren und Theme schreiben, Seite anpassen (token-first, Katalog), prüfen, übergeben. Verweis aus „Site aus Brief" und umgekehrt.

## Abnahme

- Zwei importierte Referenzen liefern zwei unterschiedliche Theme-Patches mit bestandener Gegenprobe.
- `duplicate_site` bringt Inhalt und Theme mit; `update_theme` schreibt den Patch; die Kopie behält die Seite.
- Eine Referenz ohne Profil (reiner Bild-Upload) wird mit klarer Anweisung abgelehnt.
- Der Leitfaden erscheint im Docs-Portal und in der Suche; die Tool-Referenz listet die drei neuen Tools.

## Belege

- `packages/engine/test/redesign-package.test.ts` (4 Tests: Paket, Einzelreferenz + Warnung, ohne Profil, Validierung).
- `packages/mcp/test/workflow.test.ts`: neuer Block „plans a redesign, duplicates the site and writes the derived theme" plus die erwartete Tool-Liste.
- `pnpm docs-portal`-Test: `guides.test.ts` führt den neuen Pfad.
