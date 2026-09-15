# Agent-Experience & Onboarding

Type: grilling
Status: resolved
Blocked by: 10

Input: research/20-referenzprojekte.md
Input: artifacts/03-motion-3d.md
Input: artifacts/04-mcp-betrieb.md
Input: artifacts/08-section-library.md
Input: artifacts/10-mcp-tools.md
Input: issues/21-site-profile-und-intensitaet.md

## Question

Was bekommt ein Agent an die Hand, um Senify sofort richtig zu nutzen: AGENTS.md/Knowledge-Router, Skills-Paket (Sektionskatalog, Design-Regeln, Beispiel-Prompts), Fehlertexte als Führung, Einstiegs-Flow („baue mir die Site aus Brief")?

Ergebnis: Onboarding-Konzept für Agenten v1.

## Answer

Agenten-Onboarding entschieden (6/6 Wizard). Artefakt: [artifacts/11-agent-experience.md](../artifacts/11-agent-experience.md).

- **Ein `senify`-Skillpaket** mit Knowledge-Router (SKILL.md → Referenzen für Workflow/Sektionen/Motion/Tokens/Fehler/Prompts).
- **`senify setup`** als Ein-Kommando-Onboarding: Token → MCP-Configure → Skill-Install → „arbeitsfähig ✓".
- **Master-Workflow „Site aus Brief"** (Plan → Bau → Preview → `submit_for_review`) + Szenario-Prompts (Landing · Portfolio · Local Business · Seiten-Redesign).
- **Design-Regeln:** Senify-Spezifika hart kodiert; Ästhetik per Verweis auf bestehende Design-Skills (keine Duplikation).
- **Inhalte generiert** aus Registry, Tool-Katalog und Fehlercodes — kein Drift; dieselbe Pipeline speist das Portal (12).
- **Feedback-Loop:** neues Tool `senify_feedback` (Tool-Katalog damit 25); Review-Kommentare + Feedback fließen kuratiert in Skills/Tools.

Inputs verdrahtet: 12, 21.
