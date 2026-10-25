# Importierter Fremd-Code: Island-Payload mit Herkunft, Version und Lizenz

Status: accepted · 23.09.2026
Bezug: ADR-0001 (JSON-first, „Eskalationsstufe echter Custom-Code"), ADR-0005 (offenes CSS,
Wert-Grammatik als Sicherheitsgrenze), ADR-0006 (Motion-Authoring), Verbesserungsplan L31/I36,
`.scratch/framer-import/research.md`, `plan.md`, `befund.md`.

Der Framer-Import soll eine **1:1-Kopie** ergeben (Nutzerentscheidung vom 23.09.2026). Für Code
Komponenten, Overrides, Fremd-Widgets und Shader-Flächen kann Senify das in Primitiven nicht
leisten — der S0-Messlauf hat das nicht als Randfall, sondern als Regelfall belegt: in
`framer-fluffy-rectangle-418998` steht **`three.js` in der Animationskette**, die Module liegen als
`scripts/modules/*.js` und `scripts/vendor/chunk-*.mjs` daneben, und die Framer-Runtime ist kein
GSAP (0 ScrollTrigger, 0 Tweens gemessen). ADR-0001 hat diesen Fall ausdrücklich vorgesehen:
„Eine spätere Eskalationsstufe (echter Custom-Code) müsste bewusst als Modell-Erweiterung
eingeführt werden — nicht als Hintertür." Dieser ADR ist diese Eskalation.

**Entscheidung.** Importierter Fremd-Code lebt in Senify als **Island-Payload**: ein
versioniertes Code-Paket **neben** dem NodeTree — niemals im Baum.

1. **Der Baum bleibt Daten.** Kein Knoten trägt Code. Ein Payload-Träger ist ein normaler Knoten
   mit `props.payloadId`; das Dokument bleibt diffbar, patchbar und undo-fähig (ADR-0001 bleibt
   unangetastet).
2. **Ablage.** Neue Tabelle `site_code_payloads` (`id`, `site_id`, `kind`, `bundle`, `bytes`,
   `integrity`, `version`, `provenance`, `license`, `created_at`) und im Bake-Ausgang die Dateien
   `assets/payloads/<id>.<hash>.js`. Das Payload ist **Teil des Build-Hash** — eine Änderung
   erzeugt ein neues Release, kein Drift.
3. **Herkunft ist Pflicht.** `provenance { kind: "framer-import" | "upload" | "hand", sourceUrl,
   pagePath, irHash, capturedAt }`. Ohne Quelle gibt es kein Payload; „die Datei kam irgendwoher"
   ist keine Herkunft.
4. **Lizenz ist Pflicht und darf `unknown` sein — aber sichtbar.** `license { id, note, assertedBy }`
   wird im Import-Bericht, im Release-Manifest und im Bausteine-Workspace angezeigt. Ein Payload
   mit `unknown` darf **nicht** in die globale Baustein-Bibliothek gehoben werden (sonst wandert
   fremder Code in alle Projekte) und wird im Release-Manifest als „Lizenz ungeprüft" geführt.
5. **Ein neuer Island-Typ `payload`.** `IslandKind` in `packages/renderer/src/islands.ts` ist eine
   geschlossene Union — dieser Zutritt ist die Erweiterung. Je Payload-Id wird höchstens **ein**
   Host-Element bedient (Dedupe über die `data-island`-Suche in `renderIslandsScript`).
6. **Budgets und Gates** (per Messung nachgezogen 23.09.2026; die Guardrails erheben sie):
   höchstens 1 Payload-Knoten je Seite im Profil `clean`, 3 in `standard`, 8 in `showcase`;
   eine Payload ≤ 3 MB unkomprimiert, Seitenbudget ≤ 8 MB zusätzliche JS-Bytes. Messung:
   das gebundelte WaveBackground-Modul (three.js + React inlined, unminifiziert) wiegt
   2,78 MB — ein echtes Framer-Modul muss als ein Payload passen. `webgl-scene`
   und `payload` teilen sich einen Zähler „schwere Fläche" (bestehendes Muster:
   `MAX_PINS_PER_PAGE`, `sceneNodes` in `packages/engine/src/guardrails.ts`).
7. **Rückfall in drei Stufen ist Pflicht.** Payload lädt nicht → **Poster** (`posterAssetId`,
   Pflicht beim Import, kommt aus der Quelle) → Poster fehlt → **Platte** mit genanntem Grund.
   Kein stiller Abriss; dieselbe Regel wie überall im Projekt („ehrliche Rückmeldung").
8. **Sicherheit: der Code ist die Grenze, nicht die Grammatik.** Ein Payload ist ausführbarer
   Code und damit **außerhalb** der Wert-Grammatik (ADR-0005) — daraus folgt:
   - Payloads laufen **nur in Preview und Release**, **nie im Editor-Canvas**. Der Canvas zeigt
     Poster bzw. Platte; der Editor bleibt frei von Fremd-Code-Ausführung.
   - Eingebunden wird ausschließlich aus dem eigenen Bake-Ausgang (keine Fremd-URL zur Laufzeit,
     kein `//`-Host, keine `data:`-SVG-Umwege — dieselbe Härte wie bei `url()` in ADR-0005).
   - `integrity` (SHA-256) steht im Manifest und wird beim Deploy geprüft; `deploy.ts` kopiert
     `assets/` mit, der Swap bleibt atomar.
   - Das Anlegen eines Payloads ist ein **Schreibvorgang mit Audit**; MCP nur mit `write`-Scope.
     Die Herkunft stammt aus dem Import-Kontext — ein Agent kann keine beliebige `sourceUrl`
     erfinden. Veröffentlichen entscheidet der Betreiber (Publish-Regel bleibt).
   - Eine Vorschau ohne Dateiserver (`selfContained`) kann keine Islands laden: dort erscheint
     das Poster. Das ist gewollt und getestet (`bake.ts:314`), kein Bug.
9. **Was der Editor kann — und was nicht.** Editierbar: Position, Größe, Sichtbarkeit, Motion,
   Payload-Auswahl, Poster, Alternativtext, „im Original öffnen" (`provenance.sourceUrl`).
   **Nicht** editierbar: die Innereien des Payloads. Das ist die Preisangabe zur 1:1-Zusage und
   steht so im Import-Bericht.
10. **Abgrenzung bleibt scharf.** Motion läuft weiter über den Motion-Kanal (ADR-0006) — ein
    Payload ist kein Ersatz für Presets, sondern nur für das, was Presets nicht können. CSS bleibt
    offen (ADR-0005), `rawCss` bleibt auf `@keyframes` beschränkt.

**Betrachtete Optionen:**
- *Fremd-Code in den Baum legen (neues Primitiv mit Code-Eigenschaft)* — verworfen: das Dokument
  ist die diffbare Wahrheit; Code darin bricht Review, Undo und Patch-Modell, und jeder Agent
  könnte beliebigen Code in den Vertrag schreiben. Genau die Hintertür, die ADR-0001 ausschließt.
- *Das CSS-Ventil erweitern (`rawCss` für HTML/Skript)* — verworfen: die Wert-Grammatik und der
  `rawCss`-Deckel sind die **Sicherheitsgrenze** (ADR-0005). Ein HTML-Ventil wäre der
  Denylist-Umweg, den ADR-0005 als Rückfall ausgeschlossen hat.
- *`embed` als Code-Schleuse umbauen* — verworfen: `embed` erlaubt nur https von erlaubten
  Anbietern und hat keine Kinder; die Anbieter-Liste würde zur Umgehung.
- *Nur Platte plus Bericht* — verworfen (Nutzerentscheidung): eine Platte ist keine 1:1-Kopie.
  Die Platte bleibt als **letzte** Stufe erhalten.
- *Payloads auch im Editor-Canvas rendern* — verworfen: der Editor lädt damit fremden Code im
  eigenen Arbeitskontext; Poster und Platte genügen zum Editieren, der Live-Modus zeigt die
  echte Seite.
- *Payload ohne Lizenzfeld, Bibliothek sofort global* — verworfen: fremder Code wanderte
  ungprüft über Bausteine in alle Projekte.

**Konsequenzen:**
- `IslandKind` wächst um `payload` (`packages/renderer/src/islands.ts`), `renderIslandsScript`
  (`packages/renderer/src/motion.ts:539`) und der Bake-Schritt (`packages/renderer/src/bake.ts`,
  Muster `assets/islands.js` und das three-Bundle) ziehen nach.
- Der Bundle-Schritt nutzt esbuild zur Bake-Zeit nach dem Vorbild `webgl-vendor.ts` (Version im
  Banner, ein Test pinnt sie) — kein zweites Bundling-Verfahren.
- Poster sind Assets: Medien-Pipeline, Dedupe, Alt-Text-Pflicht.
- Der Import-Bericht nennt je Payload Quelle, Lizenzstand, Größe und Rückfallverhalten; das
  Import-Gate **maskiert** Payload-Flächen beim Pixel-Vergleich (sie rendern nicht deterministisch),
  wie beim GPU-Masking im Referenz-Verfahren.
- Neue Tests: Poster-Rückfall, Platten-Rückfall, Budget-Gate, Integritätsprüfung, „kein Payload
  im Canvas".
- **Offen:** reale Größe gebundelter Framer-Module (S0 hat die Dateien
  gesehen, nicht gewogen), und die Lizenzfrage für kommerzielle Kundenarbeiten — dieselbe
  Nachweispflicht wie im Nachtrag zu ADR-0008.
- **CSP ist gesetzt (23.10.2026).** Preview- und Release-HTML antworten mit
  `Content-Security-Policy` (`packages/engine/src/http-build-files.ts`, `PAGE_CSP`).
  Die Policy beschränkt die **Herkunft** — `default-src 'self'`, `object-src 'none'`,
  `base-uri 'self'`, `frame-ancestors 'self'` — und lässt Inline-Code zu
  (`'unsafe-inline'`): der Bake schreibt Inline-`<style>`- und `<script>`-Blöcke, eine
  Hash-Policy müsste jede Seite einzeln hashen und bräche bei der nächsten Änderung.
  Die Grenze, um die es hier geht, ist die Origin, nicht die Inline-Form.
  Damit sie trägt, schreibt der Import die Adressen der Quelle um: Markup (`src`,
  `poster`, `href`, `srcset`, `url()` im `style`), CSS **und** die Runtime-Daten (die
  Bilder entstehen dort per `new URL(...)`). Gemessen an `unifiersofjapan`: 76
  CDN-Adressen im Bundle, nach der Umschreibung 4 — zwei davon sind der „Made in
  Framer"-Editor-Badge, den die Policy blockt (gewollt). Der Payload setzt dafür einen
  `URL`-Shim ein: `new URL` ohne Basis wirft bei einem wurzelrelativen Pfad.

**Referenz:** `packages/renderer/src/islands.ts`, `packages/renderer/src/motion.ts`
(`renderIslandsScript`), `packages/renderer/src/bake.ts` (Island-Dateien, `selfContained`-Hinweis),
`packages/renderer/src/webgl-vendor.ts` (esbuild-Bake-Bundle), `packages/engine/src/guardrails.ts`
(Profile, Pin-/Szenen-Gates), `packages/engine/src/db.ts` (Ablage-Muster), `packages/registry/src/components/Scene.tsx`,
`packages/widget-engine/src/catalog.ts` (`embed`), `docs/adr/0001`, `docs/adr/0005`,
`.scratch/framer-import/{research,plan,befund}.md`.
