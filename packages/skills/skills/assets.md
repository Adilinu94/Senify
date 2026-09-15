# Assets — Beschaffung, Lizenzen, Alt-Text

## Workflow

1. **Bedarf aus dem Brief ableiten:** Hero-Bild, Team-Fotos, Projekt-Cover, Logos, Icons — und wo Platzhalter reichen.
2. **Quelle wählen:**
   - generieren mit dem lokalen Agenten-Werkzeug `image-use` (Konsistenz über alle Bilder, keine Stock-Optik),
   - oder lizenzfreie Stock-Quellen (CC0/Public Domain oder gekauft).
3. **Prüfen:** Format (JPEG/WebP/AVIF, SVG für Icons), Größe (keine Riesen-Uploads), Ausschnitt/Fokus.
4. **Alt-Text formulieren**, bevor der Upload passiert (siehe unten).
5. **Hochladen:** `upload_asset` (Media-Pipeline wächst mit Ticket 08/15); bis dahin `assetRef` mit der vorgesehenen Asset-ID.
6. **Referenzieren:** `assetRef { assetId, focal? }` in der Sektion; Fokuspunkt setzen, wenn das Motiv sonst beschnitten wird.

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
