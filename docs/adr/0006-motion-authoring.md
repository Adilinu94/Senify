# Motion-Authoring im Editor v2: Motion-Spec als einziger Kanal

Status: accepted · 18.09.2026
Bezug: Ticket 19 (`issues/19-motion-authoring.md`), ADR-0003 (bleibt gültig), ADR-0005 (offenes CSS).

Der Editor-v2-Rebuild hat den v1-Motion-Stack (ADR-0003, MotionSpec, 24 Presets, GSAP/ScrollTrigger/
Lenis, Bake-Anbindung) **nicht mitgenommen**: `migrateV1ToV2` verwarf `motion` still
(`migration.ts`), das v2-Dokument kannte kein Motion-Feld, kein Ticket behandelte das Thema.
Bestands-Sites verloren ihre Animationen. Recherche und Plugin-Analyse sind abgeschlossen
(`.scratch/motion-v2/`).

**Entscheidung:** Motion kehrt als **typisierte Motion-Spec pro Knoten** in den v2-Editor zurück —
Preset + Intensity-Dial + Tokens + Trigger + Reduced-Motion-Variante. **Kein freier Motion-Code**,
weder von Menschen noch von Agenten. Die **Preset-Registry mit Fähigkeits-Flags** ist die einzige
Quelle für Editor-UI, Validierung, Runtime-Bedarf und Guardrails. Die Ausführung bleibt
**GSAP + ScrollTrigger + Lenis, self-hosted** (GSAP 3.15, nur benötigte Plugins, kein
ScrollSmoother); Motion (React) bleibt Editor-UI. Die Payload (`motion-data` v2) ist versioniert,
eine Liste, mit serverseitig aufgelösten Tokens und zentralen Breakpoint-Queries — **Canvas und
Bake lesen dieselbe Ableitung**. Reduced Motion ist Pflicht (Policy `static|fade|off`, Default
`static`; das Markup ist der Endzustand). Das Paritäts-Tor vergleicht den **Baseline-Zustand**
(Motion-Kill-Switch); die Animation wird separat über Video, Endzustands-Checks und später
Sampling bewertet. Harte Publish-Gates: max 1 Pin-Preset/Seite, max 2 Parallax-Layer/Viewport,
RM-Pflicht, LCP-Schutz (kein Above-fold-`opacity:0` ohne Fallback).

**Betrachtete Optionen:**
- *Freie Timeline/Scrub-Editor (Framer-nah)* — vertagt auf M6. Presets + Intensity sind
  agent-native, deterministisch und entsprechen der Builder-Praxis (Webflow/Framer).
- *Motion (React) für alles* — verworfen: ADR-0003; der Bake hat für Content kein React,
  Scroll-Pinning bleibt GSAP-Territorium.
- *CDN statt self-hosted* — verworfen: externe Requests, keine eingefrorene Version, DSGVO.
- *Motion gar nicht in v2* — verworfen: Bestandsverlust, Framer-Niveau ist Produktziel.
- *Motion-Register als zweites Regel-System* — verworfen: Knotenfeld reicht; Wiederverwendung
  kommt über Slots/VCs/Templates (Phase 4).

**Konsequenzen:**
- Engine-Lock-in GSAP bleibt (wie ADR-0003); ein Wechsel wäre ein Rewrite aller Presets.
- Presets sind Code, die Spec ist Daten: neues Preset = Runner + Registry-Eintrag + Tests.
- Die Migration trägt `motion` mit (behebt den stillen Verlust); der irreführende
  Migration-Kommentar („nur `hidden` fällt weg") ist korrigiert.
- Release-Budget: Motion-JS ≤ ~150 KB ohne 3D (self-hosted eingefroren).
- Testpflicht: Mutationsprobe je Guardrail, Freeze-Gegenproben, bidirektionale
  Preset↔Runner-Abdeckung (Plugin-Lehren).
- **Site-Profile (F6, 18.09. entschieden):** Die v1-Tabelle (`clean` · `standard` ·
  `showcase`, Default `standard`, Intensity-Cap 3/7/10, Lenis aus/an/an, Pin 0/1/1,
  3D nein/nein/ja) gilt **unverändert** auch für v2. Durchsetzung gestaffelt (F7): M2 nutzt
  das Profil, wo der Bake es schon kennt (Lenis, `profile !== "clean"`); harte
  Caps/Preset-Klassen kommen mit den Publish-Gates in M5; das Profil erreicht den
  Editor erst mit einem eigenen Site-Settings-Ticket (vor M3). 3D bleibt M6.
- **Umsetzungsstand:** M0 (dieses ADR), M1 (Modell/Datenpfad), M2 (Runtime/Bake),
  M3 (Inspektor + MCP + Skill), M4 Stufe 2 (Play-Preview im Canvas) und M5
  (Profil-Gates + weiche Hinweise) sind am 18.09. umgesetzt. Offen: M4 Stufe 1
  (Live-Modus mit echter Seite, haengt an Ticket 03) und die optionale Scrub-Stufe (M6).

**Referenz:** `.scratch/motion-v2/research.md`, `plugin-analyse.md`, `preset-matrix.md`,
`payload-spec.md`, `freeze-spec.md`, `plan.md`; `docs/adr/0003-gsap-als-choreografie-kern.md`.
