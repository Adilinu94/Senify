# Site-Profile & Intensitätsstufen

Type: grilling
Status: resolved

Input: artifacts/03-motion-3d.md
Input: artifacts/08-section-library.md
Input: artifacts/11-agent-experience.md
Input: research/22-framer-analyse.md

## Question

Wie steuern wir den Aufwand pro Site: Welche Profile gibt es (z. B. `clean` · `standard` · `showcase`), was ist pro Profil Default und erlaubt (Lenis an/aus, Baseline vs. Pin-/Scrub-Presets, 3D erlaubt?), wo lebt die Einstellung (Site-Feld `profile`?) — und welche Leitplanken gelten für Agenten („schlicht ist der Normalfall; Extravaganz nur auf Wunsch")?

Ergebnis: Profil-Definition + Defaults, die Tickets 08 (Sektionen ohne Motion vollwertig), 11 (Agent-Standards) und 12 (Portal-Doku) speist.

## Answer

Site-Profile entschieden (6/6 Wizard). Artefakt: [artifacts/21-profile.md](../artifacts/21-profile.md).

- **Drei Profile:** `clean` (statisch: Intensity ≤ 3, kein Lenis/Pin/3D) · `standard` (Default: dezent + Lenis, Pin ×1, Intensity ≤ 7) · `showcase` (volle Choreografie + 3D, Intensity ≤ 10).
- **Harte Grenzen:** Presets über Profil-Cap = Guardrail-Fehler mit Vorschlag; Hard-Guardrails (03) bleiben absolut.
- **Site-Feld `profile`** (Mutation `update_site_profile`); **Profil-Wechsel validiert vorher** — nichts ändert sich still.
- **Agenten wählen frei** (Nutzer-Entscheidung); Skill-Guidance nicht-blockierend (Eskalation begründen, De-Eskalation jederzeit erlaubt).
- **Datenmodell:** `Site.profile` ergänzt (Artefakt 01 aktualisiert).
