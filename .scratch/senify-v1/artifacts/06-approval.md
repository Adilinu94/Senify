# Artefakt 06: Approval-Queue & Guardrails (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Approval-Queue & Guardrails".
> Grundlagen: `research/19-approval-tooling.md` (Playwright + pixelmatch/odiff + jsondiffpatch + eigener Layer), `artifacts/03` (Motion-Guardrails), `artifacts/04` (Scopes/Audit), `artifacts/05` (Previews/Releases).

## Entscheidungen (Wizard, 6/6)

1. **Review-Ansicht dreiteilig:** Struktur-Diff (JSON-Tree) + Screenshot-Diff + Preview-Link.
2. **Trigger:** Agent-Submit (`submit_for_review`) erzeugt Preview + Diffs + Review-Item; ohne Submit bleiben Änderungen Draft.
3. **Aktionen:** Approve · Request changes · Discard.
4. **Granularität:** ganzes Review-Item (kein Teil-Approval in v1).
5. **Screenshots:** betroffene Seiten × 3 Breakpoints; Vorher = aktives Release, Nachher = Preview-Build; Animationen deaktiviert; unveränderte Seiten übersprungen.
6. **Motion-Review:** Playwright-Video (Scroll-through) **nur bei Motion-Änderungen** + Anti-Pattern-/Coverage-Checkliste.

## Review-Item (Datenmodell)

```ts
type ReviewItem = {
  id: ReviewId
  siteId: SiteId
  previewId: PreviewId                 // Artefakt 05: Build + Token-URL
  draftBaseRef: DraftSnapshotRef       // Draft-Stand VOR dem Block (für Discard)
  pages: PageId[]                      // betroffene Seiten
  author: Author                       // { kind: "agent", tokenName }
  status: "submitted" | "in_review" | "approved" | "changes_requested" | "discarded"
  diffs: { structureRef: string; screenshotsRef: string; motionVideoRef?: string }
  guardrails: { hard: GuardrailResult[]; soft: GuardrailNotice[] }
  thread: ReviewComment[]              // Notizen an Agent / von Agent
  createdAt: string; resolvedAt?: string
}
```

## Flow

```
Agent: Mutationen (drafts, write-Scope) … fertig
  └─ submit_for_review
       ├─ Preview-Build (Parität, 05)
       ├─ Hard-Guardrails (03): Pin×1 · Parallax×2 · keine Scroll-Listener · RM-Pflicht
       │    └─ Verstoß? → Item wird NICHT erstellt; Fehlerliste geht direkt an den Agent
       ├─ Diffs generieren: JSON-Tree (jsondiffpatch) · Screenshots (Playwright, 3 Breakpoints) ·
       │    Motion-Video (nur wenn Motion-Specs geändert)
       └─ Review-Item (Status: submitted) → Inbox
Du: Review (Visuell · Struktur · Motion) → Approve / Request changes / Discard
  ├─ Approve          → Publish-Flow: Release-Assembly + Bake + Swap (05)
  ├─ Request changes  → Notiz an Agent; neues Review-Item nach nächster Iteration
  └─ Discard          → Draft zurück auf draftBaseRef (Änderungen verworfen, Historie bleibt)
```

## Review-Ansicht (UI-Anatomie)

- **Kopf:** Site · betroffene Seiten · Agent/Token · Zeitstempel · Guardrail-Badge (grün/gelb).
- **Tab „Visuell":** Seiten-Umschalter × Breakpoint-Umschalter; Screenshot-Slider (Vorher/Nachher) bzw. Side-by-Side; Diff-Heatmap optional.
- **Tab „Struktur":** JSON-Tree-Diff gruppiert nach Seite → Sektion → Feld (Props/Motion/Overrides); farbige +/-; Props mit Token-Referenzen aufgelöst dargestellt.
- **Tab „Motion"** (nur wenn relevant): Video-Player (Scroll-through) + Checkliste (Coverage, Reveal-Dauer, Parallax-Layer, RM-Variante, Anti-Patterns).
- **Tab „Meta":** Audit-Ausschnitt (04), Preview-Token-URL (teilbar), Release-Basis.

## Aktionen im Detail

- **Approve:** markiert Item approved; du erzeugst daraus einen Release (1-Klick; bei Single-Operator = direkt). Approved-Items bleiben verlinkt (Audit).
- **Request changes:** Pflicht-Notiz; geht in `thread`; der Agent liest sie beim nächsten Lauf (Tool `get_review_feedback`); Status `changes_requested`.
- **Discard:** Draft-Restore auf `draftBaseRef`; Status `discarded`; nichts wird gelöscht (Historie/Preview bleiben bis TTL).

## Guardrails-Integration (Artefakt 03)

- **Hard-Checks** laufen (a) live beim Schreiben (Validator, mit klarer Fehlermeldung) und (b) beim Submit — Verstöße verhindern das Review-Item und gehen als Feedback an den Agent. Nie „durchwinken".
- **Soft-Hinweise** (Reveals < 800 ms, Char-Split, Preloader, Anti-Patterns) erscheinen als gelbe Notizen im Review — Entscheidung bleibt bei dir.
- **Quality-Metriken** (Ticket 13) erscheinen ebenfalls als Hinweise (keine Gates).

## Tooling & Infrastruktur

- Screenshots/Video: Playwright auf der Preview-Build-URL (Animationen deaktiviert für stabile Diffs); Bild-Diff: pixelmatch/odiff (Research 19).
- Struktur-Diff: jsondiffpatch gegen die Basis (aktives Release bzw. `draftBaseRef`).
- Diffs werden als Artefakte am Review-Item gespeichert (nicht im Chat) und mit der Preview-TTL aufgeräumt.
- Benachrichtigung: Inbox + Badge im Dashboard (E-Mail/Slack optional später).

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Editor teilt Preview-/Diff-Bausteine (History-Panel) | 09 |
| Tools: `submit_for_review`, `get_review_feedback`; Guardrail-Fehlerformate | 10 |
| Hard-Checks beim Submit, Metriken als Hinweise | 13 |
| Screenshot-/Video-Infrastruktur auf Preview-Deployments | 14 |
