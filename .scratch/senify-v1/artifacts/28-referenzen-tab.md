# Artefakt 28: Referenzen-Tab — Design-Analyse & Wiederverwendung (Senify v1)

> Entschieden am 15.09.2026 in Ticket „Referenzen-Tab: Design-Analyse & Wiederverwendung".
> Grundlagen: `research/27-taste-vault-learnings.md` (Pipeline-Skizze, 18er-Taxonomie, Guardrails), `research/22-framer-analyse.md`, `artifacts/07` (Tokens), `03` (Motion), `08` (Sektionen), `11` (Skills), `27` (Shell).

## Entscheidungen (Wizard, 6/6)

1. **Vollautomatisch:** Adresse eingeben → Analyse läuft komplett durch → Profil ist **sofort nutzbar**; Ergebnis im Tab transparent einsehbar, optionale Nachbearbeitung (kein Pflicht-Review).
2. **Volles Designsystem:** Tokens **+ Komponenten + Bewegung + Stil-Blatt**.
3. **Verwendung:** im Projekt wählbar (du oder Agent); beim Bauen automatisch wirksam; Agent liest das Stil-Blatt.
4. **Mehrere Referenzen kombinierbar** — über **Skalen-Zuordnung** (Farben von A · Schriften von B · Bewegung von C …; Default: eine Referenz für alles).
5. **Keine Re-Analyse-Funktion:** bei Bedarf eine neue Referenz anlegen; alte bleibt löschbar (mit Nutzungs-Hinweis).
6. **Schutzregeln „Inspiration, kein Klon":** Logos, Marken-Assets, Originaltexte, Fotos und 1:1-Layouts werden nie übernommen; Hinweise + Nähe-Warnung.

## 1. Pipeline (Referenz anlegen)

```
URL (z. B. https://www.apple.de)  →  Job startet automatisch
 0. Governance: robots/ToS beachten · interner Gebrauch · Provenance (URL, Datum, Hash)
 1. Capture (Playwright headless, server-seitig; Job mit Fortschritt)
     3 Größen: Desktop 1440 / Tablet 810 / Mobile 390
     Full-Page- + Sektions-Screenshots · DOM-Dump · Asset-Liste
     Motion-Sampling: Transitions/Durations/Easings, Scroll-/Hover-Verhalten, Lib-Erkennung
 2. Deterministische Extraktion (Code, kein LLM)
     Farb-Histogramm (Wert + Flächenanteil) · Font-Inventar (Familie/Weight/Größen/Rollen)
     Spacing/Radii/Shadows/Container → Skalen · Breakpoints
 3. KI-Analyse (Vision + Extrakt)
     Familien-Klassifikation (Seed: 18er-Taxonomie aus taste-vault, inkl. KI-Default-Warnungen)
     Vokabular (5–8 prompt-fähige Begriffe) · Komponenten-Inventar · Kompositionsregeln · Do/Don't
     Evidenz + Konfidenz je Aussage; keine erfundenen Werte; Widersprüche markiert
 4. Design-Profil (JSONB) — Ergebnis, sofort nutzbar; im Tab einsehbar
Fallback: blockt die Seite die Analyse → Screenshot-Upload (reduziertes Profil)
```

## 2. Design-Profil (Format)

```ts
type Reference = {
  id, name, sourceUrl, capturedAt
  status: "analyzing" | "ready" | "failed"
  families: string[]                       // 18er-Taxonomie + freie
  vocabulary: string[]                     // prompt-fähig
  profile: {
    tokens: { color; type; space; radius; shadow; motion }   // DTCG-nah, mappt auf Skalen (07)
    components: { name; variants }[]                          // Nav, Button, Card, Form …
    rules: { constants: string[]; never: string[] }           // House-DNA-Muster
  }
  styleBrief: string                       // maschinenlesbar, Englisch (prompt-fähig); UI zeigt Deutsch
  evidence: { claim; confidence; source }[]
  snapshots: SnapshotRef[]                 // intern; NICHT in der Site-Medien-Bibliothek
  provenance: { url; date; hash; note }    // Rechtliches/Doku
}
```

- Nachbearbeitung (optional): Token-Werte, Vokabular, Do/Don't editieren — jede Änderung erzeugt eine **neue Profil-Revision** (append-only leichtgewichtig).

## 3. Wiederverwendung

- **Projekt-Zuordnung** (Projekt-Einstellungen): Liste zugeordneter Referenzen; **Skalen-Zuordnung** je Skala (Farben/Typografie/Motion/Rest) — Default: eine Referenz für alles; Mischung nur bewusst.
- **Theme-Ableitung:** Profil → Senify-Theme (Primitives/Semantik + Skalen-Engine, Artefakt 07); „im Stil von X" im Master-Flow (11) wird zu: Referenz wählen → Theme-Draft → Agent baut.
- **Agenten-Kontext:** `get_reference` liefert Stil-Blatt + Empfehlungen (Sektions-Varianten 08, Motion-Presets 03) — als maschinenlesbarer Brief (ersetzt Copy-Paste-Briefs).
- **QA (weich):** Style-Adhärenz-Check generierter Seiten gegen das Profil (Hinweis beim Schreiben/Submit, 13).

## 4. Tab & Verwaltung

- **Karten:** Vorschaubild, Name/Quelle, Familien, Datum, „verwendet in N Projekten".
- Suche/Filter (Familie, Tags); **Löschen** mit Nutzungs-Hinweis; **keine Re-Analyse** (Entscheidung 5).
- Detailansicht: Token-Swatches, Typo-Skala, Komponenten, Motion-Notizen, Snapshots, Provenance; Nachbearbeitung.
- **Rechtliches:** Snapshots nur intern; keine Weitergabe der Rohbilder (Aufnahme-Rechte geprüft, Herkunft dokumentiert).

## 5. Schutzregeln (Entscheidung 6)

- **Nie übernehmen:** Logos, Marken-Assets, Originaltexte, Fotos, identische Layouts bei Kundensites.
- Produkt-Sprache: **„Designsystem-Inspiration"** — nicht „Klon" / „1:1".
- **Nähe-Warnung:** Das Agenten-Skill (11) enthält „too close"-Repair-Hinweise (aus taste-vault `prompts.md`); QA-Hinweis (weich) bei zu großer Ähnlichkeit.

## 6. MCP-Tools (Nachtrag zu 10)

| Tool | Scope | Zweck |
|---|---|---|
| `analyze_reference` | `write` | URL → Analyse-Job (vollautomatisch) |
| `list_references` / `get_reference` | `read` | Übersicht / Profil + Stil-Blatt |
| `apply_reference` | `write` | Referenz einem Projekt zuordnen (Skalen-Zuordnung) |

## 7. Anschlüsse

| Bereich | Ticket |
|---|---|
| Token-Mapping, Skalen-Engine | 07 |
| Sektions-/Motion-Empfehlungen aus Familien | 03 / 08 |
| Skill-Referenzen + Repair-Prompts („im Stil von X") | 11 |
| Tab in der Shell; Projekt-Zuordnung in Projekt-Einstellungen | 27 |
| QA-Hinweise (weich) im Review | 06 / 13 |
| Spec: Analyse-Job (Playwright-Worker) als eigenes Build-Paket | `/to-spec` |
