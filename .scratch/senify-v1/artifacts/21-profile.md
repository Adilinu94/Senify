# Artefakt 21: Site-Profile & Intensitätsstufen (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Site-Profile & Intensitätsstufen".
> Grundlagen: `artifacts/03` (Intensity-Dial, Guardrails, Preset-Katalog), `08` (25 Sektionen), `11` (Skill/Master-Flow), `research/22` (Framer-SmoothScroll-Intensity), Nutzer-Steering („schlicht-modern ist vollwertig").

## Entscheidungen (Wizard, 6/6)

1. **Drei Profile:** `clean` · `standard` · `showcase`.
2. **Default:** `standard`.
3. **Defaults + harte Grenzen** (Guardrail-Fehler mit Vorschlag).
4. **Site-Feld `profile`** (per Mutation/Editor änderbar).
5. **Agenten wählen frei** (Skill-Guidance als Empfehlung, nicht Pflicht).
6. **Profil-Wechsel bricht nicht still** (Verstöße validieren vor dem Wechsel).

## Die Profile

| | `clean` | `standard` (Default) | `showcase` |
|---|---|---|---|
| Charakter | schlicht-modern, statisch | Framer-Basis-Niveau, dezent | Statement: volle Choreografie |
| Intensity-Cap | ≤ 3 | ≤ 7 | ≤ 10 |
| Lenis | aus | an | an |
| Pin-Presets | nicht erlaubt | max 1 | max 1 |
| 3D (`webgl-scene`) | nein | nein | ja (max 1 Canvas, 03) |
| Erlaubte Presets | A (Entry) · B-Reveals/Progress · D-Hover · E-State · F-Ambient | + B-Scrub/Sticky/Pan · C-Text | alle (A–G) |
| Erwartung | Lighthouse 95+ | 85–95 | 80–90 |
| Typisch für | konservative/performance-kritische Kunden | Alltag (Marketing/Kunden-Sites) | Portfolio/Awards/Launch |

- Die **Hard-Guardrails aus Artefakt 03 bleiben absolut** (Pin ×1, Parallax ×2, keine Scroll-Listener, RM-Pflicht) — Profile sind zusätzliche, engere Grenzen.

## Durchsetzung & Wechsel

- `Site.profile` (Mutation `update_site_profile`); der Validator prüft Presets gegen das Profil → **Guardrail-Fehler mit Vorschlag** („Site auf showcase heben oder Preset senken"; Format aus Artefakt 10).
- **Profil-Wechsel:** validiert zuerst und listet Verstöße (betroffene Nodes); Wechsel erst nach Bereinigung — nichts ändert sich still.

## Agenten-Verhalten

- Agenten dürfen das Profil **frei wählen und wechseln** (Nutzer-Entscheidung). Das Skillpaket (11) empfiehlt **nicht-blockierend**: Eskalation begründen, De-Eskalation jederzeit erlaubt, Default `standard`.
- Der Master-Flow liest das Profil und richtet Sektions-/Preset-Vorschläge daran aus.

## Datenmodell-Erweiterung

- `Site.profile: "clean" | "standard" | "showcase"` (Artefakt 01 ergänzt).

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Dial-/Guardrail-Mechanik | 03 |
| Sektionen müssen in `clean` vollwertig aussehen | 08 |
| Skill-Guidance + Master-Flow | 11 |
| Portal-Doku „Profile" | 12 |
