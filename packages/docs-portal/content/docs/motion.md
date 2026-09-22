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

## Page Transitions

`page-fade` ist ein **Seiten-Preset**: Die Spec liegt wie jede andere an einem Knoten
(typisch am Seiten-Root oder am Layout), wirkt aber auf die ganze Seite. Der Bake schreibt
`@view-transition { navigation: auto; }` samt Dauer (0,3–0,5 s nach Intensity) und
Reduced-Motion-Gate einmal in den Head — kein Seiten-Skript, kein Eintrag pro Knoten.
Beide Seiten müssen das Opt-in tragen, sonst läuft beim Wechsel keine Transition: das
Preset gehört auf jede Seite oder in das Layout, das sie umschließt. `static` (Default)
schaltet bei `prefers-reduced-motion` ab, `fade` kürzt den Cross-Fade, `off` spielt voll;
ohne View-Transition-Support (Firefox) degradiert es still zum normalen Seitenwechsel. Pro
Seite zählt der erste Knoten, ein zweiter erzeugt den Review-Hinweis `document-excess`.

## Hover, Ambient, Preloader, Modal

- `hover-lift`, `ambient-float`, `grain` sind **CSS-Effekte**: Der Bake schreibt ihren
  Block einmal pro Seite, das Preset muss also nur an einem Knoten stehen (die erste
  Intensity gewinnt). `hover-lift` hebt beim Hover (Gate für Touch und Reduced
  Motion), `ambient-float` läuft als Endlos-Loop (10–19 s, unter Reduced Motion aus),
  `grain` legt eine animierte Körnung über den Knoten.
- `magnetic-button`, `tilt-card`, `cursor-glow` brauchen einen Zeiger und laufen nur
  auf Geräten mit `(hover: hover)`; unter `prefers-reduced-motion` sind sie aus, nur
  die bewusste Policy `off` erzwingt sie.
- `preloader-light` ist der Lade-Vorhang der Seite (≤ 2,5 s, unter Reduced Motion
  sofort weg, ohne JS per `noscript` versteckt) — er gehört an den Seiten-Root oder
  die erste Sektion.
- `modal` macht die Medien im Knoten (Bild, Video, Iframe) als Dialog aufklappbar
  (Lightbox) — passend für Gallery, Media und Embed.
- Alle vier sind pro Seite einmal wirksam: ein zweites Vorkommen erzeugt keinen
  Fehler, aber auch keinen zweiten Effekt.

## 3D-Szene

`webgl-scene` hängt an der Fläche, nicht am Preset: die Media-Variante `3d-scene`
oder die Hero-Variante `showcase-3d` (ohne gefüllten Visual-Slot) rendert das Canvas.
Die Spec am selben Knoten stimmt Intensity und Schalter ab; ohne Spec läuft die
Fläche mit Intensity 5, mit `enabled: false` bleibt das Poster und es wird kein
three.js geladen. Eine Spec ohne Fläche ist wirkungslos (Bake-Hinweis
`scene-without-surface`).

- **Lazy und self-hosted:** Der Bake schreibt `assets/vendor/three.module.min.js`
  (gebündelt aus der installierten three-Version, keine CDN-Anfrage) nur für Seiten
  mit 3D-Fläche; das Island lädt sie erst beim Heranscrollen.
- **Poster als Baseline:** Ohne JS, ohne WebGL oder unter `prefers-reduced-motion`
  steht ein statisches CSS-Poster; unter Reduced Motion rendert das Island genau
  ein Bild, ohne Loop und Zeiger.
- **Varianten (`props.scene`):** `orb` (Default) und `wave`; Farben aus dem Theme.
- **Profil:** nur `showcase`, maximal eine Szene pro Seite.

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

- **Hart:** max 1 Pin-Preset pro Seite, max 2 Parallax-Layer pro Viewport, max 1
  3D-Szene pro Seite (nur `showcase`), Reduced-Motion-Variante vorhanden, kein
  Above-fold-`opacity: 0` ohne Fallback (der Pending-Guard aus noscript +
  1,6-s-Failsafe deckt Hiding-Presets ab).
- **Weich (Review-Hinweise):** Reveals < 800 ms, ein Char-Split pro Seite, Preloader ≤ 2,5 s.

## Workflow

1. **Baseline zuerst:** Jede Sektion muss ohne Motion vollwertig aussehen — Motion ist
   Eskalation, nie Reparatur.
2. **Ein Akzent pro Sektion**, nicht alles gleichzeitig.
3. **Intensity am Profil messen:** `clean` bleibt ≤ 3, `standard` ≤ 7.
4. **Prüfen:** `create_preview` öffnen und die echte Scroll-Strecke ansehen; das
   Paritäts-/Freeze-Verfahren vergleicht den Baseline-Zustand, die Animation separat.
