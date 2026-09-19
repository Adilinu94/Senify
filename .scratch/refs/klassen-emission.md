# Klassen-Emission: regional vs. global (Ticket 14)

Messung: 2026-09-19T08:04:31.927Z — `node .scratch/editor-v2-rebuild/pruef-klassen-emission.mjs`

Regional = `[data-node-id].cls` je tragendem Knoten (heute). Global = `.cls` einmalig je Klasse.

| Dokument | Knoten | Klassen | Strategie | Bytes | Regeln (gesamt) | davon Klassen | Deklarationen |
|---|---|---|---|---|---|---|---|
| a-30-knoten-1-klasse-20-deklarationen | 30 | 1 | regional | 16295 | 60 | 30 | 630 |
| a-30-knoten-1-klasse-20-deklarationen | 30 | 1 | global | 1987 | 31 | 1 | 50 |
| b-120-knoten-6-klassen-15-deklarationen | 120 | 6 | regional | 54867 | 240 | 120 | 1920 |
| b-120-knoten-6-klassen-15-deklarationen | 120 | 6 | global | 8356 | 126 | 6 | 210 |
| c-hero-15-knoten-3-klassen-40-deklarationen | 15 | 3 | regional | 15185 | 30 | 15 | 615 |
| c-hero-15-knoten-3-klassen-40-deklarationen | 15 | 3 | global | 3590 | 18 | 3 | 135 |

## Verhaeltnis regional/global

- a-30-knoten-1-klasse-20-deklarationen: 8.2x
- b-120-knoten-6-klassen-15-deklarationen: 6.57x
- c-hero-15-knoten-3-klassen-40-deklarationen: 4.23x

## Korrektheitsprobe

- a-30-knoten-1-klasse-20-deklarationen: gruen (gleiche Deklarationen je Traeger in beiden Strategien)
- b-120-knoten-6-klassen-15-deklarationen: gruen (gleiche Deklarationen je Traeger in beiden Strategien)
- c-hero-15-knoten-3-klassen-40-deklarationen: gruen (gleiche Deklarationen je Traeger in beiden Strategien)

## Kriterium

Bei Dokument (b) mehr als ~2x Bytes regional -> global umstellen; sonst regional behalten.
