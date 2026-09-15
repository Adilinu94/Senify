# Forms: Native Formulare & Submissions

Type: grilling
Status: resolved
Blocked by: 22

Input: research/26-instatic-delta.md
Input: artifacts/13-aeo-quality.md

## Question

Wie baut Senify native Formulare (Sektion `contact` u. a.) inkl. Submissions?

- **Formular-Primitives:** Feldtypen (text/email/textarea/select/checkbox/date …), Validierung (client + server), Spam-Schutz — Instatic nutzt einen **In-Memory-Challenge-Store** (Single-Instanz-Grenze!); reicht das in der lokalen Ein-Instanz-Welt oder brauchen wir mehr?
- **Submission-Speicherung:** Instatic-Muster „keine eigenen Tabellen" — `createDataRow` in Ziel-Daten-Tabellen + Event (`content.entry.created`, Actor `system`); oder eigene `Submission`-Entität (Modell 01) mit Export? Snapshot-Verhalten beim Publish klären.
- **Benachrichtigung:** Inbox im Programm? E-Mail-Versand (lokal)? Webhook?
- **Agenten-Sicht:** MCP-Tools für Submissions (list/read/export) + Scope-Zuordnung (Ticket 10).
- **DSGVO:** Löschkonzept, Aufbewahrung, Export (EU-lokal).
- Formular-Definition in der Section (`fields[]` aus Katalog 08: `contact`/`newsletter`) ↔ Backend-Vertrag.

Ergebnis: Forms-Konzept v1 (Primitives + Submissions + Betrieb).

## Answer

**Entschieden am 15.09.2026 (Wizard, 9/9) — Artefakt: [artifacts/26-forms.md](../artifacts/26-forms.md)**

- **Einsendungen = normale Entries** in einer Ziel-Sammlung („Kontaktanfragen" als Vorlage); kein Sondersystem, Entry-Tools (inkl. FTS-Suche, Trash, CSV-Export) decken alles ab.
- **Formular-Modell:** `contact`/`newsletter` werden nativ (Katalog-Delta zu 08) mit Feldliste im Editor (Text/E-Mail/Telefon/Nachricht/Auswahl/Checkbox/Datum/Zahl) + Komfort „Sammlung aus Formular anlegen"; Consent-Block ist Pflicht.
- **Empfänger:** Senify-Endpoint auf dem EU-VPS (lokal für Tests); beim Bake wird ein **signiertes Formular-Token** in die Seite gestempelt (cache-sicher, statisches Hosting-fähig); Validierung gegen den eingefrorenen Formular-Snapshot, nie gegen Client-Angaben.
- **Spam-Schutz automatisch:** Honeypot, Mindest-Ausfüllzeit, Origin-Pflicht, Rate-Limits — kein Captcha.
- **Benachrichtigung:** E-Mail (SMTP in Einstellungen) als Job mit Retry + Ansicht im Programm.
- **Nach dem Senden:** progressiv — Danke-Seite ohne JS, Inline-Bestätigung mit JS (gemeinsame Validierung).
- **Newsletter:** Double-Opt-In (pending → confirmed → unsubscribed) mit Bestätigungs-/Abmeldelink; **Kampagnen-Versand ist v2** (in Map „Out of scope" notiert).
- **DSGVO:** Zustimmung dokumentiert; Aufbewahrung bis gelöscht (Trash).
- **Checks:** Formular-Konfiguration hart bei Publish validiert; Spam-/Zustell-Logs weich.
