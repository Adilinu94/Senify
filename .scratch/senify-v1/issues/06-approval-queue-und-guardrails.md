# Approval-Queue & Guardrails

Type: grilling
Status: resolved
Blocked by: 05

Input: `research/19-approval-tooling.md`
Input: `artifacts/03-motion-3d.md`
Input: `artifacts/04-mcp-betrieb.md`
Input: `artifacts/05-lifecycle.md`

## Question

Was sieht der Mensch bei Agenten-Änderungen, bevor sie live gehen — strukturierter Diff (JSON-Tree), Screenshot-Diff, Vorschau-Link? Welche Freigabe-Regeln gelten (direkt publizieren vs. Vorschlag), wie wird abgelehnt, kommentiert, nachgebessert, zurückgerollt?

Ergebnis: UX- und Regelwerk der Approval-Queue.

## Answer

Approval-Modell entschieden (6/6 Wizard). Artefakt: [artifacts/06-approval.md](../artifacts/06-approval.md).

- **Ansicht dreiteilig:** Struktur-Diff (JSON-Tree, jsondiffpatch) + Screenshot-Diff (Vorher = aktives Release, Nachher = Preview-Build) + Preview-Link — eigener Layer (kein OSS-Tool kombiniert beides, Research 19).
- **Trigger:** Agent-Submit (`submit_for_review`) erzeugt Preview + Diffs + Review-Item; Mutationen ohne Submit bleiben Draft.
- **Aktionen:** Approve · Request changes (Notiz → Agent-Iteration via `get_review_feedback`) · Discard (Draft zurück auf Submit-Basis).
- **Granularität:** ganzes Review-Item (kein Teil-Approval in v1).
- **Screenshots:** betroffene Seiten × 3 Breakpoints, Animationen deaktiviert, unveränderte Seiten übersprungen.
- **Motion:** Playwright-Video (Scroll-through) nur bei Motion-Änderungen + Anti-Pattern-/Coverage-Checkliste.
- **Guardrails:** Hard-Checks beim Schreiben UND Submit (Agent bekommt Fehler sofort, kein Review-Item); weiche Hinweise im Review; audit-verknüpft.

Inputs verdrahtet: 09, 10, 13, 14.
