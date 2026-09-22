# Motion — Sektionen animieren (Presets statt Code)

Motion ist eine **typisierte Spec pro Knoten** — Preset + Intensity + Timing. Es gibt
keinen freien Animations-Code, weder für Menschen noch für Agenten. Die Preset-Liste
kommt aus der Registry (`get_section` → `motionPresets`), ausgeführt wird sie von der
Seiten-Runtime (GSAP + ScrollTrigger + Lenis, self-hosted im Release).

## Die Spec

| Feld | Werte | Default | Bedeutung |
|---|---|---|---|
| `preset` | ID aus `get_section.motionPresets` | — | Was passiert (z. B. `fade-up`, `masked-headline`, `scrub-pin`) |
| `intensity` | 1–10 | 5 | Wie stark (Fahrweg, Tempo, Tiefe) |
| `trigger` | `viewport` · `load` · `scroll` · `hover` | `viewport` | Wann es startet |
| `delay` | ms ≥ 0 | 0 | Verzögerung |
| `tokens.ease` | Name aus `get_theme` (`motion.ease`) | Theme-Default | Kurve |
| `tokens.durationScale` | Zahl > 0 | 1 | Dauer-Faktor |
| `tokens.stagger` | Zahl ≥ 0 | 1 | Staffelung bei Stagger-/Split-Presets |
| `reducedMotion` | `static` · `fade` · `off` | `static` | Verhalten bei `prefers-reduced-motion` |
| `enabled` | bool | true | Schalter: aus, ohne die Spec zu löschen |

**Reduced Motion ist Pflicht.** `static` heißt: Markup ist der Endzustand, es wird nur
nicht animiert. `fade` blendet Hiding-Presets in 0,4 s ein. `off` nur bewusst und
begründet — es ist die einzige Variante ohne Schonung.

## Motion an Komponenten

Motion sitzt am Knoten — auch an einer Komponente. Die **Instanz** entscheidet mit ihrer
Spec und gewinnt; ohne sie gilt der Default der **Definition** (erst das Wurzel-Teil,
dann der Definitions-Knoten). Rendering und Bake übertragen die Spec auf die Wurzel-Kopie,
die Animation läuft also einmal pro Instanz; `detach` nimmt sie mit. Die übrigen Teile
tragen ihre eigene Motion unabhängig davon.

## Werkzeuge

- `set_motion` — setzt die Spec eines Knotens (`pageId`, `nodeId`, `baseDraftVersion`, `preset`, …).
- `clear_motion` — entfernt die Spec, der Knoten bleibt.
- Beides geht auch als `setMotion`/`clearMotion` in `apply_mutations` (Batch, `dry_run`).
- `get_nodes` zeigt die Specs; `get_section` nennt die Presets der Sektion.
- Vorschau: `create_preview` (Motion läuft im Release), Video/Freeze für Belege.

## Site-Profile (Intensity-Cap und Preset-Klassen)

| Profil | Intensity | Lenis | Pins | 3D | Preset-Klassen |
|---|---|---|---|---|---|
| `clean` | ≤ 3 | aus | keine | nein | Entry, Reveals/Progress, Hover, State, Ambient |
| `standard` | ≤ 7 | an | max 1 | nein | + Scrub/Sticky/Pan + Text |
| `showcase` | ≤ 10 | an | max 1 | max 1 Canvas | alle |

Das Profil steht am Site (`get_site`). Ein Wechsel wird gegen das Dokument validiert:
Verstöße werden gelistet, der Wechsel passiert erst nach Bereinigung. Publish blockt
Verstöße hart. Default ist `standard`.

## Guardrails (hart)

- **max 1 Pin-Preset pro Seite** (`scrub-pin`, `sticky-stack`, `horizontal-pan`).
- **max 2 Parallax-Layer pro Viewport.**
- **Reduced-Motion-Variante vorhanden** (Default `static`).
- **Kein Above-fold-`opacity: 0` ohne Fallback** — Hiding-Presets bekommen automatisch
  den Pending-Guard (noscript + 1,6-s-Failsafe), Hero-Texte trotzdem sparsam animieren.

## Workflow

1. **Baseline zuerst:** Die Sektion muss ohne Motion vollwertig aussehen. Motion ist
   Eskalation, nie Reparatur.
2. **Ein Akzent pro Sektion:** ein Reveal oder eine Choreografie — nicht alles.
3. **Intensity am Profil messen**, nicht am Geschmack: `clean`-Sites bleiben ≤ 3.
4. **Profil wählen, dann animieren:** bei `clean` keine Scrub-/Pin-Ideen planen.
5. **Prüfen:** `create_preview`, dann echte Scroll-Strecke ansehen; bei Zweifel Video.

## Anti-Patterns

- Reveals länger als ~800 ms, Char-Splits mehrfach pro Seite, Preloader über 2,5 s.
- `enabled: false` als „Löschen" missbrauchen (Spec bleibt, das ist gewollt).
- Zwei Pins „nur kurz" — das Gate blockt, nicht diskutieren, sondern streichen.
- Motion als Ersatz für fehlende Hierarchie: erst Typo/Layout, dann Animation.
