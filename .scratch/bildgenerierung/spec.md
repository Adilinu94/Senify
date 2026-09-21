# Spec: Bildgenerierung — image-use (Default) mit Qwen-Fallback

> Status: `ready-for-agent` · Datum: 21.09.2026
> Quelle: Analyse vom 21.09.2026, ADR-0008, Verbesserungsplan I10 („Bildrezept → Asset").
> Provider: **image-use** (ChatGPT-Subscription, Web-Backend, ≈ 1 min/Bild) ist Default;
> **ComfyUI + Qwen-Image-2.1** ist der automatische Fallback bei aufgebrauchtem Kontingent/Fehlern.
> Maschinenbasis (verifiziert 21.09.2026): image-use 0.29.1 + chrome-use 1.5.131 (Relay up, Profil
> `adriannick37@gmail.com`, Testlauf 69 s / 1254×1254); ComfyUI v0.37.0 + ComfyUI-GGUF (`f912d5e`)
> auf `127.0.0.1:8188`, Qwen-Image-2.1 Q4_K_M (4,60 GB), Qwen3-VL-8B int8 (9,35 GB), VAE bf16
> (0,68 GB); RTX 2070 8 GB, 32 GB RAM. Messung: 512×512/40 Steps = 517 s end-to-end.

## Problem Statement

- **Agenten können Bilder beschaffen, aber nicht erzeugen.** `assets.md` verweist auf das
  agenteneigene Werkzeug `image-use`; das ist pro Agent verschieden, nicht reproduzierbar und für
  den Editor nicht nutzbar.
- **Der Editor hat keinen Erzeugungs-Weg.** Das Medien-Fenster (Spotlight `open-media`) ist geplant,
  aber ohne Generierung.
- **Das Bildrezept liegt brach.** `get_reference_brief` liefert bereits `imagePrompt`
  (`buildImagePrompt`), aber niemand kann ihn direkt ausführen (I10 im Verbesserungsplan).
- **Der Plan widerspricht dem Ziel:** §8.4 sagt „Eigene generative KI: bewusst nicht" — mit
  ADR-0008 ist diese Haltung geändert (lokal + Subscription; BYOK bleibt daneben möglich).
- **Beide Wege sind vermessen:** image-use über die ChatGPT-Subscription (69 s/Bild, hochwertig,
  Kontingent-begrenzt) und Qwen lokal über ComfyUI (Minuten, unzensiert, offline-fest). Die
  Media-Pipeline (Signed Upload, Dedupe, Variants, Alt-Text-Pflicht) nimmt fertige Bytes ohne
  Sonderweg auf.

## Solution

Die Engine bekommt Bildgenerierung als **Provider-Kette** hinter einem dünnen Interface:
**image-use** (Default) → bei aufgebrauchtem Kontingent/nicht verfügbarem Provider automatisch
**ComfyUI + Qwen-Image-2.1** (Fallback). Dazu eine Settings-Gruppe `image`, durable Jobs
(`image_jobs`, Muster `bake-worker`) und HTTP-Routen. MCP bekommt `generate_image` +
`get_image_job`; das Skill-Pack bekommt `images.md`. Der Editor bekommt später im Medien-Fenster
einen Erzeugen-Bereich. Generiertes landet als normales Asset in der Bibliothek.

Ablauf: `generate_image` (Prompt oder `referenceId`) → Job `queued` → Worker generiert über
image-use → bei Quota-/Verfügbarkeits-/Refusal-Fehler automatisch über ComfyUI → `commitUpload` →
Job `succeeded` + `assetId` (`providerUsed` am Job) → Agent setzt `assetRef` ein.

## User Stories

### Agent

1. Als Agent möchte ich ein Bild für ein Projekt erzeugen (`generate_image` mit Prompt), damit ich
   eigene Motive statt Stock einsetzen kann.
2. Als Agent möchte ich statt eines eigenen Prompts eine Referenz angeben (`referenceId`), damit der
   Bild-Prompt aus `get_reference_brief.imagePrompt` verwendet wird und das Motiv im Projektstil entsteht.
3. Als Agent möchte ich Alt-Text, Dekorativ-Flag, Tags und Ordner direkt bei der Generierung
   mitgeben, damit die Alt-Text-Pflicht und die Bibliotheksordnung ohne Nacharbeit erfüllt sind.
4. Als Agent möchte ich den Job-Status abfragen (`get_image_job`) und sehe dort Status, genutzten
   Provider (`providerUsed`) und Ergebnis, damit ich keine Warteschleifen drehe.
5. Als Agent möchte ich, dass bei aufgebrauchtem ChatGPT-Kontingent oder nicht verfügbarem
   image-use automatisch Qwen übernimmt, damit der Auftrag ohne manuelles Nachsteuern fertig wird.
6. Als Agent möchte ich actionable Fehler (OOM → kleinere Auflösung; beide Provider nicht
   verfügbar → Operator informieren; Timeout → Job bleibt in der Queue) und aus `images.md` reale
   Wartezeiten kennen (image-use ≈ 1 min; Qwen-Fallback 9–45 min), damit ich nicht rate.
7. Als Agent möchte ich optional laufende Jobs meines Projekts sehen (`list_image_jobs`), damit ich
   parallele Generierungen koordiniere.

### Operator

8. Als Operator möchte ich die Bildgenerierung in den Einstellungen konfigurieren (Default-Provider,
   Fallback, Adresse, Modelle, Pixel-Cap, Timeout), damit ich die Maschine kontrolliere.
9. Als Operator möchte ich Jobs mit Status, Dauer, genutztem Provider und Fehler sehen, damit ich
   Verbrauch und GPU-Einsatz überblicke.
10. Als Operator möchte ich im Medien-Fenster Bilder erzeugen (Prompt, Größe, optional Referenz),
    damit ich ohne Agent arbeiten kann.
11. Als Operator möchte ich, dass generierte Bilder wie Uploads behandelt werden (Varianten, Dedupe,
    Trash, Replace-Historie, Audit „von Agent/Operator"), damit es keinen zweiten Pfad gibt.

## Technische Verträge

### Settings-Gruppe `image`

`UpdateSettingsBodySchema` (`settings-contract.ts`) + View analog SMTP:

```ts
image: {
  provider: "image-use" | "comfyui" | "off", // Default: "image-use"
  fallbackProvider: "comfyui" | "none",      // Default: "comfyui" (greift nur, wenn provider != fallback)
  cooldownMinutes: number,                   // Default 60; Provider-Pause nach Quota-/Verfügbarkeitsfehler
  cliPath: string,                           // image-use-CLI; Default: ~/.agents/skills/image-use/image-use
  baseUrl: string,                           // ComfyUI; Default: "http://127.0.0.1:8188"
  diffusionModel: string,                    // Dateiname in diffusion_models/
  textEncoder: string,                       // Dateiname in text_encoders/
  vae: string,                               // Dateiname in vae/
  defaultSteps: number,                      // Default 40
  maxPixels: number,                         // Default 1_048_576 (1 MP); Obergrenze für width*height
  timeoutMinutes: number                     // Default 60; pro Job
}
```

Keine Secrets enthalten. `provider: "off"` bzw. kein verfügbarer Provider → Routen antworten mit
`validation`-Fehler + Hinweis auf die Einstellungen; die Tools erscheinen weiter im Katalog,
schlagen aber sauber fehl. `generate_image` kann den Provider pro Job übersteuern (`provider`-Feld);
der Fallback gilt ab dem gewählten Provider.

### Provider-Interface

`packages/engine/src/image-provider.ts` (neu):

```ts
export type ImageGenerationRequest = {
  prompt: string;
  width: number;   // Vielfache von 32
  height: number;  // Vielfache von 32
  steps: number;
  seed?: number;
};
export type ImageGenerationResult = {
  bytes: Buffer;
  mime: "image/png";
  width: number;
  height: number;
  seed: number;
};
export type ImageProvider = {
  health(): Promise<{ ok: boolean; detail?: string }>;
  generate(
    req: ImageGenerationRequest,
    opts: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<ImageGenerationResult>;
};
```

Der Worker löst zusätzlich die Provider-Kette auf und klassifiziert Fehler (siehe unten).

### Default-Provider: `image-use` (Subscription-CLI) — getestet 21.09.2026

Befund des Tests (Maschine des Operators):

- `image-use` liegt als Skill unter `~/.agents/skills/image-use/` (CLI-Datei vorhanden); am 21.09.
  auf 0.29.1 aktualisiert. **Windows-Eigenheit:** `PYTHONIOENCODING=utf-8` setzen, sonst crasht
  `doctor` in der cp1252-Konsole.
- **Codex-Backend aktuell kontoseitig blockiert** (nicht Tool-seitig): image-use liefert „no image
  returned" (Modell ruft das Tool nicht auf); die offizielle Codex-CLI meldet „Das
  Bildgenerierungs-Tool ist in dieser Sitzung nicht verfügbar"; `codex-imagegen-cli` 0.2.0 bekommt
  HTTP 403 (nativer Endpoint) bzw. HTTP 400 „Tool choice 'image_generation' not found"
  (Responses-Pfad). Codex-CLI ist eingeloggt („Logged in using ChatGPT").
- **Web-Backend eingerichtet und verifiziert (21.09.2026):** chrome-use 1.5.131
  (`~/.local/bin/chrome-use.exe`), Native-Messaging-Host registriert, Extension im Chrome-Profil
  `adriannick37@gmail.com`, Relay up. Testlauf: **69 s** für ein 1254×1254-PNG über chatgpt.com;
  Chat-Verlauf wird automatisch gelöscht; spart Codex-Kontingent. `doctor` meldet das Profil
  fälschlich als „none detected" (Offline-Cookie-Erkennung) — der Web-Lauf funktioniert trotzdem;
  als Health-Check zählt der Lauf, nicht nur `doctor`.
- **Betriebsabhängigkeit:** Der Web-Backend-Lauf braucht ein laufendes Chrome mit verbundenem Relay
  und eingeloggtes chatgpt.com — kein Tab muss offen sein (image-use öffnet/schließt ihn selbst).
  Ist Chrome zu, gilt image-use als nicht verfügbar → Fallback.
- Gemini-/agy-Backends: nicht eingerichtet.

Integration:

- `image-use-provider.ts` als CLI-Wrapper (Child-Process, Temp-Ausgabedatei, `--quiet`,
  `--backend web`, Timeout aus Settings, `PYTHONIOENCODING=utf-8`).
- Provider-Wahl: Settings `image.provider` (Default `"image-use"`), `fallbackProvider`
  (Default `"comfyui"`); pro Job übersteuerbar (`provider`-Feld).
- Fehlerklassifikation des Wrappers (Grundlage für die Kette): Kontingent/Rate-Limit,
  nicht verfügbar/nicht eingerichtet, kein Bild trotz gültigem Prompt (Refusal), Timeout/Stall,
  ungültige Eingabe.
- Stil/Charakter (später, nur dokumentiert): `--style`/`--style-online` + gepinnte Referenzen; der
  Referenz-Screenshot aus Senify geht als `--style-ref` (Stil übernehmen) bzw. `--composition-ref`
  (Bildaufbau, anderes Motiv) in den Lauf — deckt „im Stil der Referenz" und Anonymisierung ab.
- Health: `doctor` (gekapselt) als Provider-Status; „nicht eingerichtet" ist ein sauberer
  Fehlerzustand mit Hinweis, kein Crash.
- Grenzen: undokumentierte Endpoints (können brechen), Subscription-Kontingente, ToS — nur lokaler
  Operator-Einsatz, **nie** als Endnutzer-Service. `codex-imagegen-cli` wird nicht integriert
  (Alpha; Editing kann Qwen-Image-2.1 nativ).

### Fallback-Provider: ComfyUI + Qwen-Image-2.1

`packages/engine/src/image-comfy.ts` (neu): baut den API-Graph (Qwen-Image-2.1, GGUF-Loader,
CLIPLoader `qwen_image`, VAELoader, EmptyLatentImage/TextEncodeQwenImage21, KSampler
Euler/simple/CFG 1/denoise 1, VAEDecode) aus den Settings, `POST /prompt` → Poll `/history/{id}`
(Intervall 2–5 s) → `GET /view`. Der ComfyUI-Queue-Zustand wird respektiert (kein Doppel-Submit bei
laufendem eigenem Job). Vorlage sind die verifizierten API-Workflows der Installation
(07-small-512/06-low-vram); der Graph wird im Code gebaut, nicht als JSON-Asset mitgeliefert.

### Provider-Kette und Fallback

- Der Worker löst die Kette auf: Primär-Provider (`image.provider`, Default `image-use`) →
  Fallback (`image.fallbackProvider`, Default `comfyui`). Pro Versuch läuft genau ein Provider;
  der nächste greift, wenn der Fehler eine **Fallback-Kategorie** hat.
- **Fallback-Trigger** (aus der Fehlerklassifikation):
  - **Kontingent/Rate-Limit:** `HTTP 429`, „Too many requests", Tageslimit-Meldungen →
    Fallback **und** Provider-Cooldown (`cooldownMinutes`, Default 60; danach wieder primär).
  - **Nicht verfügbar/nicht eingerichtet:** Relay down, kein Login, chrome-use/CLI fehlt →
    Fallback + kurzer Cooldown.
  - **Kein Bild trotz gültigem Prompt (Refusal/Verdacht):** „no image returned" → Fallback
    (Qwen ist unzensiert; bewusst kein Cooldown).
  - **Timeout/Stall:** einmal denselben Provider wiederholen, dann Fallback.
  - **Ungültige Eingabe** (leerer Prompt, Größe > Cap): kein Fallback — Job schlägt fehl.
- Job-Felder: `provider` (gewünscht) und `provider_used` (tatsächlich); der Versuchsverlauf steht
  strukturiert im `error`-Feld (ein Eintrag je Provider-Versuch).
- Erwartung an den Agenten: Ein Fallback-Lauf dauert Minuten statt ≈ 1 min — `images.md` nennt die
  Zeiten; `get_image_job` zeigt `providerUsed`, sobald der Lauf startet.

### Job-Modell

- Tabelle `image_jobs` (Postgres, ADR-0004): `id`, `site_id`, `status`
  (`queued|running|succeeded|failed|canceled`), `request` (jsonb: prompt, width, height, steps, seed,
  altText, decorative, folderId, tags, filename, provider?), `provider_used`, `attempts`,
  `lease_until`, `provider_job_id`, `asset_id`, `error` (jsonb, Versuchshistorie), `created_at`,
  `started_at`, `finished_at`.
- Worker `packages/engine/src/image-worker.ts`: `runImageJobOnce` + `startImageWorker` exakt nach
  `bake-worker.ts` (Claim mit Lease, Attempts mit Backoff, max. 2 Wiederholungen je Provider),
  gestartet in `packages/app/src/start.ts` neben dem Bake-Worker. Die Fallback-Kette läuft innerhalb
  desselben Jobs; ein Provider-Wechsel zählt nicht als Fehlversuch.
- Neustart-sicher: abgelaufene Lease → Job zurück auf `queued`; `provider_job_id` erlaubt Resume
  statt Doppel-Submit.
- Erfolg: `createUploadTicket` + `commitUpload` (`media.ts`) mit den Metadaten aus `request` →
  `asset_id` am Job. Fehler: `failed` + strukturierter `error` (category/message/suggestion).

### HTTP-Routen (Engine)

| Route | Scope | Zweck |
|---|---|---|
| `POST /api/sites/:siteId/images/jobs` | write | Job anlegen → `202 { jobId, status, provider }` |
| `GET /api/sites/:siteId/images/jobs` | read | Liste (Filter `status`) |
| `GET /api/images/jobs/:jobId` | read | Status/Ergebnis inkl. `providerUsed` |
| `GET /api/images/health` | read | Zustand beider Provider + Modellnamen (Diagnose) |
| `DELETE /api/images/jobs/:jobId` | write | Cancel (nur `queued`; `running` → Best-Effort-Interrupt, S4) |

Body `POST`: `prompt?`, `referenceId?` (eines von beiden nötig), `provider?` (Override),
`width?`, `height?`, `steps?`, `seed?`, `filename?`, `altText?`, `decorative?`, `folderId?`,
`tags?`, `idempotencyKey?`. Bei `referenceId`: Prompt kommt aus `buildImagePrompt(reference)`; fehlt
ein Rezept → `validation`-Fehler mit Hinweis auf `get_reference_brief`.

### MCP-Tools

- **`generate_image`** (write): Parameter wie POST-Body (inkl. optionalem `provider`-Override).
  Antwort `{ jobId, status, provider, hint }` mit Hinweis auf `get_image_job`. Nicht idempotent per
  Default; `idempotencyKey` macht Retries sicher.
- **`get_image_job`** (read): `{ jobId }` → `{ status, providerUsed?, assetId?, error?, timestamps }`.
- **`list_image_jobs`** (read, optional): `{ siteId, status? }`.
- `server.ts`: `generate_image` nicht in `IDEMPOTENT_TOOLS`, nicht in `OPEN_WORLD_TOOLS`.

### Skill-Pack (`packages/skills/skills/`)

- **Neu `images.md`**: Wann generieren (Bedarf aus Brief/Referenz; eigene Motive statt Stock —
  `assets.md`-Regeln gelten), Ablauf (Rezept → Job → Poll → `assetRef`), Prompt-Rezept (natürliche
  Sprache; Subjekt + Setting + Licht + Material + Perspektive; Text im Bild wörtlich in
  Anführungszeichen; Transparenz explizit anfordern; keine Keyword-Stapel), Provider und Zeiten
  (**Default image-use ≈ 1 min; automatischer Qwen-Fallback bei aufgebrauchtem Kontingent
  9–45 min** — `providerUsed` im Job-Status beachten; Vielfache von 32), Polling-Etikette (≥ 60 s),
  Fehlerfälle, Alt-Text-Pflicht, Grenzen (keine fremden Logos/Personen, Lizenzhinweis).
- **`router.md`**: neue Zeile „Bilder für ein Projekt erzeugen → `images.md`, dann `generate_image`
  → `get_image_job`".
- **`assets.md`**: Punkt „Quelle wählen" ergänzt Engine-Generierung als erste Option, wenn Provider aktiv.
- `tools.md` wird generiert (`docs-portal/catalog.ts` liest `@senify/mcp/tools`) — keine Handarbeit.

## Nicht in dieser Spec

- Edit-Modus mit Referenzbildern/Masken (Qwen-Image-2.1 kann bis 10 Referenzen; späterer Slice).
- Batch/Serien (mehrere Motive aus einem Brief in einem Job).
- Weitere Provider (Cloud, andere Modelle) — das Interface lässt sie zu; gebaut werden `image-use`
  (Default) und ComfyUI (Fallback).
- Automatisches Starten/Verwalten von Chrome oder ComfyUI durch Senify.
- Video/Audio.

## Scheiben

- **S1 — Provider + Settings + Health:** `image-provider.ts`, `image-comfy.ts` (Fallback-Provider),
  Settings-Gruppe (`provider`, `fallbackProvider`, `cooldownMinutes`, ComfyUI-Konfiguration),
  `GET /api/images/health` (beide Provider), Smoke-Test synchron gegen laufendes ComfyUI
  (512², Seed fix).
  *Akzeptanz:* Health meldet für beide Provider den Zustand; Smoke-Test liefert gültiges PNG in
  erwarteter Größe.
- **S2 — Jobs + Worker + Routen + MCP:** Tabelle (`provider_used`), `image-worker.ts` (Start in
  `start.ts`), **Provider-Kette inkl. Fallback + Cooldown**, Routen, Tools, Tests (pg-mem),
  Alt-Text-Metadaten fließen ins Asset.
  *Akzeptanz:* End-to-End vom Tool bis `assetId`; simulierter Quota-Fehler des Primär-Providers →
  Job wird über den Fallback fertig, `providerUsed` = Fallback, Cooldown gesetzt; Engine-Neustart
  mitten im Job → Job wird wieder aufgenommen; kein Provider verfügbar → sauberer Fehler.
- **S3 — Skill-Pack:** `images.md`, `router.md`, `assets.md`; `senify setup` kopiert aktualisierte
  Skills; `tools.md` enthält die neuen Tools.
  *Akzeptanz:* Ein Agent kann allein mit dem Skill-Pack den Ablauf korrekt ausführen.
- **S4 — Editor (Medien-Fenster):** Erzeugen-Bereich (Prompt, Größe, Referenz-Auswahl, Alt-Text),
  Job-Karte mit Status und Provider; Cancel. Hängt am Medien-Fenster (Spotlight `open-media`,
  Handler noch offen).
  *Akzeptanz:* Bild erscheint nach Erfolg in der Bibliothek und ist einsetzbar.
- **S5 — Referenz-Integration (I10):** `referenceId`-Pfad vollständig (Brief → Prompt → Asset),
  optional Batch aus dem Redesign-Paket.
  *Akzeptanz:* `get_reference_brief` → `generate_image(referenceId)` → Asset im Projektstil;
  Verbesserungsplan I10 auf erledigt.
- **S6 — Default-Provider `image-use`:** CLI-Wrapper + Fehlerklassifikation (Quota/Verfügbarkeit/
  Refusal/Timeout) + Provider-Wahl in Settings/Job + Health über `doctor`. **Vorbedingung erfüllt**
  (21.09.2026: chrome-use 1.5.131, Relay up, Profil eingeloggt; Testlauf 69 s). Nach diesem Slice
  ist image-use der Default und ComfyUI der Fallback.
  *Akzeptanz:* `generate_image` läuft standardmäßig über image-use und liefert ein Asset; ohne Setup
  sauberer Fehler mit Setup-Hinweis; Quota-Fehler wird als Fallback-Kategorie erkannt.

## Offene Punkte

- **Lizenz:** Qwen Research License — kommerzielle Nutzung vor Produktivbetrieb prüfen (ADR-0008).
- **Cancel:** nur `queued` sauber abbrechbar; `running` erfordert ComfyUI-`/interrupt` (S4).
- **Geteilte GPU:** ComfyUI-Queue kann durch manuelle Nutzung belegt sein — `get_image_job` zeigt
  „queued" dann länger; Health/Status im Editor sichtbar machen.
- **Job-Durability:** Postgres (empfohlen) — endgültig in S2 entscheiden.
- **Quota-Erkennung:** Die Fallback-Trigger sind Heuristiken über CLI-Fehlermeldungen
  (429/„Too many requests"/Tageslimit) — bei geänderten Meldungen nachziehen; im Zweifel lieber
  Fallback.
- **Verbesserungsplan nachziehen:** §8.4-Zeile (mit ADR-0008 aktualisiert), I10-Status.

## Nachweise

- image-use-Lauf end-to-end (gemessen 69 s, 1254×1254) und Qwen-Lauf end-to-end (512×512,
  ≈ 517 s auf RTX 2070).
- Fallback-Nachweis: simulierter Quota-Fehler → Job über Qwen fertig, `providerUsed` korrekt,
  Cooldown gesetzt.
- Engine-Neustart-Test: Job überlebt (Lease) und wird ohne Doppel-Submit fortgesetzt.
- `tools.md` (generiert) enthält `generate_image`/`get_image_job`; `images.md` liegt in `~/.senify/skills`.
- Alt-Text-Hard-Check greift für generierte Assets ohne Alt-Text (wie bei Uploads).
