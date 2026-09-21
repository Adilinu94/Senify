# Bildgenerierung 01 — Provider-Interface, Settings, Health (S1)

Status: resolved
Quelle: `.scratch/bildgenerierung/spec.md` (Scheibe S1), `docs/adr/0008-lokale-bildgenerierung.md`.
Blocked by: —

## Kontext

Die Engine bekommt Bildgenerierung als Provider-Kette: **image-use** (Subscription, Default) →
**ComfyUI + Qwen-Image-2.1** (lokal, Fallback). Dieses Ticket liefert das Interface, die
Settings-Gruppe und die Diagnose; die ComfyUI-Implementierung ist hier die konkrete Provider-Seite
(der image-use-Provider folgt in Ticket 06). Die Modelle liegen in der zentralen Ablage
(`G:\ai-studio\models`, `extra_model_paths.yaml`) und sind SHA-256-verifiziert; ein 512²-Lauf/40
Steps dauerte 517 s.

## Aufgabe

1. `packages/engine/src/image-provider.ts`: `ImageGenerationRequest`, `ImageGenerationResult`,
   Interface `ImageProvider` (`health`, `generate`) exakt gemäß Spec.
2. `packages/engine/src/image-comfy.ts`: Implementierung.
   - API-Graph im Code bauen (GGUF-Loader, CLIPLoader `qwen_image`, VAELoader,
     EmptyLatentImage/TextEncodeQwenImage21, KSampler Euler/simple/CFG 1/denoise 1, VAEDecode).
   - `POST /prompt` → Poll `/history/{id}` (2–5 s) → `GET /view` → Bytes; Timeout aus Settings.
   - Größen als Vielfache von 32; Pixel-Cap aus Settings; ComfyUI-Queue respektieren.
   - Vorlage: verifizierte API-Workflows der Installation (07-small-512/06-low-vram).
3. Settings-Gruppe `image` in `settings-contract.ts` + View in `settings.ts` (Muster SMTP):
   `provider` (`image-use`|`comfyui`|`off`, Default **`image-use`**), `fallbackProvider`
   (`comfyui`|`none`, Default **`comfyui`**), `cooldownMinutes` (Default 60), `cliPath`
   (image-use-CLI), `baseUrl`, `diffusionModel`, `textEncoder`, `vae`, `defaultSteps`, `maxPixels`,
   `timeoutMinutes`.
4. Route `GET /api/images/health` (read): Zustand **beider** Provider (ComfyUI-Erreichbarkeit +
   Modellnamen; image-use-Status wird in Ticket 06 ergänzt, hier als „nicht gebaut" markiert) —
   bei `provider: off` ein klarer Zustand, kein Fehler.
5. Tests: Graph-Aufbau (Unit, gemockter HTTP), Health-Route, Settings-Roundtrip (Defaults).

## Akzeptanz

- `GET /api/images/health` meldet bei laufendem ComfyUI `ok` + Modellnamen; bei `off`/offline
  klaren Zustand mit `detail`.
- Ein synchroner Smoke-Test (Seed fix, 512×512) liefert ein gültiges PNG erwarteter Größe — nur
  lokal ausgeführt und im Ticket unter `## Comments` dokumentiert.
- Settings-Defaults entsprechen der Spec (`provider: image-use`, `fallbackProvider: comfyui`).
- `pnpm verify` grün.

## Referenzen

- `.scratch/bildgenerierung/spec.md` (Provider-Interface, Settings, Provider-Kette, S1)
- `docs/adr/0008-lokale-bildgenerierung.md`
- `packages/engine/src/settings.ts`, `packages/engine/src/settings-contract.ts`,
  `packages/engine/src/http.ts`
- Workflow-Vorlagen: `G:\ai-studio\temp\alesha-tools\qwen-image-2.1-gguf\workflows\api\`

## Comments

**Umgesetzt (21.09.2026)** — S1 steht: Provider-Interface, ComfyUI-Provider, Settings-Gruppe, Health-Route, Tests.

Gebaut:
- `packages/engine/src/image-provider.ts`: `ImageGenerationRequest/Result`, `ImageProvider`, `ImageProviderHealth`, `ImageProviderError` (kind: `unavailable|timeout|aborted|generation|invalid_input`) plus providerneutrale Eingabe-Validierung (Vielfache von 32, Pixel-Cap, leerer Prompt).
- `packages/engine/src/image-comfy.ts`: `buildQwenGraph` (UnetLoaderGGUF, CLIPLoader `qwen_image` device cpu, VAELoader, TextEncodeQwenImage21, EmptyLatentImage, KSampler Euler/simple/CFG 1, **VAEDecodeTiled** — der verifizierte Low-VRAM-Pfad der Vorlagen statt `VAEDecode`, SaveImage) und `createComfyImageProvider` mit `POST /prompt` → `/history`-Poll (3 s) → `GET /view`, per-Request-Timeout + Job-Signal, Fehlerklassifikation.
- Settings: Tabelle `image_settings` (additiv), `ImageSettings`/`ImageProviderName`/`ImageFallbackProvider`, `getImageSettings`/`updateImageSettings`, `ImageSettingsBodySchema` + `image`-Zweig in `PUT /api/settings`; View in `GET /api/settings`. Defaults laut Spec: `provider: image-use`, `fallbackProvider: comfyui`, `cooldownMinutes: 60`, `cliPath` = Skill-Pfad (`~/.agents/skills/image-use/image-use`), `baseUrl: http://127.0.0.1:8188`, Qwen-Dateinamen, 40 Steps, 1 MP, 60 min.
- Route `GET /api/images/health` (read): beide Provider; bei `provider: off` klarer Zustand ohne Provider-Request; image-use bis S6 als `{ ok: false, built: false, detail }`.

Nachweise:
- `packages/engine/test/images.test.ts` (10 Tests): Graph-Aufbau; generate gegen ComfyUI-Stub (Submit-Body, Poll, `/view`, Bytes); Fehlerklassifikation (invalid_input ohne Provider-Request, generation, timeout, unavailable); Health (erreichbar + Modelle vorhanden, fehlendes Modell, offline); Settings-Roundtrip (Defaults + Overrides + Ablehnung eines unbekannten Providers); `off`-Zustand.
- Alle Engine-Tests: 36 Dateien, 339 Tests grün (2 skipped; TEST_DATABASE_URL nicht gesetzt → pg-mem).
- Lint der geänderten Dateien sauber.
- **Live-Smoke-Test** (ComfyUI 0.37.0 auf `127.0.0.1:8188`):
  - Health: `ok: true`, Version 0.37.0, alle drei Modell-Dateien als vorhanden erkannt.
  - 512×512/40 Steps, Seed 42: 3 s — ComfyUI-Execution-Cache (identischer Graph vom 21.09.), gültiges PNG 512×512.
  - 512×512/40 Steps, **Seed 43 (Cache-Miss): 136 s**, 425.772 Bytes, PNG-Signatur + IHDR 512×512 → `G:\ai-studio\temp\imagegen-test\s1-smoke-512-seed43.png`.
- `pnpm build`/`pnpm verify` scheitert aktuell an 3 **vorbestehenden** Typfehlern in `packages/engine/test/components.test.ts` (uncommittete Arbeit aus `.scratch/editor-v2-rebuild/`, nicht dieses Ticket). Die Datei wurde nicht angefasst; zur Laufzeit sind ihre Tests grün.

Abweichung zur Ticket-Beschreibung: `VAEDecodeTiled` statt `VAEDecode` — die verifizierten Vorlagen (07-small-512/06-low-vram) nutzen Tiled für 8 GB VRAM.
