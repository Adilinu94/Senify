# 08: Media-Pipeline & Bibliothek

**What to build:** Medien von Upload bis Auslieferung: signierter Upload direkt zum EU-Storage, Validierung (Typ-Allowlist, Größe, Alt-Pflicht mit Dekorativ-Ausnahme), Hash-Dedupe, feine Varianten-Ladder (64 · 320 · 640 · 1024 · 1600 · 2048 · Intrinsic; kein Upscaling; AVIF + WebP + Original) mit automatischem `sizes`-Resolver aus der Sektions-Layoutmathematik, Blurhash + Aspect-Reservierung, Focal-Point-Crops. Bibliothek mit Ordner-Baum, Tags, vier Smart-Listen (Ohne Alt-Text · Ohne Tags · Große Dateien · Zuletzt ersetzt), Replace File unter gleicher ID/URL (Historie + Restore), Papierkorb, Bulk-Bearbeitung. Media-Tools (`upload_asset`, `update_asset`, `replace_asset`, `delete_asset`, `restore_asset`, `list_assets`) mit `write`-Scope; gelöschte Assets markieren `assetRef`s als „broken".

**Blocked by:** 05 (Renderer & Bake — srcset im Bake), 06 (MCP-Kern & Agent-Setup — Tools/Audit).

**Status:** ready-for-agent

- [ ] Upload → Asset-Record mit Varianten (keine Rung über Originalgröße); Dedupe per Hash; Client-upload signiert
- [ ] Bake erzeugt `<picture>`/`srcset`/`sizes` aus der Ladder + Blurhash-Platzhalter mit reservierter Aspect-Ratio; Focal-Point steuert Crops
- [ ] Replace File erhält ID/URL (Verwendungen bleiben gültig), Metadaten bleiben, Historie + Restore, CDN-Cache invalidiert; Audit-Event
- [ ] Bibliothek: Ordner (DnD, „Ohne Ordner" bei Ordner-Löschung), Tags, Smart-Listen als Arbeitsflächen, Raster/Liste, Suche/Filter/Sortierung
- [ ] Bulk-Bearbeitung (Alt-Texte, Tags, Ordner, Trash/Purge) mit Ergebnisbericht inkl. Fehler-IDs
- [ ] Alt-Pflicht-Hard-Check greift (Dekorativ-Ausnahme dokumentiert); gelöschtes Asset → „broken"-Markierung an Referenzen
- [ ] Alle Media-Tools funktionieren mit `write`-Scope; Alt-/Meta-Update; Prüfstelle-1-Tests decken Verträge

Quellen: `artifacts/15`, `artifacts/25`, Spec „Media" (Verträge aus 15/25), `research/26` (Signed-Upload-Muster).
