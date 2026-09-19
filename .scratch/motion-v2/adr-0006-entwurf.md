# Motion-Authoring im Editor v2: Motion-Spec als einziger Kanal

Uebernommen nach `docs/adr/0006-motion-authoring.md` (accepted, 18.09.2026); diese Datei bleibt als Entwurfsprotokoll.
Bezug: Ticket 19 (`issues/19-motion-authoring.md`), ADR-0003 (bleibt gueltig), ADR-0005 (offenes CSS).

Der Editor-v2-Rebuild hat den v1-Motion-Stack (ADR-0003, MotionSpec, 24 Presets, GSAP/ScrollTrigger/
Lenis, Bake-Anbindung) **nicht mitgenommen**: `migrateV1ToV2` verwirft `motion` still
(`migration.ts:58-91`), das v2-Dokument kennt kein Motion-Feld, kein Ticket behandelte das Thema.
Bestands-Sites verlieren ihre Animationen. Recherche und Plugin-Analyse sind abgeschlossen
(`.scratch/motion-v2/`).

**Entscheidung:** Motion kehrt als **typisierte Motion-Spec pro Knoten** in den v2-Editor zurueck —
Preset + Intensity-Dial + Tokens + Trigger + Reduced-Motion-Variante. **Kein freier Motion-Code**,
weder von Menschen noch von Agenten. Die **Preset-Registry mit Faehigkeits-Flags** ist die einzige
Quelle fuer Editor-UI, Validierung, Runtime-Bedarf und Guardrails. Die Ausfuehrung bleibt
**GSAP + ScrollTrigger + Lenis, self-hosted** (GSAP 3.15, nur benoetigte Plugins, kein
ScrollSmoother); Motion (React) bleibt Editor-UI. Die Payload (`motion-data` v2) ist versioniert,
eine Liste, mit serverseitig aufgeloesten Tokens und zentralen Breakpoint-Queries — **Canvas und
Bake lesen dieselbe Ableitung**. Reduced Motion ist Pflicht (Policy `skip|fade|ignore`, Default
`skip`; das Markup ist der Endzustand). Das Paritaets-Tor vergleicht den **Baseline-Zustand**
(Motion-Kill-Switch); die Animation wird separat ueber Video, Endzustands-Checks und spaeter
Sampling bewertet. Harte Publish-Gates: max 1 Pin-Preset/Seite, max 2 Parallax-Layer/Viewport,
RM-Pflicht, LCP-Schutz (kein Above-fold-`opacity:0` ohne Fallback).

**Betrachtete Optionen:**
- *Freie Timeline/Scrub-Editor (Framer-nah)* — vertagt auf M6. Presets + Intensity sind
  agent-native, deterministisch und entsprechen der Builder-Praxis (Webflow/Framer).
- *Motion (React) fuer alles* — verworfen: ADR-0003; der Bake hat fuer Content kein React,
  Scroll-Pinning bleibt GSAP-Territorium.
- *CDN statt self-hosted* — verworfen: externe Requests, keine eingefrorene Version, DSGVO.
- *Motion gar nicht in v2* — verworfen: Bestandsverlust, Framer-Niveau ist Produktziel.
- *Motion-Register als zweites Regel-System* — verworfen: Knotenfeld reicht; Wiederverwendung
  kommt ueber Slots/VCs/Templates (Phase 4).

**Konsequenzen:**
- Engine-Lock-in GSAP bleibt (wie ADR-0003); ein Wechsel waere ein Rewrite aller Presets.
- Presets sind Code, die Spec ist Daten: neues Preset = Runner + Registry-Eintrag + Tests.
- Die Migration muss `motion` uebernehmen (behebt den stillen Verlust); die irrefuehrende
  Migration-Notiz („nur `hidden` faellt weg") wird korrigiert.
- Release-Budget: Motion-JS ≤ ~150 KB ohne 3D (self-hosted eingefroren).
- Testpflicht: Mutationsprobe je Guardrail, Freeze-Gegenproben, bidirektionale
  Preset↔Runner-Abdeckung (Plugin-Lehren).
- Start erst nach Ticket-13-Rest (Bake-Pfad), dann M0–M5 nach `plan.md`.

**Referenz:** `.scratch/motion-v2/research.md`, `plugin-analyse.md`, `preset-matrix.md`,
`payload-spec.md`, `freeze-spec.md`; `docs/adr/0003-gsap-als-choreografie-kern.md`.
