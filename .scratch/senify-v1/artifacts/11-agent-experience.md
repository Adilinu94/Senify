# Artefakt 11: Agent-Experience & Onboarding (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Agent-Experience & Onboarding".
> Grundlagen: `research/20` (OpenDesign: Skills/`mcp install`; Instatic: `.agents/skills`), `artifacts/03` (Motion-Skillpaket, Taste-as-Code), `04` (Setup/MCP), `08` (Katalog + Golden), `10` (Tools/Fehler).

## Entscheidungen (Wizard, 6/6)

1. **Ein `senify`-Skillpaket** mit Knowledge-Router.
2. **Installation:** `senify setup` — ein Kommando vom Nichts zum arbeitsfähigen Agenten.
3. **Einstieg:** Master-Workflow „Site aus Brief" + Szenario-Prompt-Bibliothek.
4. **Design-Regeln:** Senify-Spezifika + Verweise auf bestehende Design-Skills.
5. **Inhalte:** generiert aus Single Sources (Registry, Tools, Fehlercodes).
6. **Feedback-Loop:** `senify_feedback`-Tool + kuratierte Skill-Pflege.

## Das Skillpaket

```
senify-skills/
├── SKILL.md                    # Einstieg + Knowledge-Router (Thema → Referenz)
└── references/
    ├── workflow.md             # Master-Flow „Site aus Brief" (kanonisch)
    ├── sections.md             # GENERIERT: 25 Sektionen, Props, Varianten, Golden-Beispiele
    ├── motion.md               # Motion-Spec-Leitfaden + Presets (03) + Guardrails
    ├── tokens.md               # Token-first-Regeln, semantische Rollen, Theme-Pflege
    ├── errors.md               # GENERIERT: Fehlercodes + Vorschläge
    └── prompts/                # Szenarien: landing · portfolio · local-business · page-redesign
```

- **Router-Prinzip** (Sanity-Muster): SKILL.md bleibt klein und verweist thematisch; Agenten laden nur, was sie brauchen.
- **Design-Regeln:** Senify-Spezifika hart kodiert (Sektionen/Props, Token-first, Motion-Spec, Anti-Patterns); für Ästhetik wird auf bestehende Design-Skills verwiesen (design-taste, awwwards-motion, high-end-visual-design) — keine Duplikation.
- **Generierung:** `sections.md`, `errors.md` und die Tool-Referenz entstehen automatisch aus Registry, Tool-Katalog und Fehlercodes → kein Drift. Dieselbe Pipeline speist das Portal (Ticket 12).

## Setup & Onboarding (ein Kommando)

```
senify setup
  1. Login/Token      → scoped Token (read,write; publish optional) anlegen
  2. MCP configure    → Claude Code / Cursor / opencode erkennen + eintragen
  3. Skill install    → senify-skills ins Agent-Verzeichnis
  4. Check            → whoami + list_sites → „arbeitsfähig ✓"
```

- `--print` für Dry-Run; Troubleshooting im Portal (Ticket 12).
- Danach genügt: „Baue mir die Site aus diesem Brief …"

## Master-Workflow „Site aus Brief"

1. **Verstehen:** Brief lesen, Zielgruppe/Sektionen ableiten, Bestand prüfen (`list_sites`, `get_site`, `list_pages`).
2. **Planen:** Seitenstruktur + Sektionsfolge als kurze Textliste vorschlagen — **bevor** gebaut wird.
3. **Bauen:** `create_page`; Sektion für Sektion via `get_section`-Golden-Beispiel + `apply_mutations` (`dry_run` wo sinnvoll); Token-Rollen statt Rohwerte; Profil-Defaults beachten (21).
4. **Prüfen:** `create_preview` → Screenshots/Link ansehen (bei Motion-Änderungen Video-Checkliste).
5. **Übergeben:** `submit_for_review` — Approval im Editor (Ticket 06).

## Feedback-Loop

- Neues Tool **`senify_feedback`** (ergänzt den Tool-Katalog, Artefakt 10): Agent meldet Tool-Fehler, fehlende Fähigkeiten, unklare Doku, Workarounds — mit Kontext.
- Review-Kommentare + Feedback fließen **kuratiert** in Skill-Referenzen, Fehlertexte und Tool-Verbesserungen (kein Auto-Training).

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Portal generiert dieselben Referenzen als Doku (+ `llms.txt`) | 12 |
| Profile setzen Defaults, die der Master-Flow beachtet („schlicht ist Normalfall") | 21 |

## Nachtrag 15.09.2026 (Asset-Beschaffung → `research/32`)

- **Bild-Assets:** Agenten generieren lokal mit dem Agenten-Skill **`image-use`** (MIT; ChatGPT-/Gemini-Anmeldung inkl. Free-Tier, kein API-Key; `--composition-ref` passt zur „Inspiration, kein Klon"-Regel) oder nutzen lizenzfreie Stock-Quellen; Upload in die Mediathek via `upload_asset`. Icons: Open-Source-Sets (Lucide/Phosphor/Heroicons). Fonts: kuratiert (07).
- **Skillpaket erhält `references/assets.md`** (Beschaffungs-Workflow + Guardrails: keine Marken/Personen/Produkte 1:1, Lizenzen, Alt-Pflicht).
- **v2-Kandidat:** generischer „Generieren"-Hook in der Medien-Bibliothek (ruft lokal konfigurierte Generatoren auf; austauschbar, nicht vendor-fixiert).
