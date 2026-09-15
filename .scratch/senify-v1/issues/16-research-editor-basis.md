# Research: Editor-Basis

Type: research
Status: resolved

## Question

Welche Editor-Basis passt für Senify v1: Puck (Open Source), Eigenbau auf DOM/JSON, oder andere React-Visual-Editoren?

Untersuche: Fähigkeiten, Lizenz, Datenmodell (JSON-Baum), Agenten-Tauglichkeit (kann ein Agent Edits/Patches direkt schreiben?), Grenzen, Reifegrad 2026. Ergebnis: Empfehlung + Risiken.

## Answer

Kernbefund: **Puck (MIT-Core) ist 2026 die reifste einbettbare React-Editor-Basis** mit exakt dem Ziel-Datenmodell (JSON-Baum `{content, root, zones}` + Component-Registry `Config`; 13,3k Stars, v0.23.0 08/2026, ~160k npm-Downloads/Woche). Agenten-Edits laufen nicht über das `data`-Prop (initial-only), sondern über `dispatch({type:"setData"})`, `onChange`/`onPublish` sowie headless `<Render>`/`migrate()` — der MCP-Agent schreibt JSON in Senifys Persistenz, Puck ist Editor/Renderer.

Top-3-Empfehlungen:
1. **Puck-Core als Editor-Basis**, Puck-`Data` als kanonisches Format in Senify-Envelope (Meta/Tokens/Version); kein Eigenbau.
2. **Puck AI/Cloud in v1 weglassen** — proprietär (npm ohne Lizenz), ab $199/Mo, Terms erlauben Training auf Customer Content; eigenes MCP-Agent-Layer bleibt die Agenten-Surface.
3. **Alternativen verwerfen:** Plasmic cloud-only, Onlook editiert Code statt JSON (Release-Stillstand seit 07/2025), Easyblocks tot (07/2024, AGPL-3.0), Builder.io nur Muster-Referenz.

Details, Vergleichstabelle, Risiken und offene Fragen: `research/16-editor-basis.md`.
