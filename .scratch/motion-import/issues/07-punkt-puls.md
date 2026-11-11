# Puls-Punkt vor „200+ Firms already enrolled“

Status: ready-for-agent
Label: ready-for-agent

## Befund

Auf Relay `/` steht vor der Zeile „200+ Firms already enrolled“ ein 8 x 8 px großer Punkt (`fi-8a5eda-59`). Die Quelle rendert **einen** Punkt: Das Kästchen hat zwei Kinder, beide 8 x 8 px an derselben Stelle; das erste pulsiert (Inline `transform: translate(-50%, -50%) scale(0.353582)` mit `will-change: transform`, `opacity: 0.5`), das zweite ist der statische Punkt (`opacity: 1`). Der Build zeigt an derselben Stelle **zwei versetzte Punkte** (Ausschnitt `build-punkt.png` gegen `original-punkt.png`).

## Ursache (am Build gemessen)

- Der Build schreibt für `fi-8a5eda-60` `animation: senify-appear-n47-default 0.7s … both` mit `@keyframes senify-appear-n47-default{from{opacity:0.5;transform:none}to{opacity:0;transform:none}}`. Der Punkt blendet also **aus** statt zu pulsieren, und die Zentrierung fehlt.
- Die Zentrierung steht in der Quelle nur im Inline-Stil: `transform: translate(-50%, -50%) scale(...)`. Der Capture verschiebt einen Inline-`transform` mit `will-change: transform` nach `appearInitial` und löscht ihn aus dem visuellen Zustand (Regel für Scroll-Reveals und Varianten). Beim Punkt liefert die Klassenregel keine Ersatz-Zentrierung, deshalb bleibt im Desktop-Zustand `top: 50%; left: 50%` ohne `translate(-50%, -50%)`; das Element sitzt 4 px versetzt.
- Der gemessene Puls (`scale`, unendlich) ist nicht als Puls übernommen; übrig bleibt eine einmalige Ausblendung `0.5 → 0`.

## Nächster Schritt

1. Im Capture unterscheiden: Ein Inline-`transform` mit `will-change: transform` ist nur dann Startzustand, wenn die Klassenregel den Ruhezustand trägt. Trägt sie ihn nicht (nur `top/left`), bleibt der verschiebende Anteil (`translate`) im visuellen Zustand.
2. Im Appear-Compiler den gemessenen Puls erhalten (Iterationen unendlich) und die Keyframes mit der Zentrierung kombinieren, statt `transform:none` zu schreiben.
3. Test: Ein Punkt mit `translate(-50%, -50%) scale(...)` und `will-change: transform`, dessen Klassenregel keine Zentrierung nennt, bleibt im Desktop-Zustand zentriert; die Keyframes behalten das `translate` und enden nicht bei `opacity: 0`, wenn die Quelle weiterpulsiert.

## Abnahme

Der Ausschnitt bei 1440 px zeigt **einen** 8-px-Punkt, keinen versetzten zweiten Punkt; die Zentrierung ist im Desktop-Zustand vorhanden. Ein Test deckt den Fall ab. Der Live-Vergleich nennt Datum und Quelle.

## Belege

- `.scratch/framer/badge-quelle-2026-11-11.mts` (Quellstruktur und Inline-Stil)
- `.scratch/framer-live-2026-11-09/badge-2026-11-11/build-punkt.png` und `original-punkt.png`
- `.scratch/framer-live-2026-11-09/structure-relay7-2026-11-11/relay/before/assets/style-rules.css` (`@keyframes senify-appear-n47-default`, Regel `fi-8a5eda-60`)
- `packages/framer-import/src/capture-html.ts` (Inline-`transform` mit `will-change` → `appearInitial`)
