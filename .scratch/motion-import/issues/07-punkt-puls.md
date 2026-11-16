# Puls-Punkt vor „200+ Firms already enrolled“

Status: resolved 11.11.2026
Label: ready-for-agent

## Befund

Auf Relay `/` steht vor der Zeile „200+ Firms already enrolled“ ein 8 x 8 px großer Punkt (`fi-8a5eda-59`). Die Quelle rendert **einen** Punkt: Das Kästchen hat zwei Kinder, beide 8 x 8 px an derselben Stelle; das erste pulsiert (Inline `transform: translate(-50%, -50%) scale(0.353582)` mit `will-change: transform`, `opacity: 0.5`), das zweite ist der statische Punkt (`opacity: 1`). Der Build zeigte an derselben Stelle **zwei versetzte Punkte** (Ausschnitt `build-punkt.png` gegen `original-punkt.png`).

## Ursache (drei Stellen, alle am Build gemessen)

1. **Keyframe-Namen kollidierten zwischen Seiten.** Der Name war `senify-appear-<appearId>-<variante>`, und die Appear-ID ist der Stempel-Schlüssel des Browsers, der auf jeder Seite bei `n…` beginnt. Im gemeinsamen `style-rules.css` überschrieb die zweite Seite (`n47`, `0.001 → 1`) den Punkt der Startseite (`0.5 → 0`). Gemessen: 2 Definitionen von `senify-appear-n47-default` in Relay7, die zweite gewann.
2. **Ein reiner Fade schrieb `transform:none`.** Der Keyframe überschrieb damit die Zentrierung des Elements für die Dauer des Effekts.
3. **Die Inline-Zentrierung wanderte nach `appearInitial`.** `will-change:transform` mit `translate(-50%, -50%) scale(...)` schob den ganzen Transform in den Startzustand; die Klassenregel trägt die Zentrierung nicht, also blieb `top:50%; left:50%` ohne `translate` und der Punkt saß 4 px versetzt.

## Korrektur

- `compileAppearRules` nimmt die Seitenscope in den Keyframe-Namen: `senify-appear-<scope>-<appearId>-<variante>`. Relay9: 216 Keyframes, 0 doppelte Namen.
- `frameOf` schreibt `transform` nur, wenn der Variantenzustand wirklich einen Transform-Kanal hat (`hasTransformChannel`). Ein reiner Fade lässt den Transform des Elements stehen.
- `splitAppearTransform` trennt eine prozentuale `translate`-Zentrierung vom Bewegungsanteil. Der Capture hält die Zentrierung im visuellen Zustand und verschiebt nur `scale`, `rotate`, `skew` und Pixel-Translates nach `appearInitial`.

## Ergebnis 11.11.2026

- Relay9 (Live-Quelle `https://gracious-balance-599544.framer.app`, 11.11.2026): Basisregel des Punkts `width:8px; border-radius:125%; transform:translate(-50%, -50%)`; Keyframes `senify-appear-8a5eda-n47-default{from{opacity:0.5}…}` ohne `transform`.
- Messung im Build bei 1440 px: Knoten `fi-8a5eda-60` und `fi-8a5eda-61` liegen beide auf `608,161` mit 8 x 8 px; der Fade-Knoten steht nach dem Abschluss auf `opacity:0`, der statische Punkt bleibt sichtbar. Ausschnitt `build-punkt-relay9.png` zeigt einen Punkt wie die Quelle.
- Frischer IR-Capture: Desktop 8 px, Tablet 8 px, Mobil 48 px, Zentrierung in allen Zuständen. Relay8 hatte an dieser Stelle einen Ausreißer der veränderlichen Live-Quelle (Desktop-Zustand 48 px); Relay9 und der frische Capture stimmen.
- Tests: `appear-channel.test.ts` (Zentrierung bleibt, Bewegung wandert), `appear-css.test.ts` (Namenscope, Fade ohne `transform`). Framer-Import-Suite 584 bestanden, 2 übersprungen; Typecheck und Lint grün.

## Grenze

Der Skalierungspuls der Quelle läuft über Framer-Motion im JavaScript und erscheint nicht als WAAPI-Keyframe; gemessen ist nur die einmalige Deckkraft-Einblendung `0.5 → 0`. Der Build hält deshalb den Ruhepunkt und die gemessene Einblendung, reproduziert aber den Puls selbst nicht. Das ist eine benannte Grenze, kein stiller Verlust.

## Belege

- `.scratch/framer/badge-quelle-2026-11-11.mts` (Quellstruktur und Inline-Stil)
- `.scratch/framer/quelle-regel-2026-11-11.mts` (Quellregeln: generisch 8 px, variantengebunden 48 px)
- `.scratch/framer/punkt-ir-2026-11-11.mts` (IR-Zustände: Desktop 8 px, Mobil 48 px)
- `.scratch/framer/punkt-build-2026-11-11.mts` (Build-Messung und Ausschnitt)
- `.scratch/framer-live-2026-11-09/badge-2026-11-11/build-punkt.png`, `original-punkt.png`, `build-punkt-relay9.png`
- `.scratch/framer-live-2026-11-09/structure-relay9-2026-11-11/relay/before/assets/style-rules.css`
- `packages/framer-import/src/appear-css.ts`, `capture-html.ts`; `packages/framer-import/test/appear-css.test.ts`, `appear-channel.test.ts`
