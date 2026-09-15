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