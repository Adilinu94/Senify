# E4 S2 — Token-Verbrauch Referenz-Workflow (Messung 23.09.2026)

Akzeptanz aus dem Verbesserungsplan: „Token-Verbrauch je Referenz-Workflow gemessen und im
Ledger dokumentiert" (Richtwert: Referenz-Workflow < 25.000 Token).

## Methode

Temporärer Vitest-Lauf (`packages/mcp/test/token-messung.test.ts`, nach der Messung
gelöscht): echte MCP-Tool-Calls gegen die Test-Engine — `analyze_reference` (Snapshot-Fallback,
reduced Profil), `update_reference_doc` (design.md, 0,6 KB), dann die vier Lese-Schritte des
Workflows. Gemessen: JSON-Zeichen der Tool-Antworten; Token-Schätzung = Zeichen / 4
(gängige Faustformel, ehrlich als Proxy markiert — kein Tokenizer-Lauf).

## Ergebnis

| Schritt | Zeichen | Tokens (ca.) |
|---|---|---|
| `list_references` | 2.288 | 572 |
| `get_reference` (Profil + Dokumente + Brief) | 7.283 | 1.821 |
| `get_reference_brief` (Einzelbrief) | 1.095 | 274 |
| `plan_redesign` (Paket + Theme-Patch + Dokumente) | 7.671 | 1.918 |
| **Summe** | **18.337** | **≈ 4.584** |

## Einordnung

- **4.584 < 25.000** — der Lese-Workflow passt bequem ins Kontextbudget; etwa 5× Luft.
- Größte Posten: `get_reference` und `plan_redesign` (je ≈ 1.800–1.900). Wer drei
  Referenzen statt einer plant, landet bei ≈ 8.000–9.000 — weiter im Budget.
- Grenzen der Messung: reduced Profil (Snapshot-Fallback, keine Browser-Capture),
  genau eine Referenz, kleines design.md (0,6 KB statt 10–30 KB echter Sammlungs-Dokus).
  Mit vollem Profil + großem design.md wächst `get_reference`/`plan_redesign` — der
  Faktor ist dokumentiert, die absolute Zahl bleibt im Budget.
- Nicht gemessen: `apply_*`-Schreibschritte (hängen vom Seitenumfang ab, nicht vom
  Referenz-Volumen) und der Agenten-Overhead (Prompts, eigene Zwischenschritte).
