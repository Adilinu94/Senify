# Bildgenerierung: Provider-Kette — image-use (Default) mit Qwen-Fallback

Status: accepted · 21.09.2026
Bezug: Verbesserungsplan §8.4 („Eigene generative KI: bewusst nicht") und §13/I10 („Bildrezept → Asset"),
ADR-0001 (JSON-first), ADR-0004 (Postgres-only).

Der Verbesserungsplan hielt als Nicht-Ziel fest, dass Senify keine eigene generative KI betreibt:
Bildmotive entstehen über BYOK-Agenten (der Agent bringt sein Bildwerkzeug mit) und landen per
`upload_asset` in der Bibliothek. Inzwischen sind zwei Wege vermessen: **image-use** über die
ChatGPT-Subscription (Web-Backend, ≈ 1 min/Bild, hochwertig, aber Kontingent-begrenzt) und
**Qwen-Image-2.1** lokal über ComfyUI (Minuten, unzensiert, offline-fest). Der BYOK-Weg bleibt
möglich, ist aber nicht mehr die einzige Tür.

**Entscheidung:** Die **Engine** bekommt Bildgenerierung als dünnes Provider-Interface mit einer
**Kette**: Default ist **`image-use`** (Subscription-CLI, schnell, hohe Qualität); bei aufgebrauchtem
Kontingent oder nicht verfügbarem Provider fällt der Job **automatisch auf ComfyUI + Qwen-Image-2.1**
zurück (lokal, unzensiert). Ein Provider-Wechsel zählt nicht als Fehlversuch; nach einem
Quota-Fehler pausiert image-use für `cooldownMinutes` (Default 60). Generierungen laufen als
**durable Jobs** nach dem Muster `bake-worker` (Lease, Attempts, Loop) — die Subscriptions-Seite
braucht ≈ 1 min, der lokale Fallback 9–45 min, synchrone Aufrufe scheiden aus. Agenten stoßen über
zwei neue MCP-Tools an (`generate_image` → `get_image_job`); der Editor nutzt später dieselben
HTTP-Routen. Ergebnisse gehen durch die **bestehende Media-Pipeline** (Dedupe, Variants,
Alt-Text-Pflicht) — kein Sonderweg. Das Agentenwissen steht im Skill-Pack (`images.md`).

**Betrachtete Optionen:**
- *Status quo: nur BYOK-Agenten* — verworfen: kein Editor-Weg, kein geteiltes Agentenwissen, Prompt
  und Ergebnis nicht revisionssicher, jeder Agent braucht sein eigenes Bildwerkzeug.
- *ComfyUI als Default, image-use nur opt-in* — verworfen: Der lokale Lauf kostet Minuten und
  blockiert die GPU; der schnelle, hochwertige Subscription-Weg ist der bessere Default. Qwen ist
  als Puffer da, nicht als erste Wahl.
- *Nur image-use ohne Fallback* — verworfen: Das Kontingent endet (Tageslimit/Rate-Limit), dann
  stünde die Arbeit still. Qwen lokal ist der Puffer, der immer da ist.
- *Synchrone Generierung (HTTP-/Tool-Call wartet)* — verworfen: Timeouts in MCP-Clients und Editor,
  kein Retry nach Neustart, blockierte Oberfläche.
- *Generierung im MCP-Prozess* — verworfen: der Editor könnte sie nicht nutzen; MCP bleibt dünner
  Transport über die Engine-API.
- *Fester Aufruf ohne Interface* — verworfen: das dünne Interface trägt beide Provider und hält
  spätere Backends (anderes Modell, Cloud) offen, ohne jetzt zu überbauen.

**Konsequenzen:**
- Neue Settings-Gruppe `image` mit `provider` (Default `image-use`), `fallbackProvider`
  (Default `comfyui`), `cooldownMinutes`, `cliPath` und der ComfyUI-Konfiguration — Konfiguration im
  Programm, nicht per Umgebungsvariable.
- Neue Engine-Routen + Job-Tabelle in Postgres (`provider_used`, Versuchshistorie; Lease/Attempts
  wie Bake-Jobs, neustart-sicher).
- Neue MCP-Tools erscheinen automatisch im generierten Tool-Katalog (`tools.md`) und in der
  Doku-Portal-Referenz; das Skill-Pack bekommt `images.md`, `assets.md` und `router.md` verweisen darauf.
- Der Referenz-Bild-Prompt (`get_reference_brief.imagePrompt`) wird zum Prompt-Lieferanten — der
  geplante Punkt I10 („Bildrezept → Asset") ist damit erledigt.
- **Betriebsabhängigkeiten:** image-use braucht laufendes Chrome mit Relay und eingeloggtes
  chatgpt.com (kein Tab nötig); ComfyUI bleibt außerhalb von Senify (eigener Prozess). Senify startet
  oder verwaltet beide nicht, es prüft nur die Erreichbarkeit.
- **ToS:** image-use ist nur für den lokalen Operator-Einsatz gedacht, **nie** als Endnutzer-Service.
- **Offen (Lizenz):** Qwen-Image-2.1 steht unter der *Qwen Research License*. Kommerzielle Nutzung
  für Kundenarbeiten ist vor Produktivbetrieb zu prüfen; bis dahin interne Nutzung.

**Referenz:** `packages/engine/src/references-brief.ts` (`buildImagePrompt`),
`packages/engine/src/media.ts` (`createUploadTicket`/`commitUpload`), `packages/engine/src/bake-worker.ts`
(Job-Muster, Start in `packages/app/src/start.ts`), `packages/mcp/src/tools.ts`,
`packages/skills/skills/assets.md`, `.scratch/bildgenerierung/spec.md`.

---

## Nachtrag 22.09.2026: Custom-Endpoint als dritter Weg

Der Operator kann einen beliebigen HTTP-Bildendpunkt selbst konfigurieren (Base-URL, Modell,
API-Key, Wire-Format `minimax` oder `openai`) - der dritte Weg neben Subscription und lokalem
Modell. Der API-Key wird verschluesselt gespeichert (wie das SMTP-Passwort) und nie ausgeliefert.
Die Kette ist frei konfigurierbar (`provider` + `fallbackProvider`); **jede Kette, die einen
Fallback aktiviert, endet zusaetzlich immer bei ComfyUI** (lokal, kostenlos, offline-fest), sodass
die vom Nutzer gewuenschte Reihenfolge `custom → image-use → comfyui` ohne dritte Einstellung
funktioniert. Getestet mit MiniMax (`image-01`); Details und Evidence in
`.scratch/bildgenerierung/issues/07-custom-provider.md`.
