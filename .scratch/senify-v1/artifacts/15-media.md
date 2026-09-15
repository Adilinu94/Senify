# Artefakt 15: Media-Pipeline (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Media-Pipeline".
> Grundlagen: `artifacts/01` (Asset-Entity, `assetRef.focal`), `02` (Build-Bake), `09` (AssetPicker), `10` (upload_asset/update_asset/list_assets), `13` (Alt-Check), `14` (EU-Storage/Backups), `research/20` (sharp-/Blurhash-Worker-Pool), `research/22` (reale Medien: Bilder, selbstgehostetes mp4).

## Entscheidungen (Wizard, 6/6)

1. **Speicher & Delivery:** EU-Source + Site-CDN.
2. **Transforms:** Build-time srcset.
3. **Crops:** Focal-Point statt Crop-Editor.
4. **Alt-Texte:** Pflicht mit Dekorativ-Ausnahme.
5. **Video:** Upload ohne Transcoding.
6. **Library:** site-scoped + Hash-Dedupe.

## Pipeline

```
Upload (Editor-Picker · tool upload_asset · Agent)
  → Validierung (Typ-Allowlist, Größenlimit, Alt-Pflicht außer „dekorativ")
  → Speicherung EU-VPS / S3-EU (content-addressed per Hash · Dedupe)
  → Processing (Worker-Pool, sharp):
      Bilder: Varianten 480/960/1440/1920 in AVIF + WebP + Original-Fallback · Blurhash
      Videos: Poster-Frame (JPEG) · Metadaten (Dauer, Maße)
  → Asset-Record (Artefakt 01: id, kind, storageRef, width/height/durationMs, alt, hash)

Build (Release) → benötigte Varianten ins Deployment gebacken → Auslieferung über Site-CDN
```

## Bild-Auslieferung

- `assetRef { assetId, focal? }` + Usage-Layout → Build generiert `srcset/sizes` (`<picture>` AVIF/WebP/Fallback) mit Default-Breakpoints; Blurhash als Platzhalter (CLS-sicher, Aspect-Ratio reserviert).
- Focal-Point steuert Crops für definierte Aspect-Ratios je Sektion (Card 4:3, Hero 16:9 …).
- OG-Bilder: `Page.meta.ogImage` nutzt dieselbe Pipeline (1200×630-Variante).

## Video (v1)

- Upload mp4/webm (Größenlimit, z. B. 50 MB), Poster automatisch; Auslieferung als Datei mit `poster`; `loop`/`muted`-Optionen in den Media-Sektionen.
- Transcoding/Adaptive → **v2** (bewusst).

## Regeln & Checks

- Alt-Pflicht (außer explizit dekorativ) → **Hard-Check** (Artefakt 13).
- Dedupe per Hash; Löschen eines Assets setzt referenzierende `assetRef`s auf „broken" (Artefakt-01-Regel: markieren, nie automatisch entfernen).
- Backups laufen über die tägliche Sicherung (Artefakt 14).

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Editor-Picker + Upload-Flow | 09 |
| Tools: upload/update/list (Scopes write/read) | 10 |
| Alt-/A11y-Checks | 13 |
| Backup/Storage-Betrieb | 14 |
