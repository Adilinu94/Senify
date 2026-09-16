# 11: Forms & Submissions

**What to build:** Native Formulare ohne externe Dienste: `contact`/`newsletter` mit Feldliste (text, email, phone, textarea, select, radios, checkbox, date, number; eindeutige Keys, Validierungsregeln) und Consent-Block (Pflicht, verlinkte Datenschutz-Seite); „Sammlung aus Formular anlegen" (ein Klick erzeugt Ziel-Collection + Felder + Status-Vorlage). Öffentlicher Endpoint auf der Engine mit signiertem Formular-Token (HMAC; im Bake eingestampft; cache-/cookielos), Spam-Schutz automatisch (Honeypot, Mindest-Ausfüllzeit < 2 s, Origin-Pflicht, Rate-Limits, Body-Cap, Feld-Whitelist), Validierung nur gegen den eingefrorenen Snapshot. Einsendungen werden Entries (Auto-Felder, sofort sichtbar bei schlanken supports); Benachrichtigungs-Mail als Job (Retry/Backoff) + Ansicht im Programm + CSV-Export; Newsletter mit Double-Opt-In (pending → Bestätigungsmail Token/TTL → confirmed; Abmeldelink → unsubscribed). Absenden progressiv: ohne JS → Danke-Seite; mit JS → Inline-Bestätigung. Harte Form-Checks bei Publish.

**Blocked by:** 09 (Content-Kern), 10 (Templates, Bindings & Loops — Seitenverweise/Checks).

**Status:** ready-for-agent

- [ ] Formular-Sektion konfigurieren → „Sammlung anlegen" erzeugt Collection samt Feldern; Felder validieren (Pflicht, Muster, Options)
- [ ] Bake stempelt Token; Absenden funktioniert mit und ohne JavaScript über denselben Endpoint (kein Logik-Drift)
- [ ] Spam-Schutz wirkt: Honeypot, zu schnelles Absenden, fremde Origin, Rate-Limit, unbekannte Felder → abgewiesen mit klarer Ursache
- [ ] Einsendung erzeugt Entry in der Ziel-Collection (Quellseite, Zeit, Consent-Doku) + Benachrichtigungs-Job; Job-Retry sichtbar
- [ ] DOI-Flow: Anmeldung → pending → Bestätigungsseite → confirmed; Abmelden → unsubscribed
- [ ] Hard-Checks bei Publish: Ziel-Collection existiert, Keys eindeutig, Consent mit Page-Link, Erfolgsseite existiert; SMTP-Test (weich)
- [ ] CSV-Export der Einsendungsansicht; MCP deckt Submissions über die Entry-Tools ab

Quellen: `artifacts/26`, Spec „Forms (Verträge)", `research/24` §5.4 (Jobs/Retry).

## Handoff (Stand 15.09.2026)

**Auftrag:** T11 vollständig umsetzen. Am Ende, **nur wenn `pnpm verify` grün ist**, selbst committen. Ist etwas rot, NICHT committen, sondern genau melden.

**Zusammenarbeit:** Im Arbeitsbaum arbeitet parallel eine andere Session an `packages/app`, `packages/mcp` (cli/config/package.json), `eslint.config.mjs` und `pnpm-lock.yaml` — diese Pfade NICHT anfassen, kein `git add -A`; nur `packages/engine packages/registry packages/renderer .scratch` stagen. Commit: Zeile 1 `T11: Forms & Submissions - <kurz>`, Leerzeile, `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`.

**Anlaufpunkte:** `artifacts/26` (Verträge), Spec „Forms (Verträge)", `research/24` §5.4 (Jobs/Retry). Code: `packages/engine/src/{content,lifecycle,store,http,db,types,rebake}.ts`, `packages/registry/src/sections/{contact,newsletter}.ts` + `components/{ContactForm,Newsletter}.tsx` (bestehende Sektionen, jetzt erweitern), `packages/renderer/src/bake.ts` (Token einstampfen), `packages/mcp/src/tools.ts` (nur ergänzen, bestehende Tool-Liste im Test nachziehen).

**Ist-Stand:** T01–T10, T15, T16 sind committet, `pnpm verify` grün. Content-Kern steht (Collections/Entries/Feldtypen/Versionen/Redirects/FTS), Bindings/Listen/Templates stehen (T10), Assets und Lifecycle stehen. Es gibt noch keine Formular-Logik: die Sektionen `contact` und `newsletter` sind reine Darstellungs-Bausteine.

**Priorität (bei knappem Budget der Reihe nach, halb Fertiges melden):**
1. **Formular-Modell + Bake-Snapshot:** Formular-Props in den Sektionen `contact`/`newsletter` (Feldliste mit Typen text|email|phone|textarea|select|radios|checkbox|date|number, eindeutige Keys, Validierungsregeln wie Pflicht/Muster/Min-Max, Options, Consent-Block mit verlinkter Datenschutz-Seite, Erfolgs-/Danke-Seitenverweis); beim Bake wird ein Formular-**Snapshot** eingefroren und ein **signiertes Token (HMAC)** in die Seite gestempelt; die Seite bleibt cache-/cookielos.
2. **Öffentlicher Endpoint:** `POST /api/forms/:formId/submit` (Token Pflicht, KEIN Bearer-Scope — der Token ist die Autorisierung), Validierung **nur gegen den eingefrorenen Snapshot**, Feld-Whitelist, Body-Cap, Origin-Pflicht, Rate-Limit, Honeypot-Feld und Mindest-Ausfüllzeit (< 2 s → abgewiesen); jede Ablehnung mit klarer Ursache (`spam`, `validation`, `rate_limited`, …) und ohne Datenleak.
3. **Einsendung → Entry:** angelegter Entry in der Ziel-Collection mit Auto-Feldern (Quellseite, Zeitpunkt, Consent-Dokumentation: Text + IP-Hash, nicht rohe IP); sofort sichtbar bei schlanken `supports`; „Sammlung aus Formular anlegen" (ein Klick erzeugt die Ziel-Collection samt Feldern und Status-Vorlage) über Vorschau + Bestätigung.
4. **Benachrichtigung als Job:** Outbox-Tabelle + Job mit Retry/Backoff, Zustellstatus sichtbar; Transport kapseln (Dev-Transport schreibt in die Outbox, SMTP nur wenn konfiguriert — der SMTP-Check bei Publish ist weich).
5. **Newsletter mit Double-Opt-In:** Anmeldung → `pending` → Bestätigungsmail mit Token + TTL → `confirmed`; Abmeldelink → `unsubscribed`; Zustandsübergänge idempotent, Token einmalig verwendbar.
6. **Progressive Absendung:** ohne JavaScript → POST auf den Endpoint mit Weiterleitung auf die Danke-Seite; mit JavaScript → Inline-Bestätigung über denselben Endpoint (kein zweiter Pfad, kein Logik-Drift).
7. **Publish-Hard-Checks:** Ziel-Collection existiert, Feld-Keys eindeutig, Consent verlinkt eine existierende Seite, Erfolgsseite existiert; Verstöße blockieren das Publish mit strukturierten Fehlern.
8. **CSV-Export + MCP:** Export der Einsendungen (CSV, Spalten aus dem Snapshot) als Engine-Route und Ansicht im Programm; Einsendungen bleiben über die Entry-Tools des MCP erreichbar.
9. **Tests (Prüfstelle 1 + 2):** Formular-Bake (Token im HTML, Snapshot stabil), Endpoint (gültige Einsendung erzeugt Entry; Honeypot/zu schnell/fremde Origin/Rate-Limit/Unbekanntes Feld/Body-Cap abgewiesen), DOI-Flow inklusive TTL und Doppelbestätigung, Job-Retry, CSV-Spalten, Publish-Checks, ein MCP-Fall.

**Randbedingungen:** Deutsch mit englischen Fachbegriffen; TypeScript strict/ESM; additive Tabellen (kein ALTER); keine ungenutzten Exporte; Kommentare sparsam; `pnpm verify` muss grün sein, inklusive aller bestehenden Tests.

## Umsetzungs-Notiz (Teil 1: Engine, Registry, Renderer, MCP)

- **Formular-Modell + Snapshot:** `packages/engine/src/forms-contract.ts` (TypeBox) und `forms.ts`; die Sektionen `contact`/`newsletter` konfigurieren Feldlisten (text, email, phone, textarea, select, radios, checkbox, date, number mit Pflicht/Muster/Min-Max und Options), Consent-Block mit verlinkter Datenschutz-Seite und Erfolgsseiten-Verweis; beim Bake wird ein Snapshot eingefroren und ein signiertes Token (HMAC) in die Seite gestempelt; `packages/renderer/src/forms.ts` + `astro-template/src/layouts/Page.astro` liefern das progressive Markup (ohne JS → Formular-POST mit Weiterleitung, mit JS → Inline-Bestätigung über denselben Endpoint).
- **Öffentlicher Endpoint:** `POST /api/forms/:formId/submit` mit Token als Autorisierung (kein Bearer-Scope), Validierung ausschließlich gegen den eingefrorenen Snapshot, Feld-Whitelist, Body-Cap, Origin-Pflicht, Rate-Limit, Honeypot und Mindest-Ausfüllzeit; Ablehnungen kommen mit klarer Ursache.
- **Einsendung → Entry:** Einsendungen werden Entries in der Ziel-Collection (Quellseite, Zeitpunkt, Consent-Text + IP-Hash, keine rohe IP); „Sammlung aus Formular anlegen" legt Collection samt Feldern und Status-Vorlage an.
- **Benachrichtigung:** additive Tabelle `notification_outbox` mit Retry/Backoff und Due-Index, Transport gekapselt (Dev-Transport = Outbox-Zeile, SMTP optional); Publish-Hard-Checks für Formulare in `checks.ts` (Ziel-Collection, eindeutige Keys, Consent-Verlinkung, Erfolgsseite).
- **Newsletter:** Double-Opt-In mit `pending → confirmed` über Token + TTL, Abmeldelink → `unsubscribed`, Übergänge idempotent.
- **MCP:** Formular-/Einsendungs-Tools ergänzt, Tool-Liste und Workflow-Test nachgezogen.
- **Tests:** `packages/engine/test/forms.test.ts` (12) plus der MCP-Fall; `pnpm verify` grün (45 Dateien, 327 Tests).

**Offen (Teil 2):**
- CSV-Export der Einsendungsansicht (Spalten aus dem Snapshot) — erledigt in Teil 2 (Engine-Route + Tests).
- Ansicht der Einsendungen und Job-Retry im Programm (gehört zur Programm-Shell T12).
- Volle E2E-Bake-Prüfung „Absenden ohne JS → Danke-Seite" gegen den gebackenen Zustand (aktuell über den Endpoint geprüft).

### Auftrag Teil 2 (Engine-only, für die ausführende Session)

**Ziel:** CSV-Export der Einsendungen als Engine-Route plus Test; **nichts in `packages/app` anfassen** (dort arbeitet parallel eine andere Session).

1. Neue Route `GET /api/forms/:formId/submissions.csv` (Scope `read`, Token des Programm-Zugriffs): Kopfzeile aus dem eingefrorenen Formular-Snapshot (Feld-Reihenfolge wie im Snapshot), danach eine Zeile je Einsendung (Entry in der Ziel-Collection), plus die Auto-Spalten Quellseite, Zeitpunkt, Status. Semikolon als Trennzeichen und korrektes Quoting nach RFC 4180 (Anführungszeichen verdoppeln, Zeilenumbrüche erlaubt), UTF-8 mit BOM, `Content-Disposition: attachment; filename="…csv"`.
2. Einsendungen kommen ausschließlich aus der Ziel-Collection des Formulars (kein site-übergreifender Zugriff, unbekanntes Formular → strukturierter 404).
3. Test in `packages/engine/test/forms.test.ts`: Kopfzeile entspricht dem Snapshot, Zeilen entsprechen den Einsendungen, Sonderfälle (Semikolon, Anführungszeichen, Umbruch, Umlaute) werden korrekt gequotet, fremdes/unbekanntes Formular abgewiesen.
4. `pnpm verify` grün; commit nur dann, Betreff `T11 (Teil 2): CSV-Export der Einsendungen - <kurz>`, Leerzeile, `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`; stagen nur `packages/engine .scratch/senify-v1-build/issues/11-forms-submissions.md`.

### Umsetzungs-Notiz (Teil 2: Engine-only)

- **CSV-Export:** `GET /api/forms/:formId/submissions.csv` (Scope `read`) liefert Semikolon-getrennte CSV nach RFC 4180 (Anführungszeichen verdoppelt, Umbruch im Feld erlaubt) mit UTF-8-BOM und `Content-Disposition: attachment; filename="submissions-<formId>.csv"`; die Kopfzeile kommt aus dem eingefrorenen Formular-Snapshot (Feld-Reihenfolge wie im Snapshot) plus den Auto-Spalten Quellseite, Eingegangen am (Zeitpunkt) und Status, je Einsendung eine Zeile.
- **Ziel-Collection statt Fremdzugriff:** `listSubmissions` liest ausschließlich die Ziel-Collection des Formulars; ein Snapshot, dessen Collection auf einer anderen Site liegt, und ein unbekanntes Formular werden als strukturiertes 404 (`not_found`) abgewiesen.
- **Tests:** `packages/engine/test/forms.test.ts` (14) prüft Kopfzeile/Zeilen gegen Snapshot und Einsendungen, BOM und Trennzeichen, Quoting der Sonderfälle (Semikolon, Anführungszeichen, Umbruch, Umlaute) sowie fehlenden Token (401) und fremdes/unbekanntes Formular (404).
- **`pnpm verify` grün** (57 Dateien, 435 Tests + 2 skipped).