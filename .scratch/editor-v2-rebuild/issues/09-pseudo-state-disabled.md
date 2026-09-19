# Editor v2 - Pseudo-State disabled aufnehmen oder streichen (B3)

Status: **erledigt (18.09.)**

**Umsetzung:** `cascade.ts` - `StateName` um `disabled`, `STATE_ORDER` = `[hover, focus, active,
disabled]` (disabled nach active), `STATE_PSEUDO_CLASS` um `:disabled`. `canvas.ts` -
`PREVIEW_STATES` um `disabled` (fuenf Reiter inkl. `none`). Tests: `css-cascade.test.ts`
„pseudo states (O11)" (Reihenfolge, Emission nach active, Selektor). Voller Lauf 1073 gruen.
Abhaengig von: nichts (kleiner Compiler-/Ticket-Entscheid)
Muss liegen: VOR Ticket 02 Punkt 5 (Pseudo-States + Forced-State-Preview) — sonst verdrahtet die
Inspektor-UI drei Zustände hart und der Compiler bricht danach
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B3

## Ziel

Ticket 02 Punkt 5 verspricht vier Pseudo-States inklusive `:disabled`; der Compiler kennt
`StateName = hover | focus | active` mit `STATE_ORDER` (cascade.ts) und `PREVIEW_STATES`
(canvas.ts) ohne `disabled`. Beides vereinbaren, bevor UI-Code die Liste festnagelt.

## Entscheidung (getroffen, 17.09. — O11 in map.md): Option A

**disabled aufnehmen.**

1. `cascade.ts`: `StateName` um `"disabled"` erweitern; `STATE_ORDER` = hover, focus, active,
   disabled (schwächer nach stärker — disabled gewinnt die Quellordnung unter gleichen
   Selektoren); `STATE_PSEUDO_CLASS.disabled = ":disabled"`.
2. `canvas.ts`: `PREVIEW_STATES` um `"disabled"` erweitern; Forced-State-Preview funktioniert
   unverändert darüber (`forcedStateCss` ist datengetrieben).
3. document.ts / Ticket 07: `states`-Record akzeptiert den vierten Namen automatisch
   (Typ folgt StateName).
4. Inspektor (Ticket 02): vier Zustands-Reiter.

**Option B (verworfen, 17.09.): Ticket 02 Punkt 5 auf drei Zustände kappen** („disabled folgt
in Phase 4, wenn Formular-Widgets sie brauchen"). Begründung der Verwerfung: Inspektor-UI würde
3-State-hart codiert und die Phase-4-Formulararbeit müsste Compiler + UI nachziehen — teurer als
die kleine Erweiterung jetzt.

## Abnahme

- Bei Option A: Compiler-Golden-Test mit einer disabled-Regel (Emission in der state-Stufe
  nach active); Forced-State-Preview-Test für disabled; `STATE_ORDER`-Test aktualisiert.
- Bei Option B: Ticket 02 nennt genau drei Zustände; keine UI-Stelle referenziert disabled.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.
