# Assets — Beschaffung, Lizenzen, Alt-Text

## Workflow

1. **Bedarf aus dem Brief ableiten:** Hero-Bild, Team-Fotos, Projekt-Cover, Logos, Icons — und wo Platzhalter reichen.
2. **Quelle wählen:**
   - **Engine-Generierung** über `generate_image` → `get_image_job` (Default `image-use` ≈ 1 min,
     lokaler Qwen-Fallback Minuten; Ablauf, Prompt-Rezept und Fehlerfälle in `images.md`) —
     Konsistenz über alle Bilder, keine Stock-Optik,
   - oder lizenzfreie Stock-Quellen (CC0/Public Domain oder gekauft).
3. **Prüfen:** Format (JPEG/WebP/AVIF, SVG für Icons), Größe (keine Riesen-Uploads), Ausschnitt/Fokus.
4. **Alt-Text formulieren**, bevor der Upload passiert (siehe unten).
5. **Hochladen:** `upload_asset` (lokaler `filePath`; die Engine signiert die Upload-URL, Dedupe per SHA-256-Hash).
6. **Referenzieren:** `assetRef { assetId, focal? }` in der Sektion; Fokuspunkt setzen, wenn das Motiv sonst beschnitten wird.

## Bibliothek

- **Ordner + Tags** zum Sortieren; `list_assets` filtert (`folder`, `tag`, `q`, `sort`) und liefert die vier Arbeitsflächen: `alt=missing` (Ohne Alt-Text), `tag=none` (Ohne Tags), `minBytes` (Große Dateien), `sort=replacedAt` (Zuletzt ersetzt).
- **`update_asset`** ändert Alt-Text, Dekorativ-Flag, Ordner und Tags; `tags` ersetzt die ganze Liste.
- **`replace_asset`** tauscht die Datei unter gleicher ID/URL (Verwendungen bleiben gültig, alte Datei wandert in die Replace-Historie, Metadaten bleiben).
- **`delete_asset`** legt ins Papierkorb (reversibel), **`restore_asset`** holt zurück. Endgültiges Löschen (Purge) läuft über das Programm, nicht über den Agenten.
- Ein getrashtes oder fehlendes Asset markiert jede `assetRef` als **broken** — Submit/Publish blocken dann (Hard-Check).

## Lizenzen und Marken

- Nur Quellen mit klarer Lizenz verwenden; Quelle und Lizenz im Projekt notieren.
- **Keine fremden Logos**, keine Marken-Assets von Referenzseiten, keine erkennbaren Personen ohne Freigabe.
- **Inspiration, kein Klon:** Stil übernehmen ist erlaubt, Assets/Layouts 1:1 kopieren nicht.
- Stock-Klischees vermeiden (Handschlag, Laptop im Café, lachende Runde mit Tablet); lieber konkrete, glaubwürdige Motive.

## Icons

- Open-Source-Sets (z. B. Lucide, Feather, Simple Icons), ein Set pro Site, gleiche Strichstärke.
- Icons sind meist dekorativ: `alt=""` — nur inhaltstragende Icons bekommen Alt-Text.

## Alt-Text-Pflicht

- Jedes inhaltstragende Bild braucht einen Alt-Text: kurz, konkret, ohne „Bild von …".
- Rein dekorative Bilder bewusst als dekorativ markieren (leerer Alt-Text) — nie vergessen, nie blind leer lassen.
- Sprache wie im Seiteninhalt, keine Keyword-Stapel.
