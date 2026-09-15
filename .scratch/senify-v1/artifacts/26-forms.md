# Artefakt 26: Forms — Native Formulare & Submissions (Senify v1)

> Entschieden am 15.09.2026 in Ticket „Forms: Native Formulare & Submissions".
> Grundlagen: `artifacts/22` (Content-Kern), `23` (Templates/Loops), `13` (AEO/Checks), `14` (Hosting/EU-VPS), `research/26` §7 (Instatic-Forms-Details), `research/24` §5.4 (Jobs/Retry).

## Entscheidungen (Wizard, 9/9)

1. **Einsendungen = normale Entries** in einer Ziel-Sammlung (z. B. „Kontaktanfragen") — kein Sondersystem.
2. **Formular-Sektion** mit Feldliste im Editor; `contact`/`newsletter` werden nativ (Katalog-Delta zu 08).
3. **Empfänger:** Senify-Endpoint auf dem EU-VPS (Engine) — Daten bleiben bei dir (DSGVO-freundlich).
4. **Benachrichtigung:** E-Mail an dich (SMTP, konfigurierbar) + Ansicht im Programm.
5. **Nach dem Senden:** progressiv — Danke-Seite ohne JavaScript, Inline-Bestätigung mit JavaScript.
6. **Aufbewahrung:** bleiben bis gelöscht (Trash wie Entries); DSGVO-Hinweis + Zustimmungs-Checkbox Pflicht.
7. **Spam-Schutz automatisch:** Honeypot, Mindest-Ausfüllzeit, Herkunftsprüfung, Rate-Limits — kein Captcha.
8. **Feldarten:** Text, E-Mail, Telefon, mehrzeilige Nachricht, Auswahl (Dropdown/Radios), Checkbox, Datum, Zahl.
9. **Newsletter: Double-Opt-In** mit Bestätigungsmail (deutscher Datenschutz-Standard).

## 1. Formular-Modell (Sektionen)

**Katalog-Delta (08):** `contact` und `newsletter` bekommen natives Form-Backend (bisher „extern").

```ts
type FormFieldSpec = {
  kind: "text" | "email" | "phone" | "textarea" | "select" | "radios" | "checkbox" | "date" | "number"
  key: string                  // eindeutig, wird Feldname (Whitelist für Validierung)
  label: string
  required?: boolean
  placeholder?: string
  options?: { value: string; label: string }[]   // select/radios
  validation?: { pattern?: string; min?: number; max?: number }  // einfache Zusatzregeln
}

type FormProps = {
  fields: FormFieldSpec[]
  targetCollectionId: CollectionId     // Ziel-Sammlung für Einsendungen
  consent?: { required: true; text: string; pageId: PageLinkId }   // Datenschutz-Zustimmung (Pflicht)
  successMessage?: string              // Inline-Bestätigung (JS)
  successPageId?: PageLinkId           // Danke-Seite (ohne JS)
  honeypotKey?: string                 // Default "company" (unsichtbar)
}
```

- **Komfort „Sammlung aus Formular anlegen":** Ein Klick erzeugt die Ziel-Sammlung samt Feldern aus der Formular-Definition (Instatic-Muster) — inkl. sinnvoller Vorlage (z. B. Status-Select „neu/beantwortet").
- **`newsletter`:** ein E-Mail-Feld + DOI-Flow (s. §5); Ziel-Sammlung z. B. „Newsletter-Abos".

## 2. Empfänger-Endpoint (Architektur)

```
Öffentliche Website (statisch)  →  POST /forms/:siteId/:formId  →  Senify-Engine (EU-VPS)
                                     (CORS/Origin-geprüft)          → Validierung → Entry (Ziel-Sammlung)
                                                                     → Benachrichtigungs-Mail (Job)
```

- **Stateless, cache-sicher:** Beim Bake wird ein **signiertes Formular-Token** (HMAC; enthält `siteId`, `formId`, Ausstellungszeit) in die Seite gestempelt (Instatic-Muster) — funktioniert mit statischem HTML/CDN, ohne Cookies.
- **Schutz (automatisch, Entscheidung 7):**
  - Honeypot-Feld (unsichtbar; gefüllt ⇒ verwerfen),
  - Mindest-Ausfüllzeit aus Token-Zeitstempel (z. B. < 2 s ⇒ verwerfen),
  - **Origin-/Herkunftsprüfung** (Pflicht),
  - **Rate-Limits** pro IP und IP+Formular (Challenge/Submit getrennt),
  - Größenlimits (Body-Cap, z. B. 1 MB) und Feld-Whitelist.
- **Server vertraut nur dem Snapshot:** Die Formular-Definition wird beim Publish eingefroren; Validierung (Feldtypen, required, Muster) läuft gegen den Snapshot — nie gegen Client-Angaben (Instatic-Prinzip). Unbekannte Felder ⇒ Ablehnung.
- **Lokal:** derselbe Endpoint läuft in der lokalen Engine (Tests/Preview); live über VPS (Artefakt 14, TLS via Caddy).

## 3. Submissions als Entries (Entscheidung 1)

- Jede Einsendung wird ein **Entry** in der Ziel-Sammlung (Zellen = Formularfelder) — sichtbar im Content-Workspace, durchsuchbar (FTS), löschbar (Trash).
- **Auto-Felder:** `submittedAt` (bzw. `createdAt`), `sourcePage` (woher kam die Anfrage, intern), optional Status-Select („neu/beantwortet") — als Sammlungs-Vorlage beim Setup.
- **Ziel-Sammlungen ohne Draft-Workflow** konfigurierbar (`supports` schlank) — Einsendungen erscheinen sofort, kein Publish-Schritt.
- **Aufbewahrung:** bis gelöscht (Entscheidung 6); Löschen = Trash (22); DSGVO-Hinweis + Zustimmung werden je Einsendung dokumentiert (Zeitpunkt, Textfassung).
- **CSV-Export** der Ansicht (kleine Erweiterung der Entry-Liste); **MCP:** Entry-Tools (`list_entries`, `get_entry`, `search_entries`) decken Submissions ab — kein Sondertool.

## 4. Benachrichtigung & E-Mail (Entscheidung 4)

- **SMTP-Konfiguration** in den Einstellungen (Ticket 27); Versand läuft als **Job mit Retry/Backoff** (24er-Muster) — Versagensfälle sichtbar.
- **Betreiber-Mail:** Vorlage mit Tokens (`{formName}`, Feldwerte, Zeit, Quellseite, Link in die Ansicht).
- Zustellbarkeit v1 pragmatisch (eigenes Postfach); kein Massen-Mail-System (Newsletter-Versand selbst ist **nicht v1**, s. §5).

## 5. Newsletter & Double-Opt-In (Entscheidung 9)

```
Anmeldung (E-Mail) → Entry (Status: pending) → Bestätigungsmail (Token, TTL)
   → Klick auf Bestätigungsseite → Status: confirmed
   (Abmeldelink markiert unsubscribed)
```

- **Bestätigungsseite:** konfigurierbar (Page); Token signiert + ablaufend.
- **Felder der Ziel-Sammlung:** E-Mail, Status (`pending|confirmed|unsubscribed`), Zeitstempel (angemeldet/bestätigt/abgemeldet), Consent-Doku.
- **Grenze v1:** Einsammeln + Bestätigen + Abmelden. **Kampagnen-Versand** (Massenmails, Templates, Segmente) ist ein eigener Baustein → v2 (Map-Fog nachtragen).
- **Abmeldelink** gehört in jede spätere Newsletter-Mail (Pflicht) — Mechanik jetzt vorbereiten (Token-Endpoint).

## 6. Nach dem Senden (Entscheidung 5)

- **Ohne JavaScript:** klassischer POST → Redirect auf `successPage` (oder zurück mit `?gesendet=1`); Fehler ⇒ zurück zum Formular mit Fehlerzustand.
- **Mit JavaScript:** Inline-Bestätigung (`successMessage`) ohne Reload; Feldfehler direkt am Feld; Submit-Button mit Ladezustand.
- Beide Wege nutzen denselben Endpoint/dieselbe Validierung (kein Logik-Drift).

## 7. Checks (Anschluss an 13)

- **HART bei Publish:** Formular vollständig konfiguriert (Ziel-Sammlung existiert, Felder valide & eindeutige Keys, Consent-Block mit verlinkter Datenschutz-Seite, Erfolgsseite existiert).
- **WEICH:** Zustellbarkeits-Warnungen (SMTP-Test), Spam-Statistik (Rate-Limit-Treffer) im Programm-Log.

## 8. Anschlüsse

| Bereich | Ticket |
|---|---|
| Katalog-Delta: `contact`/`newsletter` nativ + Feld-Schema + Golden-Beispiele | 08 (Nachtrag) |
| Form-Checks in der Check-Pipeline (hart/weich) | 13 |
| Endpoint-Betrieb auf EU-VPS (TLS, Rate-Limits, Logging) | 14 |
| Danke-Seite/Consent-Seite sind normale Pages (Links statt Roh-URLs) | 23 |
| Formular-Editor (Felder-UI, „Sammlung anlegen") | 24 |
| Einstellungen (SMTP) + Submission-Zähler/Log im Projekt | 27 |
