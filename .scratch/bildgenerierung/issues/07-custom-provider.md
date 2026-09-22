# Bildgenerierung 07 - Custom-Endpoint (dritter Weg mit API-Key)

Status: resolved (22.09.2026)
Quelle: Nutzerwunsch 22.09.2026 - "noch einen 3. Weg: eine custom Schnittstelle, wo man Provider und API Key einstellen kann".
Blocked by: 02 (Kette), 01 (Settings)

## Kontext

Neben image-use (ChatGPT-Subscription) und ComfyUI/Qwen (lokal) soll ein dritter Weg existieren:
ein beliebiger HTTP-Bildendpunkt, den der Operator mit Base-URL, Modell und API-Key selbst
konfiguriert. Getestet wurde MiniMax (`https://api.minimax.io/v1`, Modell `image-01`).
Gewuenschte Kette (Nutzer): **custom → image-use → comfyui** - faellt ein Glied aus, uebernimmt das
naechste; die lokale ComfyUI bleibt immer die letzte Reserve.

## Aufgabe

1. Provider `custom` in der Kette (`IMAGE_PROVIDERS`), Fallback-Auswahl erweitert
   (`IMAGE_FALLBACK_PROVIDERS`: comfyui | image-use | custom | none).
2. Zwei Wire-Formate, per Settings waehlbar (`customFormat`):
   - `minimax`: `POST {base}/image_generation` mit `aspect_ratio` (Groesse snappt auf das naechste
     Verhaeltnis), Antwort `data.image_urls[0]` (JPEG-URL).
   - `openai`: `POST {base}/images/generations` mit `size`, Antwort `data[0].b64_json` oder
     `data[0].url`.
3. Settings: `customBaseUrl` (Default MiniMax), `customModel` (Default `image-01`),
   `customFormat` (Default `minimax`), `customApiKey` (Klartext im PUT, verschluesselt gespeichert,
   nie in der Antwort - analog SMTP-Passwort; View zeigt `hasCustomApiKey`).
4. Fehlerklassifikation in die Kette: HTTP 401/403/402/429/5xx, MiniMax `base_resp.status_code`
   (1002/1008 Kontingent, 1004/2049 API-Key), Sensitive-Policy -> refusal, sonst generation.
5. Ergebnis geht als PNG durch die bestehende Media-Pipeline (JPEG der APIs wird mit sharp
   re-enkodiert).
6. Settings-UI im Programm (Panel "Bildgenerierung"): Provider, Fallback, Format, Base-URL,
   Modell, API-Key, "Status pruefen".

## Umsetzung (22.09.2026)

- `packages/engine/src/image-custom.ts` (neu): Provider mit beiden Formaten, Timeout/Abort,
  PNG-Re-Encoding (sharp), Fehlerklassifikation, `nearestAspectRatio`.
- `types.ts`: `IMAGE_PROVIDERS` + `custom`, `IMAGE_FALLBACK_PROVIDERS` + `image-use`/`custom`,
  `IMAGE_CUSTOM_FORMATS`, Settings-Felder inkl. `customApiKeyEncrypted`.
- `db.ts`: additive Spalten (`custom_base_url`, `custom_model`, `custom_format`,
  `custom_api_key_encrypted`) fuer Bestandsinstallationen.
- `store.ts`: Spalten, Defaults, Mapping, Insert/Update, `ImageSettingsPatch`.
- `settings-contract.ts`: Body-Schema inkl. `customApiKey` (string = neu, null = loeschen,
  weglassen = behalten).
- `settings.ts`: `imageView` (ohne Key, mit `hasCustomApiKey`), `encryptImageApiKey`,
  `resolveCustomApiKey`.
- `http.ts`: PUT-Patch verschluesselt den Key; `GET /api/settings` liefert die View;
  `GET /api/images/health` prueft den custom-Provider mit.
- `image-worker.ts`: `defaultImageProviders(settings, store?)` baut den custom-Provider (Key
  entschluesselt aus dem Engine-Secret); `providerChain` haengt comfyui als letzte Reserve an jede
  Kette, die einen Fallback aktiviert hat.
- `packages/app/public/app.js`: Panel "Bildgenerierung" (Provider/Fallback/Format/URL/Modell/Key,
  Speichern, Status pruefen).
- Tests: `packages/engine/test/image-custom.test.ts` (8 Tests: Aspect-Snap, Health ohne/mit Key,
  beide Formate inkl. PNG-Re-Encoding, 429/401, MiniMax 1002/1004/2049, fehlender Key).

## Test-Evidence

- Unit: `pnpm vitest run packages/engine/test/image-custom.test.ts` -> 8/8 gruen; die
  image-Suiten zusammen 35/35 gruen (22.09.2026).
- Live (API direkt, 22.09.2026 ~08:44): MiniMax `POST /image_generation` mit dem ersten Key
  -> HTTP 200, `data.image_urls[0]`, Bild 1024x1024 JPEG (237.407 Bytes) heruntergeladen.
  (Dieser Key wurde danach ungueltig: `base_resp 2049 invalid api key`.)
- Live (API direkt, 22.09.2026 ~13:3x, neuer Key): `image-01` -> HTTP 200, success;
  `image-01-live` -> HTTP 200, success. `GET /v1/models` listet nur die Text-Modelle
  (MiniMax-M3/M2.7/M2.5/M2.1/M2) - die Bildmodelle sind `image-01` (Default) und
  `image-01-live`.
- Live (API direkt, 22.09.2026 ~15:2x, derselbe Key): HTTP 200, aber
  `base_resp.status_code 2067` - "The Token Plan usage limit has been reached. To avoid
  interruption, please upgrade your plan or buy credits and turn on auto consumption." Der Key
  authentifiziert also weiter, das Plan-Kontingent ist aber erschoepft (vermutlich durch die
  Testlaeufe). Der Code 2067 ist jetzt als `quota` klassifiziert (Fallback + Cooldown statt
  Fehlversuch), Test in `image-custom.test.ts`.
- **Live (Engine, 22.09.2026, `.scratch/bildgenerierung/smoke-custom.mts`):**
  - Lauf 1 (alter Key, `fallbackProvider=comfyui`): custom scheiterte am ungueltigen Key
    (`base_resp 2049`) -> Fallback comfyui lieferte das Asset in 545 s (`providerUsed=comfyui`).
    Damit ist die Kette custom -> comfyui live bewiesen.
  - Lauf 2 (neuer Key, `fallbackProvider=none`, ~19 s): **`worker: status=succeeded
    provider=custom asset=IkPLoqZQcw9WHW in 19s`**; Job `5LolumzTShEiYx`, Asset
    `senify-bild-AgjDvuwR.png`, 1024x1024, 1.570.116 Bytes. Settings-PUT mit Key -> Antwort
    ohne Key (`hasCustomApiKey: true`), Health custom ok.

## Offen

- Optional: OpenAI-Format live gegen einen echten OpenAI-kompatiblen Endpunkt verifizieren.
- Optional: Doku-Portal (`packages/docs-portal/content/docs/assets.md`) nennt Bildgenerierung
  noch "kein Plattform-Feature" - beim Abschluss der Bildgenerierungs-Tickets nachziehen.
