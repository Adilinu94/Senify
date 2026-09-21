# Bilder erzeugen (Engine)

## Wann generieren

- Bedarf aus Brief und Referenz ableiten (Hero, Cover, Stimmungsbilder, Illustrationen) — eigene,
  konkrete Motive statt Stock-Klischees; die Regeln aus `assets.md` (Lizenz, Marken, Alt-Text)
  gelten weiter.
- Nur fehlende Motive generieren: keine Varianten-Schleifen, jeder Lauf kostet Zeit und Kontingent.

## Ablauf

1. Prompt festlegen: `get_reference_brief` liefert `imagePrompt` (Bildrezept der Referenz) — oder
   eigenes Motiv nach dem Rezept unten formulieren.
2. `generate_image` mit `siteId`, `prompt` (oder `referenceId`), Größe, `altText` (Pflicht bei
   inhaltstragenden Bildern) sowie `tags`, `folderId`, `decorative`.
3. Job pollen: `get_image_job` mit der `jobId` — frühestens alle 60 s, nicht in einer Schleife
   spammen. `list_image_jobs` zeigt alle Jobs der Site.
4. Nach `succeeded`: `assetId` aus dem Job als `assetRef { assetId }` in die Sektion einsetzen
   (Fokuspunkt setzen, wenn das Motiv sonst beschnitten wird).

## Provider und Zeiten

Die Engine wählt den Provider automatisch (Kette); der Agent muss nur den Job-Status lesen:

| Provider | Wann | Dauer |
|---|---|---|
| `image-use` (ChatGPT-Abo, Default) | Standard | ≈ 1 min |
| `comfyui` / Qwen (lokal, Fallback) | Kontingent/Rate-Limit, Relay/Chrome aus, image-use nicht verfügbar | Minuten statt Sekunden: 512² ≈ 2–9 min (kalt ≈ 9 min, warm ≈ 2 min), 1024² ≈ 25–45 min; 2K ist auf dieser Maschine ungeeignet |

- `providerUsed` im Job-Status lesen, nicht raten. Läuft der Job lange, ist der lokale Fallback
  aktiv — weiterarbeiten, nicht abbrechen.
- Beide Provider nicht verfügbar: Operator informieren (Chrome/Relay bzw. ComfyUI starten;
  Einstellungen `image` prüfen).

## Prompt-Rezept

- Natürliche Sprache, 1–3 Sätze: Subjekt + Setting + Licht + Material + Perspektive. Keine
  Keyword-Stapel.
- Text im Bild wörtlich in Anführungszeichen nennen.
- Transparenz explizit anfordern („freigestellt auf transparentem Hintergrund").
- Größen: Vielfache von 32; im Zweifel klein testen (512²), dann größer.

## Fehlerfälle

- `failed`: `error` im Job lesen (Kategorie, Meldung, Vorschlag) — der Vorschlag ist die
  Handlungsanweisung.
- Speicherfehler/OOM: kleinere Auflösung wählen.
- `provider off`: Bildgenerierung ist in den Einstellungen deaktiviert — Operator informieren.
- `invalid_input` (z. B. Größe kein Vielfaches von 32): Auftrag korrigieren und neu senden; ein
  ungültiger Auftrag wird nie an einen zweiten Provider gegeben.

## Grenzen

- Keine fremden Logos, keine erkennbaren Personen ohne Freigabe; keine Marken-Assets von
  Referenzseiten (siehe `assets.md`).
- Lizenz: Der lokale Qwen-Fallback steht unter der Qwen Research License — die kommerzielle
  Nutzung ist noch nicht geprüft. Generierte Bilder bleiben lokal; image-use läuft über das
  persönliche ChatGPT-Abo (nur Operator-Nutzung, kein Endnutzer-Service).
