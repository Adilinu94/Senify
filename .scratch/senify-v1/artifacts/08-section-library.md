# Artefakt 08: Section-Library v1 & Registry (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Section-Library v1 & Registry".
> Grundlagen: `research/22-framer-analyse.md` (Sektions-Anatomie, Rhythmus, Bento, Sticky), `research/20` (OpenPage 19/42, Instatic-VC-Muster), `artifacts/01` (SectionDefinition), `02` (Renderer), `03` (Motion-Presets), `07` (Tokens), Prototype, Ticket 21.

## Entscheidungen (Wizard, 6/6)

1. **Katalog: erweitert — 25 Sektionen** (Kern 18 + 7 Zusatz).
2. **Varianten: 2–3 pro Sektion** → ~55–60 kuratierte Varianten.
3. **Slots:** self-contained; benannte Slots nur wo strukturell nötig (Schema-Feature vorhanden, v1 sparsam).
4. **Style-Props: frei** — Sektionen exponieren Stil-Props; Werte bevorzugt als Token-Referenzen (07); Hard-Guardrails + Review fangen Drift.
5. **Registry:** TypeBox-Validierung + UI-Metadaten in EINEM Schema → Editor-UI wird generiert.
6. **Golden + Thumbnail:** jede Sektion/Variante bekommt kanonisches Beispiel-JSON + gerenderte Vorschau.

## Der Katalog (25)

| # | Sektion | Varianten (2–3) | Kern-Props (Auszug) | Notiz |
|---|---|---|---|---|
| 1 | `navbar` | default · transparent · centered | logo, links[], cta, sticky | Mobile-Menü integriert |
| 2 | `footer` | minimal · multi-column · cta-bar | columns[], legal, social | |
| 3 | `hero` | centered · split · showcase-3d | eyebrow, headline, sub, ctas, visual | showcase-3d → `webgl-scene`-Preset |
| 4 | `features` | grid · alternating · list | title, items[] (icon, title, text) | Bento-Variante via Density |
| 5 | `services-process` | cards · steps · timeline | title, steps[] (nr, title, text) | Framer „Work Process" |
| 6 | `stats` | row · grid · counter | items[] (value, label, prefix/suffix) | `counter`-Preset |
| 7 | `testimonials` | cards · slider · spotlight | items[] (quote, author, role, avatar) | `marquee`-fähig |
| 8 | `logo-cloud` | grid · wrap · marquee | logos[] (asset, alt) | `marquee`-Preset optional |
| 9 | `projects` | cards · list · showcase | items[] (cover, tag, title, text, link) | CMS später (v2) |
| 10 | `pricing` | plans-3 · comparison · simple | plans[] (name, price, features[], cta), billingToggle | |
| 11 | `faq` | accordion · two-col · sticky-heading | title, items[] (q, a) | Sticky-Muster aus 22 |
| 12 | `cta` | simple · split · banner-cta | headline, sub, buttons[] | |
| 13 | `team` | grid · cards · compact | members[] (photo, name, role) | |
| 14 | `content` | prose · columns · highlight | richtext, intro | Rich-Text-Sektion |
| 15 | `media` | image · video · 3d-scene | asset/Video-Props, caption, aspect | 3D-Variante → `webgl-scene` |
| 16 | `gallery` | grid · masonry · carousel | items[] (asset, caption) | |
| 17 | `contact` | form · info · split | fields[], note, mail | Formular-Post → extern (v1) |
| 18 | `banner` | ribbon · bar · announcement | text, link, dismissible | |
| 19 | `newsletter` | inline · boxed · split | headline, buttonLabel, note | Anbindung extern (v1) |
| 20 | `divider` | line · space · dots | spacing, style | Rhythmus-Werkzeug |
| 21 | `embed` | iframe · map · social | url, aspect, title | Sanitizing-Pflicht |
| 22 | `timeline` | vertical · horizontal · cards | items[] (date, title, text) | |
| 23 | `comparison` | table · cards | columns[], rows[] | |
| 24 | `cookie-note` | bar · card | text, acceptLabel, policyLink | lokal, kein Third-Party |
| 25 | `marquee` | logos · text · images | items[], speed, direction | `marquee`-Preset |

**Sektionen mit Slots (v1, sparsam):** `hero.visual` (Slot für `media`- oder 3D-Inhalt statt Prop) — Pilotfall; weitere Slots erst bei echtem Bedarf.

**Motion:** Jede Sektion erhält sinnvolle Default-`motion`-Presets ihrer Kategorie (z. B. hero → `masked-headline`; stats → `counter`; testimonials → `scroll-reveal`); Presets und Intensität kommen aus der Motion-Spec (03), Profile steuern Defaults (21).

## Registry-Format (SectionDefinition)

```ts
type SectionDefinition = {
  type: string                  // "hero"
  version: number               // schemaVersion (additive, Deprecation)
  title: string
  description: string           // agentenlesbar (Tool-/Prompt-Qualität)
  category: "structure" | "content" | "commerce" | "media" | "utility"
  props: PropSpec[]             // TypeBox-Schema + UI-Metadaten (s. u.)
  variants: Record<string, { label: string; preset: Partial<Props> }>
  styleProps?: PropSpec[]       // freie Stil-Props (Token-first empfohlen)
  slots?: Record<string, { allowedTypes?: string[]; max?: number }>
  allowedChildren?: "none" | string[]
  motionPresets?: string[]      // erlaubte Presets aus 03
  golden: GoldenRef             // Beispiel-Node (JSON) + Thumbnail (3 Breakpoints)
  deprecated?: boolean
}

type PropSpec = {
  key: string
  schema: TSchema               // TypeBox (Validierung)
  control: "text" | "richtext" | "number" | "boolean" | "enum" | "color"
         | "asset" | "link" | "list" | "slot"   // UI-Generierung
  label: string
  group?: string                // "Content" | "Aktionen" | "Styling"
  min?: number; max?: number; step?: number
  options?: { value: string; label: string }[]
  hidden?: (props) => boolean   // bedingte Sichtbarkeit (Framer-Control-Modell)
}
```

**Regeln:**
- Editor-UI wird **generiert** aus `control` + Metadaten (Ticket 09) — keine handgebauten Panels.
- `description` + Golden-Beispiel + Thumbnail sind die **Agenten-Oberfläche** (Ticket 11) und Eval-Basis (Ticket 13).
- Style-Props frei, aber: Werte bevorzugt Token-Referenzen (Artefakt 07); Hard-Guardrails (03) gelten unverändert; Design-Drift wird im Review sichtbar (06).

## Bau-Reihenfolge (Vorschlag für die Spec)

1. **Gerüst:** navbar · footer · hero · content · media · cta (jede Site braucht sie)
2. **Überzeugung:** features · services-process · stats · logo-cloud · projects
3. **Vertrauen & Konversion:** testimonials · pricing · faq · team · contact · banner
4. **Zusatz:** newsletter · divider · embed · timeline · comparison · cookie-note · marquee

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Editor generiert Property-UI aus der Registry; Picker mit Thumbnails | 09 |
| Tools: `list_sections`, `get_section`, `describe_section` (Katalog als Agenten-Interface) | 10 |
| `senify-motion`-/Katalog-Skillpaket: Sektion + Props + Beispiele | 11 |
| Profile entscheiden Default-Intensität/Presets pro Sektion | 21 |
| Evals: Golden-Screenshots als visuelle Referenz | 13 |
