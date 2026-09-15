# Research: Approval-Tooling

Type: research
Status: resolved

## Question

Welches Visual-Diff-/Preview-Tooling eignet sich für die Approval-Queue (self-hosted bevorzugt): Playwright-Screenshots, Argos, reg-suit, Alternativen? Wie kombiniert man Screenshot-Diff + strukturierten JSON-Diff bestmöglich?

Ergebnis: Tool-Vergleich + Integrationsskizze.

## Answer

- Kernbefund: Kein OSS-Tool kombiniert Screenshot-Diff und JSON-Tree-Diff in einer Review-UX — die Kombination muss als eigener Approval-Layer gebaut werden; Argos/reg-suit reviewen nur Bilder.
- Top-3: (1) Playwright (Capture) + pixelmatch/odiff (Bild-Diff) + jsondiffpatch (JSON-Diff) + eigene Review-UI auf Postgres; (2) Argos self-hosted (MIT, sehr aktiv, aber ohne Self-Host-Support/Doku und schwerer Stack) als Fallback; (3) reg-suit (S3/GCS, HTML-Report) nur für CI-nahe Reports ohne interaktive Freigabe.
- Ausgeschlossen: Lost Pixel (archiviert 04/2026), BackstopJS (Maintainer gesucht); Chromatic/Percy nur als SaaS-Preisreferenz.
- Größtes Risiko: Motion/3D-Determinismus — braucht Capture-Mode (Freeze von Timelines/WebGL) im Renderer.
- Details, Vergleichstabelle und Integrationsskizze: `.scratch/senify-v1/research/19-approval-tooling.md`.
