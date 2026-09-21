# Bildgenerierung 06 — Default-Provider `image-use` (S6)

Status: ready-for-agent
Quelle: `.scratch/bildgenerierung/spec.md` (Default-Provider, S6).
Blocked by: 02

## Kontext

`image-use` (leeguooooo) erzeugt Bilder über die ChatGPT-Subscription (Web-Backend, echter Chrome
über chrome-use) — schnell (Testlauf: 69 s, 1254×1254) und ohne Codex-Kontingent. **image-use ist
der Default-Provider**; ComfyUI/Qwen ist der Fallback (Kette in Ticket 02). Vorbedingung erfüllt
(21.09.2026: chrome-use 1.5.131, Relay up, Profil `adriannick37@gmail.com` bei chatgpt.com
eingeloggt; image-use 0.29.1). Betriebsabhängigkeit: läuft nur, wenn Chrome mit Relay läuft —
sonst gilt der Provider als nicht verfügbar und der Job geht direkt auf Qwen.

## Aufgabe

1. `packages/engine/src/image-use-provider.ts`: CLI-Wrapper.
   - Aufruf: `python <cliPath> "<prompt>" -o <tmp> --size WxH --backend web --quiet`;
     `cliPath` aus Settings, Timeout aus Settings.
   - `PYTHONIOENCODING=utf-8` setzen (Windows, sonst cp1252-Crash).
   - Temp-Datei lesen, danach aufräumen; stdout ist der Pfad, stderr die Progress-Timeline.
   - **Fehlerklassifikation** (Grundlage für die Kette aus Ticket 02), in strukturierte
     Kategorien mit Suggestion mappen:
     - Kontingent/Rate-Limit: `HTTP 429`, „Too many requests", Tageslimit-Meldungen
     - Nicht verfügbar: Relay down, kein Login, chrome-use/CLI fehlt
     - Kein Bild trotz gültigem Prompt: „no image returned" (Refusal/Verdacht)
     - Timeout/Stall: „timed out", „stalled"
     - Ungültige Eingabe: leerer Prompt, Größe außerhalb der erlaubten Grenzen
2. Settings: `provider` um `"image-use"` (Default, siehe Ticket 01) + `cliPath`; Job-Override
   `provider` aus Ticket 02 nutzt diese Implementierung.
3. Health: gekapselter `doctor`-Aufruf für `GET /api/images/health`. Bekannt: Profil-Erkennung
   meldet offline fälschlich „none detected" — als Health zählt der Lauf, nicht nur `doctor`
   (im `detail` vermerken).
4. Optionale Stil-Anbindung nur dokumentieren (nicht bauen): `--style-ref`/`--composition-ref` aus
   Senify-Referenz-Screenshots; Persona als Character-Asset.
5. Tests: Wrapper mit gemocktem Prozess; Fehler-Mapping je Kategorie; `pnpm verify` grün.

## Akzeptanz

- `generate_image` läuft standardmäßig über image-use und liefert ein Asset (manuell verifiziert,
  im Ticket unter `## Comments` dokumentiert inkl. Laufzeit).
- Quota-Fehler wird als Fallback-Kategorie erkannt (Test mit gemockter CLI-Ausgabe).
- Ohne eingerichtetes Backend: sauberer Fehler mit Setup-Hinweis, kein Crash.
- ToS-Hinweis als Code-Kommentar: nur lokaler Operator-Einsatz, nie Endnutzer-Service.
- `pnpm verify` grün.

## Referenzen

- `.scratch/bildgenerierung/spec.md` (Default-Provider, Provider-Kette, S6)
- `C:\Users\adini\.agents\skills\image-use\SKILL.md` (CLI-Optionen, Fehlerfälle, Limits)
- `packages/engine/src/image-provider.ts` (aus Ticket 01)
