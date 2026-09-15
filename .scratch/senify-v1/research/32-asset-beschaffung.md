# Research 32: Asset-Beschaffung (Bilder, Icons, Fonts) & image-use

> Erstellt am 15.09.2026 · Anlass: Nutzerfrage „Wie bekommen wir passende Grafiken wie Bilder, Icons, Schriftarten? Brauchen wir eine ChatGPT-Imagegen-Verknüpfung? Ich habe keine Subscription. Können wir `github.com/leeguooooo/image-use` einbauen?"
> Verwandt: `artifacts/15` (Media-Pipeline), `artifacts/25` (Media-Erweiterung), `artifacts/07` (Fonts kuratiert), `artifacts/11` (Agent-Experience), `research/29` (Asset-Guardrails), `research/31` (Framer-Import bringt Assets mit).

## 1. Die Antwort in einem Satz

Senify braucht **kein Plattform-Imagegen** (bewusst v1-Out-of-Scope) — der **Agent** beschafft Assets mit lokalen Werkzeugen und lädt sie über `upload_asset` in die Mediathek. **`image-use` ist das empfohlene Generierungs-Werkzeug**: MIT, läuft lokal, nutzt eine ChatGPT-/Gemini-Anmeldung **inklusive Free-Tier** (kein API-Key, keine bezahlte Subscription).

## 2. `image-use` (leeguooooo) — Analyse

**Was es ist:** Zero-dependency Python-CLI (3.10+) **und AI-Agent-Skill** (`npx skills add leeguooooo/image-use -g`). Generiert Bilder über die **Subscription des Nutzers** statt über API-Billing.

**Backends:**
- `web` (Default): treibt ein eingeloggtes Chrome auf chatgpt.com — funktioniert **auch mit Free-ChatGPT-Account**; verbraucht keine Codex-Quota.
- `codex`: headless Fallback (Codex CLI-Image-Tool).
- `gemini` / `agy`: Gemini-Subscription (in `gemini.google.com` eingeloggtes Chrome bzw. Antigravity CLI); separate Quotas. Achtung: Gemini-Text-to-Image trägt ein sichtbares Wasserzeichen (Bild-zu-Bild nicht).

**Können (relevant für uns):**
- Referenzbilder (`-i photo.jpg`), **Composition-Ref** („borrow the framing, not the face") — deckt sich exakt mit unseren Schutzregeln („Inspiration, kein Klon").
- Styles + Community-Gallery; Größen; `--background transparent`; Qualität/Model-Knobs (codex-only).
- `animate`: Sprite-Sheet → animiertes WebP/GIF (für Deko-Loops; braucht ImageMagick/WebP-Tools).

**Grenzen & Risiken:**
- Nutzt **inoffizielle ChatGPT-Endpoints** (Codex-Endpoint, nicht öffentliche API) → kann jederzeit brechen; ToU-Grauzone; README sagt explizit: **nicht** für einen öffentlich erreichbaren Generierungsdienst nutzen. → Als **lokales Einzel-/Agenten-Werkzeug** ok; **nicht als Plattform-Feature fest verdrahten**.
- Qualität/Stil: gut für Deko (Hero-Hintergründe, abstrakte Muster, Platzhalter); **keine Marken, keine realen Personen, keine Produkte 1:1** (unsere Guardrails).
- Abhängigkeit Chrome-Login (web/gemini) — einmalige Einrichtung durch den Nutzer (`image-use doctor` prüft).

## 3. Asset-Strategie für Senify-Sites (alle Kategorien)

| Kategorie | Primär | Sekundär | Guardrails |
|---|---|---|---|
| **Deko-Bilder** (Hintergründe, Texturen, abstrakte Visuals) | `image-use` generieren (Free-Tier) | Lizenzfreie Stock-APIs (Unsplash/Pexels) | Keine Marken/Personen/Produkte 1:1; Alt-Pflicht (Hard-Check 13) |
| **Inhalts-Bilder** (Team, Produkte, Orte) | Echte Fotos des Kunden (Upload; Import bringt sie mit) | Platzhalter bis echte vorliegen | Kennzeichnung als Platzhalter im Import-/Review-Bericht |
| **Icons** | Open-Source-Sets (Lucide, Phosphor, Heroicons — MIT/ISC; SVG inline) | `image-use` nur für Sonderfälle | SVG-Assets in der Mediathek; kein Icon-Font |
| **Fonts** | Kuratiertes Set, self-hosted (07) | Google Fonts (Open) | Lizenz-Check (29): kommerzielle Fonts → metrik-kompatible Open-Paare |
| **OG-/Favicon** | Aus Logo/Theme ableiten (Pipeline 15) | `image-use` mit Composition-Ref | Marken-Assets nur vom Kunden |
| **Deko-Motion** | Lottie/Rive/animiertes WebP als Medien-Asset (15) | `image-use animate` (Sprung-Sheet → Loop) | Reduced-Motion-Variante (03) |

**Fluss (v1):** Agent generiert/sammelt lokal → `upload_asset` (MCP, `write`) → Mediathek → `assetRef` in Sektionen. Die Engine bleibt unberührt; kein neues Plattform-Feature.

## 4. Einbau-Ebenen

1. **v1 — Agenten-Skill + Doku (empfohlen, jetzt):** `image-use` wird **empfohlenes Werkzeug** im Senify-Skillpaket (`artifacts/11`): neue Referenz `assets.md` (Beschaffungs-Workflow: wann generieren/wann echt/wann Stock; Kommandos; `upload_asset`; Guardrails). Doku im Portal (`artifacts/12`). Null Plattform-Code.
2. **v2 — optionaler Bibliothek-Hook:** „Generieren"-Aktion in der Medien-Bibliothek, die **konfigurierbare lokale Generatoren** aufruft (Adapter-Muster wie Deploy: `generate(prompt, refs) → Datei`); `image-use` wäre eine mögliche Implementierung, nicht die einzige. Bewusst generisch (ToU-Risiko bleibt beim Nutzer, austauschbar).
3. **Nicht:** image-use in die Engine einbacken oder als SaaS-Feature (ToU/Disclaimer + v1-Scope).

## 5. Konsequenzen für laufende Dokumente

| Ort | Ergänzung |
|---|---|
| `spec.md` Further Notes | Asset-Beschaffungs-Absatz + Verweis hierauf |
| `artifacts/11` (Agent-Experience) | Nachtrag: `assets.md`, image-use-Empfehlung, v2-Hook |
| Ticket 06 (MCP-Kern & Agent-Setup) | Acceptance: Skill-Referenz `assets.md` |
| Map | v2-Fog: „Mediathek-Generator-Hook" als Kandidat (im Nachtrag notiert) |

## 6. Quellen

- Repo: `github.com/leeguooooo/image-use` (MIT; v0.28.0, Sep 2026; vormals `chatgpt-imagegen`; 362 ★) — README, SKILL.md, Docs (drawstyle.leeguoo.com)
- Eigene Bestände: `artifacts/07`, `15`, `25`, `11`, `research/29`
