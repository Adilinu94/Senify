# Media-Erweiterung (Instatic-Delta)

Type: grilling
Status: resolved

Input: research/23-instatic-deepdive.md
Input: research/26-instatic-delta.md
Input: artifacts/15-media.md

## Question

Welche Media-Features aus dem Instatic-Deep-Dive ergänzen Artefakt 15?

Kandidaten:
- **Ordner** (Baum + Drag&Drop-Moves) · **Smart Folders** (Missing-Alt/Title, Untagged, Large Files, Recently Replaced) · **Tags**
- **Replace File** (Binär tauschen, ID/URL bleiben stabil) · **Trash** (Soft-Delete + Purge)
- **Varianten-Ladder** 64/320/640/1024/1600/2048 **+ Intrinsic-Rung**, srcset nur aus Varianten, **`sizes`-Resolver** (aus Layout-/CSS-Mathematik abgeleitet)
- Bulk-Bearbeitung · Storage-Adapter mit Signed-Redirects · Capability-Split (read/write/replace/delete)

Welche sind v1-pflicht, welche später? Wo ergänzen sie Artefakt 15 (und berühren 09/13)?

Ergebnis: konsolidiertes Media-Konzept v1.

## Answer

**Entschieden am 15.09.2026 (Wizard, 8/8) — Artefakt: [artifacts/25-media-erweiterung.md](../artifacts/25-media-erweiterung.md)**

- **Organisation:** Ordner-Baum (DnD) + Tags; vier Smart-Listen (Ohne Alt-Text · Ohne Tags · Große Dateien · Zuletzt ersetzt); „Ohne Alt-Text" speist den Hard-Check (13).
- **Replace File:** neue Datei unter gleicher ID/URL, alle Verwendungen bleiben gültig; Replace-Historie (Restore), Metadaten bleiben; CDN-Invalidierung.
- **Papierkorb:** Soft-Delete + explizites Purge; Ordner-Löschen verschiebt nur nach „Ohne Ordner".
- **Varianten-Ladder:** 64 · 320 · 640 · 1024 · 1600 · 2048 · Intrinsic (kein Upscaling) in AVIF/WebP; `srcset` nur aus Varianten; **`sizes`-Resolver** aus der Sektions-Layout-Mathematik.
- **Bulk:** Alt-Texte, Tags, Ordner, Trash/Purge für Mehrfach-Auswahl; Medien-Fenster im Editor (24) mit Signed-Upload.
- **Alles öffentlich:** kein Private-Delivery in v1; Signed-URLs nur für Uploads.
- **Agenten:** volle Medien-Rechte mit `write` (Nutzer-Entscheidung) — Schutz via Trash, Replace-Historie, Audit, Programm-Badge; Alt-Pflicht-Hard-Check bleibt.
- **Tool-Delta (10):** `replace_asset`, `delete_asset`, `restore_asset` ergänzen den Media-Tool-Katalog.
