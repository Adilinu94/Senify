---
title: Motion
description: Sektionen animieren mit typisierten Motion-Specs — Presets, Intensity, Site-Profile und die harten Guardrails.
path: /guides/motion
group: Guides
order: 30
---

## Kein freier Motion-Code

Jede Animation ist eine **typisierte Spec am Knoten**: Preset + Intensity + Timing. Die
Preset-Liste kommt aus der Registry (`get_section` → `motionPresets`), ausgeführt wird sie
von der Seiten-Runtime (GSAP + ScrollTrigger + Lenis, self-hosted im Release). Agenten und
Menschen benutzen denselben Kanal: `set_motion` / `clear_motion` (oder `setMotion` /
`clearMotion` in `apply_mutations`).

## Die Spec

| Feld | Werte | Default |
|---|---|---|
| `preset` | ID aus der Sektion (`get_section`) | — |
| `intensity` | 1–10 | 5 |
| `trigger` | `viewport` · `load` · `scroll` · `hover` | `viewport` |
| `delay` | ms ≥ 0 | 0 |
| `tokens.ease` | Name aus `get_theme` (`motion.ease`) | Theme-Default |
| `tokens.durationScale` / `tokens.stagger` | Zahl | 1 |
| `reducedMotion` | `static` · `fade` · `off` | `static` |
| `enabled` | bool | true |

**Reduced Motion ist Pflichtfeld.** `static` (Default) heißt: Das Markup ist der
Endzustand, es wird nur nicht animiert. `fade` blendet Hiding-Presets in 0,4 s ein.
`off` ist die bewusste Ausnahme.

## Motion an Komponenten

Motion sitzt am Knoten — auch an einer Komponente. Die **Instanz** entscheidet mit ihrer
Spec und gewinnt; ohne sie gilt der Default der **Definition** (erst das Wurzel-Teil, dann
der Definitions-Knoten). Rendering und Bake übertragen die Spec auf die Wurzel-Kopie, die
Animation läuft also einmal pro Instanz; das Auflösen einer Komponente (`detach`) nimmt sie
mit. Die übrigen Teile tragen ihre eigene Motion unabhängig davon.

## Site-Profile

| Profil | Intensity | Lenis | Pins | 3D | Preset-Klassen |
|---|---|---|---|---|---|
| `clean` | ≤ 3 | aus | keine | nein | Entry, Reveals/Progress, Hover, State, Ambient |
| `standard` | ≤ 7 | an | max 1 | nein | + Scrub/Sticky/Pan + Text |
| `showcase` | ≤ 10 | an | max 1 | max 1 Canvas | alle |

Das Profil steht am Site (`get_site`). Ein Profil-Wechsel wird gegen das Dokument
validiert: Verstöße werden gelistet, der Wechsel passiert erst nach Bereinigung — nichts
ändert sich still. Verstöße blockieren das Publish hart.

## Guardrails

- **Hart:** max 1 Pin-Preset pro Seite, max 2 Parallax-Layer pro Viewport, Reduced-Motion-
  Variante vorhanden, kein Above-fold-`opacity: 0` ohne Fallback (der Pending-Guard aus
  noscript + 1,6-s-Failsafe deckt Hiding-Presets ab).
- **Weich (Review-Hinweise):** Reveals < 800 ms, ein Char-Split pro Seite, Preloader ≤ 2,5 s.

## Workflow

1. **Baseline zuerst:** Jede Sektion muss ohne Motion vollwertig aussehen — Motion ist
   Eskalation, nie Reparatur.
2. **Ein Akzent pro Sektion**, nicht alles gleichzeitig.
3. **Intensity am Profil messen:** `clean` bleibt ≤ 3, `standard` ≤ 7.
4. **Prüfen:** `create_preview` öffnen und die echte Scroll-Strecke ansehen; das
   Paritäts-/Freeze-Verfahren vergleicht den Baseline-Zustand, die Animation separat.
