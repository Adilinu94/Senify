# S0 — Messlauf: Befund (Framer-Import)

> Historischer Mess-Snapshot vom 23.09.2026. Die Rohzahlen sind Belegmaterial, keine aktuelle Teststatistik des Gesamt-Repositories. Aktueller Qualitätsstand: `docs/current/qualitaet.md`.

**Stand:** 23.09.2026 · **Werkzeug:** `.scratch/framer-import/messlauf.mjs`
**Datengrundlage:** drei statische Framer-Ausgaben aus `C:\Users\adini\FramerExport\`
(SSR-HTML + generiertes CSS; Puppeteer-Mirror von *Framer Export*).
**Reproduzierbar:** `node .scratch/framer-import/messlauf.mjs` (ohne Netz, ohne Browser;
rohe Zahlen in `messlauf.json`).

---

## 1. Die Zahlen

| | stupendous-football | fluffy-rectangle | easier-train |
|---|---|---|---|
| HTML | 293 KB | 597 KB | 923 KB |
| Elemente | 838 | 2 384 | 3 203 |
| CSS-Regeln / Deklarationen | 422 / 2 363 | 774 / 4 104 | 787 / 5 696 |
| verschiedene Klassen | 201 | 415 | 551 |
| davon **nur einmal** verwendet | 77 (38 %) | 132 (32 %) | 246 (45 %) |
| Textstil-Presets | 8 | 17 | 20 |
| Variantenklassen (`framer-v-*`) | 22 | 40 | 44 |
| `data-framer-name` (Ebenennamen) | 196 | 803 | 1 565 |
| Komponenten-Instanzen (`*-container`) | 50 | 214 | 233 |
| `position: absolute` | 20 | 26 | 35 |
| `display: flex` / `grid` | 45 / 0 | 129 / 3 | 142 / 5 |
| `transform` / `clip-path` | 3 / 0 | 0 / 0 | 1 / 0 |
| Deklarations-Dubletten | 47 Gruppen (84 überzählige Regeln) | 122 (249) | 100 (228) |
| verschiedene Farben | 28 | 56 | 35 |
| `@font-face` | 58 | 46 | 89 |
| Appear-Animationen (`data-framer-appear-id`) | 2 | 46 | 11 |
| `@keyframes` im CSS | 0 | 0 | 0 |
| Framer-Runtime im Mirror | nein | nein | nein |
| Abbildbare Knotenarten | 838 (100 %) | 2 384 (100 %) | 3 203 (100 %) |

Verteilung der Knotenarten (Beispiel `easier-train`): Container 1 856 · Text 762 · SVG 125 ·
Link 107 · Bild 89 · Überschrift 81 · Liste 14 — **jede** Elementart hat ein Senify-Primitiv
(`frame`/`column`/`grid`, `text`/`body`, `icon`/`embed`, `link`, `image`, `heading`, `list`).

---

## 2. Befunde

### B1 — **Appear-Animationen sind statisch lesbar** (der wichtigste Fund)

Die SSR-Ausgabe trägt die kompletten Parameter als JSON:

```html
<script type="application/json" id="__framer__appearAnimationsContent">
{"14oj8tp":{"default":{"initial":{"opacity":0.001,"y":-50,"scale":1,"rotate":0},
                       "animate":{"opacity":1,"y":0,"x":0,
                                  "transition":{"type":"spring","damping":30,"mass":1,
                                                "stiffness":160,"delay":1.6}}},
           "t5bde7":{ … Tablette … }, "12dc1ih":{ … Mobil … }}, …}
```

Belegt in `framer-fluffy-rectangle-418998/index.html`. Damit gilt:
**Appear-Effekte brauchen keinen Browser** — Startwerte, Endwerte, Achsen (x, y, scale,
rotate, opacity), Federparameter (`type`, `damping`, `mass`, `stiffness`, `delay`) **und**
die Breakpoint-Varianten liegen als Text vor. Das entlastet den Plan erheblich: der teuer
veranschlagte Teil „Animationen messen" betrifft nur noch **Scroll-, Hover- und Klick-Interaktionen**.

### B2 — **Framer-Breakpoints sind statisch lesbar**

```html
data-framer-custom-breakpoints="[{&quot;hash&quot;:&quot;72rtr7&quot;,&quot;mediaQuery&quot;:&quot;(min-width: 1200px)&quot;},
                                 {&quot;hash&quot;:&quot;t5bde7&quot;,&quot;mediaQuery&quot;:&quot;(min-width: 810px) and (max-width: 1199.98px)&quot;},
                                 {&quot;hash&quot;:&quot;12dc1ih&quot;,&quot;mediaQuery&quot;:&quot;(max-width: 809.98px)&quot;}, …]"
```

Drei Stationen (≥ 1200 / 810–1199,98 / ≤ 809,98) — die Standard-Breakpoints der Vorlagen.
Das Mapping auf Senify (1440 / 1024 / 390) ist damit **belegbar** statt geraten, und die
Appear-Parameter (B1) hängen bereits an genau diesen Hashes.

### B3 — **Komponentengrenzen sind indirekt sichtbar**

`framer-14oj8tp-container` (50 / 214 / 233 Vorkommen) markiert Komponenten-Instanzen,
`data-framer-name` liefert die Ebenennamen aus dem Framer-Canvas (196 / 803 / 1 565).
Die Klassensignatur `framer-<id>-container` ist ein stabiler Anker für die
Instanz-Erkennung auf dem Link-Weg — die Grenze muss also nicht geraten werden.
Der Plugin-Weg liefert dieselben Grenzen direkt (`isVariant`, `componentIdentifier`).

### B4 — **Das CSS ist vollständig abbildbar**

Die häufigsten Properties sind genau die, die Senify führt: `width`, `height`, `position`,
`flex`, `display`, `padding`, `gap`, `overflow`, `align-items`, `place-content`, `flex-flow`,
`color`. Absolut positioniert sind nur 20–35 Knoten je Seite (2–4 %), `transform` praktisch
nur aus den Appear-Startzuständen. **Kein Framer-Konstrukt fällt durch die Wert-Grammatik.**

### B5 — **Deklarations-Dubletten: 20–30 % der Regeln sind redundant**

47/122/100 Gruppen mit identischem Deklarationssatz (84/249/228 überzählige Regeln).
Gleichzeitig sind 32–45 % der Klassen nur ein einziges Mal verwendet.
Für den Mapper heißt das: **Deklarationen zusammenfassen, nicht Klassen kopieren** — die
geplante `class`-Konsolidierung (Plan D3) spart messbar 20–30 % Regeln, ohne etwas zu verlieren.

### B6 — **Nur Appear ist im HTML; Scroll/Hover/Klick nicht**

0 `@keyframes`, keine Framer-Runtime im Mirror, 2/46/11 Appear-Ids. Die Scroll- und
Hover-Interaktionen stecken in JS-Modulen (`scripts/modules/*.js`,
`scripts/vendor/chunk-*.mjs`) — bis zum Beweis des Gegenteils bleiben sie Sache der
Browser-Probe (F4, `motion-probe.js`) und damit Stufe 2/§4.4.

### B8 — **Framer animiert nicht mit GSAP — der Messkanal ist ein anderer**

Gemessen mit `motion-lauf.mjs` an der lokal gespiegelten Seite (Playwright,
Instrumentierung vor der Seiten-Runtime):

| Kanal | Befund (`fluffy-rectangle`) | Befund (`stupendous-football`) |
|---|---|---|
| `animationStack` | `lenis`, `css-keyframes`, **`three.js`** | `lenis` |
| ScrollTrigger / GSAP-Tweens | **0 / 0** | **0 / 0** |
| WAAPI | 1 (1 CSS) | 1 |
| IntersectionObserver | **27 Registrierungen** | **34** |
| Eingabe-Treiber | pointermove, mouseenter/leave, mousemove, scroll, wheel, touchmove, resize, keydown | dito (ohne keydown) |
| CSS-Übergänge | z. B. `color 0.2s cubic-bezier(0.12, 0.23, 0.5, 1)` ×7, `opacity 0.25s ease-in-out` | – |
| `window.animator` | existiert, aber **nur 4 Mitglieder** (`animateAppearEffects`, `getActiveVariantHash`, `spring`, `startOptimizedAppearAnimation`) — **kein Animations-Inventar** | dito |
| Statische Datenkanäle | `__framer__appearAnimationsContent` **14 949 B**, `__framer__breakpoints` 378 B, `__framer__handoverData` 3 650 B | dito |

**Folgen:**
1. Der GSAP-zentrierte Probe (`motion-probe.js`) ist für Framer **nahezu wirkungslos** — für Seiten, die mit GSAP arbeiten, bleibt er wertvoll, für Framer braucht es die statischen Datenkanäle (B1/B2) + IO-Instrumentierung + einen eigenen Sensor für Scroll-Transforms.
2. Framer exponiert **kein** Animations-Inventar über die Runtime (kein `ScrollTrigger.getAll()`-Äquivalent). Was nicht im HTML-JSON steht, muss **beobachtet** werden (Zustandsvergleich vor/nach Scroll bzw. Hover).
3. **three.js ist real im Einsatz** (ein Template hat eine 3D-Fläche) → die Island-Strecke aus Plan §4.4 ist kein theoretischer Fall.
4. Lenis (Smooth-Scroll) ist aktiv und per Markup erkennbar — Senify führt das über das Site-Profil, der Import muss es erkennen und melden.

### B9 — **Der statische Datenkanal ist größer als gedacht**

`framer/appear`-Skriptblöcke mit 14,9 KB Animations-JSON je Seite, dazu `breakpoints` und
`handoverData`. Der Import liest diese drei Blöcke in S1 mit — sie liefern Animationsparameter,
Breakpoint-Mapping und Übergabe-Kontext kostenlos, deterministisch und ohne Browser.

### B7 — **Der SSR-Zustand ist nicht der Endzustand** (Falle für das Import-Gate)

Der Startzustand steht inline: `style="opacity:0.001;transform:translateY(-50px)"`.
Eine Framer-Seite startet also **unsichtbar** und blendet per JS ein. Das Import-Gate darf
deshalb **nicht** gegen den SSR-Zustand messen, sondern gegen den `animate`-Zustand aus B1 —
sonst vergleicht man eine Senify-Seite gegen halb unsichtbare Elemente. Senifys eigener
Bake friert genau diesen Endzustand ein (`motion: "off"` im Visual-Harness) — die Regel ist
schon da, sie muss nur auf Framer angewandt werden.

---

## 3. Was der Befund am Plan ändert

| Betroffen | Vorher | Nach S0 |
|---|---|---|
| Animationen (S8) | „alles messen" | **Appear aus dem HTML lesen** (14,9 KB JSON, exakt); IO-Reveals messbar (27–34); Hover über CSS-Übergänge/Variantenklassen; Scroll-Transform braucht einen **eigenen Sensor** (B8). GSAP-Probe ist für Framer wirkungslos → Werkzeug zuschneiden |
| 3D/Shader | theoretischer Fall | **belegt** (`three.js` in der Animationskette, B8) → Island-Strecke und `webgl-scene` sind Pflichtteil, nicht Option |
| Breakpoints (S1) | Mapping auf drei Stationen „nach Gefühl" | Mapping per `mediaQuery`-Liste (B2); die Appear-Parameter liegen schon je Station vor |
| Knotenzahl / Aufwand | unbekannt | 838–3 203 Knoten, 2 363–5 696 Deklarationen je Seite → **Regel-Flut ist real** (Risiko 2), die Konsolidierung ist Pflicht |
| Komponenten (S6) | Grenzen im Link-Weg raten | Anker `*-container` + `data-framer-name` belegt (B3) |
| Import-Gate (S5) | „Motion einfrieren" | konkrete Regel: gegen `animate`-Zustand messen, SSR-Startzustand ist unsichtbar (B7) |
| Testeingaben | geplant | die drei Ausgaben sind echte, lokal vorliegende Fixtures |

**Neue Aufgaben, die aus S0 folgen**

1. `capture-html.ts` liest zusätzlich `__framer__appearAnimationsContent` und
   `data-framer-custom-breakpoints` (Typen im IR ergänzen: `appear`, `breakpoints`) — S1.
2. Der IR braucht eine **Regel-Konsolidierung** als eigenen, getesteten Schritt (nicht als
   Nebeneffekt des Mappers) — S1.4 wird zur eigene Aufgabe mit Messwert.
3. `motion-probe` ist **nur** für Scroll/Hover/Klick nötig — S2 bleibt, wird aber kleiner.

**S3b (23.09. umgesetzt):** Island-Payload steht als Transport für Klasse C bereit (ADR-0010):
Ablage `site_code_payloads` + Routen, Island-Typ `payload` mit Mount-Vertrag
(`export function mount(stage, options)`), Datei `assets/payloads/<id>.<hash8>.js` im
Bake-Ausgang, Profil-Budgets (1/3/8) und Größen-Grenzen, dreistufiger Rückfall
(Payload → Poster → Platte) mit `payload-missing`-Warnung. Damit ist der s0-Befund
„three.js in der Animationskette“ adressierbar, ohne den Baum zur Code-Ablage zu machen.

**Größenmessung nachgeholt (23.09., 2. Runde):** Das gebundelte WaveBackground-Modul
(esbuild, three.js + React aus dem eigenen Repo, unminifiziert) wiegt **2,78 MB** — gemessen
im Nachweis-Lauf (`nachweis/wave-payload.mjs` + `beweis-lauf.mjs` + `live-check.mjs`: Canvas
rendert im echten Release, `data-payload-state="mounted"`). Die anfänglichen 512 KB/1,5 MB
wären an jeder echten 3D-Island gescheitert; die Budgets stehen jetzt auf **3 MB je Payload /
8 MB je Seite** (`guardrails.ts`, ADR-0010 §6). Beim Bündeln gefundene Bugs (gefixt):
Shim-Ersetzung ohne Aufruf (`(() => {…})` statt `(() => {…})()`) und `React.createRoot`
statt `ReactDOM.createRoot` im Mount-Vertrag.

---

## 4. Offene Punkte (S0) — Stand 23.09. 2. Runde: geschlossen

| # | Punkt | Ergebnis |
|---|---|---|
| 1 | Lesen die Plugin-Traits Scroll-/Hover-Interaktionen? | **Vorläufig nein** (bleibt offen bis ein echtes Plugin-Projekt vorliegt; Traits-Matrix kennt nur `gesture`). Der statische Kanal (`appear`/`breakpoints`/`handover` im SSR-HTML) macht den Plugin-Weg nicht nötig. |
| 2 | Wie viele Scroll-/Hover-Interaktionen hat eine Seite real? | **Beantwortet** (B8 + Nachmessung): IO-Registrierungen 27/34/198 je Export, 0 GSAP, 0 ScrollTrigger-Tweens. Die WAAPI-Zähler sind **Appear-Animationen**, keine Loops — verifiziert mit `getAnimations()`: auf `easier-train` laufen 5 Animationen, davon 2 × Ticker-Marquee (UL „Top Ticker"/„Bottom Ticker", translateX 0→±4192 px, Dauer 139 733 ms ≈ 140 s, `iterations: null` = Endlos-Loop) und 3 × Appear (SPAN „Title", blur 10px→0 und opacity 0,001→1, je 600 ms). Das ist die **einzige echte Loop-Form** in den drei Exporten; alles andere ist Appear/IO. |
| 3 | `@font-face` 46–89 Vorkommen | **Beantwortet**: es sind Subsets — auf der Live-Seite (`font2yeux.github.io`) 51 `@font-face` bei einer Familie (Inter, 6 Gewichte × 8 Subsets + Placeholder-Fallback). Die 8 Subsets decken Kyrillisch/Griechisch/Vietnamesisch/Latin ab. Font-Strategie: Task 2.3b (DSGVO: Dateien holen, deduplizieren, self-hosted) — **umgesetzt 23.09. (4. Runde)**: `assets.ts` holt die Dateien, dedupliziert über (SHA-256, `unicode-range`) und schreibt die IR-`src`-Listen auf lokale Pfade um; keine framerusercontent-URL überlebt den Import. |
| 4 | Größe des Live-Renderings | **Beantwortet**: Live-Lauf gegen `https://font2yeux.github.io/` (das einzige lebende Framer-Pendant; `yeuxtest.framer.website` und die drei `<name>.framer.website`-URLs sind 404 — die Spiegel sind die einzige verlässliche Quelle). Live: **48 Requests, 12,30 MB CDN-Bytes, 675 DOM-Knoten, 378 CSS-Regeln, 51 `@font-face`, 0 Page-Errors**, IO 3 (der Spiegel-Export hat mehr IO, weil Subpages mitgeladen werden), Framer-Globals vorhanden (`__framer_importFromPackage`, `MotionIsMounted`, …), `animate`-Opacity nach Settle = 1 (SSR-Startzustand 0,001 — bestätigt den B7-Befund am Live-Objekt). Skripte: `live-probe.mjs`, `live-probe-settle.mjs`, `live-probe.json`. |
| 5 | Wie viele Knoten sind echte Duplikate je Breakpoint? | Im Mapper verifizieren (S1.5, Geräte-Merge) — Zählung bleibt Aufgabe des Mappers, `ssr-variant`-Wrapper 45/64/83 als Ausgangszahl. |
