# Artefakt 13: AEO & Output-Qualität (Senify v1)

> Entschieden am 14.09.2026 in Ticket „AEO & Output-Qualität".
> Grundlagen: `artifacts/02` (Build/Bake), `03` (Guardrails + Budgets), `06` (Review), `07` (Tokens), `08` (Sektionen), Research 17/18 (Perf/SEO/AEO).

## Entscheidungen (Wizard, 4/4)

1. **AEO-Standard an** für jede Site (pro Site abschaltbar).
2. **Structured Data:** Basis + sektions-bewusst.
3. **Check-Härte:** Integrität hart, Metriken weich.
4. **Timing:** dreistufig (Schreiben → Submit → Publish).

## AEO-Set pro Site (Build-Outputs)

- `/llms.txt` (Site-Index: Seiten + Kurzbeschreibung) und **`.md`-Variante je Seite** (gleiche URL + `.md`) — erzeugt der Renderer (Artefakt 02).
- Structured Data (JSON-LD), **semantisches HTML** (Section-Tags, Heading-Hierarchie), Sitemap, Robots.
- Default **an** („agent-ready by default"), pro Site abschaltbar.

## Structured Data

- **Automatisch:** Organization/LocalBusiness (Site-Profil), WebSite, WebPage, BreadcrumbList.
- **Sektions-bewusst:** Sections können **validierte JSON-LD-Beiträge** deklarieren (z. B. `faq` → FAQPage; `pricing` nur wenn sauber abbildbar). Der Beitrag ist Teil der `SectionDefinition` (08); Validator prüft gegen Schema.
- Ungültiges JSON-LD = **hart**.

## Check-Katalog

| Check | Stufe | Wann |
|---|---|---|
| Motion-Guardrails (03) | HART | Schreiben · Submit · Publish |
| Kaputte interne Links | HART | Submit · Publish |
| Fehlende Alt-Texte | HART | Submit · Publish |
| Kontrast < WCAG AA (Token-Paare) | HART | Submit · Publish |
| Fehlender Seitentitel/Meta | HART | Submit · Publish |
| Ungültiges JSON-LD | HART | Submit · Publish |
| Lighthouse-/CWV-Metriken (Ziel 80–90 bei Motion) | WEICH | Publish (Report) |
| Bundle-Größe (Richtwerte aus 03) | WEICH | Publish |
| Externe Links | WEICH | Publish |
| Screenshot-Abweichungen | INFO | Submit (Review, 06) |

- Hard-Fails nutzen das Fehlerformat aus Artefakt 10 (Kategorie `guardrail`/`validation`, Fundstelle, Vorschlag).
- Ergebnisse erscheinen im **Review-Tab „Checks"** und im **Release-Audit**.

## Dreistufige Pipeline

1. **Schreiben:** Live-Validierung je Mutation (sofortiges Agent-Feedback; `dry_run`, Artefakt 10).
2. **Submit:** vollständiger Katalog → Review-Item (Hard-Fail ⇒ kein Item, Artefakt 06).
3. **Publish:** Defense-in-Depth über alle betroffenen Seiten → Release-Gate (hart) + Report (weich).

## Datenmodell-Erweiterung

- `Page.meta { title?, description?, ogImage? }` — ergänzt Artefakt 01 (SEO/AEO-Felder).

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Check-Anzeige im Review (Tab „Checks") | 06 |
| Checks laufen in der Build-/Preview-Pipeline | 14 |
| JSON-LD-Beiträge in der SectionDefinition | 08 |
| Kontrast-Checks gegen Token-Paare | 07 |

## Nachtrag 15.09.2026 (Technologie-Check → `research/30`)

- **Google (15.06.2026): llms.txt ist SEO-neutral** (kein Ranking-Effekt) — AEO/Agenten-Material daher **ohne SEO-Claims** formulieren („agent-ready by default", nicht „bessere Rankings").
- **Agenten-Adoption bestätigt:** IDE-Agenten (Cursor, Windsurf, Claude Code, Copilot, Cline) fetchen llms.txt routinemäßig → unser Set bleibt richtig.
- **llms.txt v2-Proposal:** Discovery-`link`-Relations als Mini-Ergänzung aufnehmen; WebMCP/SDF/CAP als v2-Kandidaten beobachten.
