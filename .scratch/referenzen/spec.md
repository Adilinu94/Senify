# Referenzen: Framer-Sammlung, Design.md im Portal, Redesign per Agent

Status: **umgesetzt (20.09.)** — Import, Dokument-Reiter und Redesign-Paket stehen; Tests grün
Herkunft: Nutzerauftrag vom 20.09. („Referenzseiten mit Vorschaubild und Design.md im Portal; der Agent soll ein Redesign meiner Seite im Stil von Referenz A und B anlegen")
Vorbild: `C:\Users\adini\projects\taste-vault` (Taste Vault, MIT) — die Bibliothek folgt ihm bereits (T14)
Datenquelle: `Referenzsites/` (684 Ordner, Framer-Marketplace-Auswertung vom 19.09.2026)

## Auftrag

Die bereits angelegten Referenzseiten sollen in die Portal-Bibliothek („Referenzen") kommen, je mit Vorschaubild und `design.md`. Danach soll ein per MCP verbundener Agent auf Zuruf („Erstelle mir ein Redesign meiner Seite xy im Stil der Referenzseite A und B") Seiten im Stil der Referenzen anlegen.

## Entscheidungen (mit dem Nutzer abgestimmt)

1. **Alle 684 Referenzen** werden vollständig importiert (Metadaten, `design.md`, `design-guidelines.md`, `design-components.md`, Desktop- und Mobile-Screenshot).
2. Die Dokumente erscheinen im **Detail-Fenster als Reiter** (Übersicht · Design.md · Guidelines · Komponenten), Markdown gerendert, je Dokument ein Kopieren-Knopf.
3. Das Redesign landet in **zwei neuen Sites mit je einer Seite** (je Referenz ein eigenes Theme, weil das Theme in Senify site-weit gilt).
4. Der Agent bekommt ein **Redesign-Paket** (`plan_redesign`) und baut mit den bestehenden Tools; kein Vollautomatik-Tool.

## Umfang

- **Scheibe 1 (Import):** `documents` am Referenz-Datensatz, Dokument-Parser (Design.md → Profil mit Evidenzstufen), Ordnerleser, Import-Skript, Verdrahtung in `createManualReference`.
- **Scheibe 2 (Portal):** Dokument-Reiter im Detail-Fenster, Mini-Markdown-Renderer, Desktop-/Mobil-Umschalter, Kartenliste in Blöcken mit Bildern auf Sicht.
- **Scheibe 3 (Agent):** Engine-Route `/api/pages/:pageId/redesign-package`, MCP-Tools `plan_redesign`, `duplicate_site`, `create_site`, Leitfaden „Redesign aus Referenzen".

## Abnahme

- `pnpm typecheck`, `pnpm lint`, `pnpm test` grün (am 20.09.: 144 Dateien, 1293 Tests bestanden, 2 übersprungen).
- Import: 679 Referenzen in 41 Sammlungen, 0 Fehler; zweiter Lauf legt nichts neu an, sondern aktualisiert.
- Jede importierte Referenz hat Dokumente, zwei Snapshots und ein Profil aus den Dokumenten (Theme-Ableitung ohne Live-Analyse möglich).
- `plan_redesign` liefert je Referenz einen unterschiedlichen Theme-Patch mit bestandener Gegenprobe.
- `duplicate_site` + `update_theme` erzeugen zwei Sites im jeweiligen Stil (im MCP-Workflow-Test belegt).

## Nicht in diesem Umfang

- Live-Analyse der 684 URLs (Playwright) — die Dokumente tragen die Werte; ein Live-Lauf bleibt je Referenz möglich (`analyze_reference`).
- Bearbeiten der Dokumente im Portal (die Dateien bleiben die Quelle; ein zweiter Import-Lauf frischt sie auf).
- Bilder der Referenzen im Repo (die Sammlung ist ab jetzt in `.gitignore`; die Kopien liegen im Datenverzeichnis der Engine).

## Offen

- **Nichts.** Der Import in die eigene Bibliothek ist gelaufen (20.09.): 679 Referenzen und 41 Sammlungen neu, 0 Fehler, 824 s; der Kontrolllauf legte nichts neu an (0 neu/679 aktualisiert). Bestand jetzt: 726 Referenzen, 71 Sammlungen, 18 Stilfamilien.
- Der Import läuft gegen die eigene Instanz (`~/.senify/pg` auf Port 5433, Eintrag in `~/.senify/config.json`). Wichtig beim Start von Hand: Der Postmaster muss aus einer normalen Shell kommen; aus einer eingeschränkten Prozessumgebung brachen die Client-Backends mit `0xC0000142` ab (Umgebungsproblem, nicht der Anwendung).
