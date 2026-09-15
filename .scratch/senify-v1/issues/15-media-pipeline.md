# Media-Pipeline

Type: grilling
Status: resolved
Blocked by: 02

Input: artifacts/09-editor.md
Input: artifacts/14-hosting.md

## Question

Wie werden Assets verwaltet: Upload (Agent + Mensch), Speicherort, Optimierung/Transforms (Responsive, WebP/AVIF), Delivery/CDN, Hotspot/Crop, Alt-Texte?

Welche Bausteine sind in v1 nötig, welche später?

## Answer

Media-Pipeline entschieden (6/6 Wizard). Artefakt: [artifacts/15-media.md](../artifacts/15-media.md).

- **Speicher/Delivery:** zentrale EU-Quelle (VPS/S3-EU, Hash-Dedupe, site-scoped) + Site-CDN; benötigte Varianten werden ins Deployment gebacken.
- **Transforms:** Build-time srcset (480/960/1440/1920 in AVIF+WebP+Fallback), Blurhash-Platzhalter, sharp im Worker-Pool.
- **Crops:** Focal-Point (`assetRef.focal`) + Build-Crops pro Aspect-Ratio — kein Crop-Editor in v1.
- **Alt-Texte:** Pflicht mit Dekorativ-Ausnahme; Hard-Check (13).
- **Video:** Upload ohne Transcoding (Poster-Frame automatisch); Transcoding/Adaptive → v2.
- **Regeln:** gelöschte Assets markieren Referenzen als „broken" (nie automatisch entfernen); Backups über 14.

## Comments

- **14.09.2026 — Scope-Update:** Media-Delta aus Instatic-Deep-Dive (`research/23`): Ordner, Smart Folders, Tags, Replace File, Trash, Ladder 64–2048 + sizes-Resolver → Ticket **25 Media-Erweiterung**.
