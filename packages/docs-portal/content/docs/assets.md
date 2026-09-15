---
title: Assets beschaffen
description: Bilder, Icons und Fonts für Senify-Sites — Quellen, Lizenzen und die Alt-Text-Pflicht.
path: /guides/assets
group: Guides
order: 20
---

## Workflow

1. **Bedarf ableiten:** Welche Bilder trägt der Brief wirklich (Hero, Team, Projekte, Texturen) — und wo reichen Platzhalter?
2. **Quelle wählen:**
   - generieren mit dem lokalen Agenten-Werkzeug `image-use` (konsistente Bildsprache, keine Stock-Optik),
   - oder lizenzfreie Stock-Quellen (CC0/Public Domain oder gekauft).
3. **Prüfen:** Format (JPEG/WebP/AVIF, SVG für Icons), Dateigröße, Ausschnitt und Fokuspunkt.
4. **Alt-Text formulieren** — vor dem Upload, nicht danach.
5. **Hochladen:** `upload_asset` (Scope `write`) legt das Asset in der Mediathek ab; Dedupe per SHA-256 verhindert Doppelablagen.
6. **Referenzieren:** `assetRef { assetId, focal? }` in der Sektion; den Fokuspunkt setzen, wenn das Motiv sonst beschnitten wird.

## Quellen je Kategorie

| Kategorie | Primär | Sekundär |
| --- | --- | --- |
| Deko-Bilder | `image-use` generieren | lizenzfreie Stock-Quellen |
| Inhalts-Bilder | echte Kundenfotos | Platzhalter, im Review-Bericht markiert |
| Icons | Open-Source-Sets (Lucide, Phosphor, Heroicons) als SVG | — |
| Fonts | kuratiertes, self-hosted Set aus dem Theme | — |

## Guardrails

- **Keine Marken, keine realen Personen, keine Produkte 1:1** — Inspiration ja, Klon nein. Bei generierten Bildern die Composition-Ref-Möglichkeit nutzen („Bildaufbau leihen, nicht das Gesicht").
- **Lizenzen dokumentieren** — bei Stock die Lizenz, bei Generierung die Quelle notieren.
- **Alt-Text-Pflicht:** Jedes inhaltstragende Bild braucht einen Alt-Text; reine Dekoration wird explizit als `decorative` markiert. Der Asset-Hard-Check blockt Submit/Publish mit kaputten oder getrashten Referenzen.
- `image-use` ist ein **lokales Agenten-Werkzeug** (ChatGPT-/Gemini-Anmeldung, kein API-Key) — kein Plattform-Feature; die Engine bleibt unberührt.

## Nach dem Upload

- `update_asset` für Alt-Text, Tags und Ordner.
- `replace_asset` tauscht die Datei unter **gleicher ID/URL** (Verwendungen bleiben gültig, Historie + Restore inklusive).
- `delete_asset` verschiebt in den Papierkorb, `restore_asset` holt zurück; Purge braucht den `publish`-Scope.