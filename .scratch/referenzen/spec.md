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

- **Import in die eigene Bibliothek:** Der Volllauf lief gegen eine temporäre Instanz (pg-mem) und ist belegt. In die echte Bibliothek (`~/.senify/pg` auf Port 5433, so steht es in `~/.senify/config.json`) konnte er am 20.09. nicht laufen, weil die Instanz nicht erreichbar war: Start über `pg_ctl` gelang, aber jeder Client-Backend brach mit `0xC0000142` ab (Umgebungsproblem der Instanz, nicht der Anwendung). Sobald die Datenbank erreichbar ist, genügen zwei Befehle (siehe Ausgabe des Auftrags): Trockenlauf, dann Echtlauf; der Lauf ist wiederholbar.
