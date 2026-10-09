# Jedes Projekt trägt seine öffentliche Adresse

Status: accepted · 09.10.2026 (von Adi bestätigt, Vorschlag vom 03.10.2026)
Bezug: Review-Befund „canonical, Sitemap und og:url zeigen auf einen festen Platzhalter".

**Problem.** `bakePages` setzte `baseUrl` hart auf `https://<slug>.senify.xyz`. Für ein Kundenprojekt auf
`www.kunde.de` hieß das: `canonical`, `og:url`, `sitemap.xml` und `robots.txt` zeigen auf eine Adresse, unter
der die Seite nie erreichbar ist. Suchmaschinen folgen dem `canonical` und indexieren dann nichts oder die
falsche Adresse. Dieselbe Ableitung stand in der Formularprüfung: nur `<slug>.senify.xyz` (und die globale
Umgebungsvariable `SENIFY_FORMS_ORIGINS`) durfte Einsendungen absenden, die echte Kundendomain wäre abgewiesen
worden.

**Entscheidung.**

1. `Site.baseUrl` ist optional und trägt nur die Origin (`https`, Host, optional Port). Es steht in der neuen
   Spalte `sites.base_url` (additiv, nullable).
2. Gesetzt wird sie über `PATCH /api/sites/:siteId` mit `{ "baseUrl": "…" }` und im Dashboard unter
   Projekt-Einstellungen. `null` oder ein leerer Text löscht sie. Die Änderung steht in der Projekt-Aktivität
   (`update_site_base_url`).
3. Die Eingabe wird normalisiert (`normalizeSiteBaseUrl`): Schema `https://` wird ergänzt, Host kleingeschrieben
   und als Punycode abgelegt, Standardport entfällt. Abgelehnt werden `http`, andere Schemas, Zugangsdaten, Pfad,
   Query, Fragment und Hosts ohne Punkt. Das Ergebnis ist immer eine reine Origin, weil `canonical`, Sitemap und
   `og:url` den Seitenpfad selbst anhängen.
4. Ohne Eintrag bleibt der Platzhalter `https://<slug>.senify.xyz` wie bisher; es ändert sich nichts für
   bestehende Projekte.
5. Ein relativer `og:image`-Pfad wird beim Bau gegen diese Adresse absolut gemacht. Vorschau-Crawler laden das
   Bild ohne die Seite als Bezug; ein relativer Pfad lief dort ins Leere. Ein Wert, der sich nicht auflösen lässt,
   bleibt wie geschrieben stehen, damit ein freier Meta-Text den Bau nicht abbricht.
6. Die Formularprüfung erlaubt zusätzlich den Host dieser Adresse. Apex und `www` sind verschiedene Hosts; wer
   beide nutzt, trägt den zweiten über `SENIFY_FORMS_ORIGINS` ein.

**Folgen.**

- Agenten sehen die Adresse in `get_site` (das Ausgabeschema nennt das Feld). Sie setzen sie nicht: die Adresse
  festzulegen ist eine Entscheidung des Betreibers, und der Schreibweg dafür ist das Dashboard.
- `duplicate_site` übernimmt die Adresse nicht. Zwei Projekte mit derselben öffentlichen Adresse wären ein
  Fehler; die Kopie startet mit dem Platzhalter.
- Die Adresse wird nicht geprüft (kein DNS-Abruf). Ob die Domain auf den Server zeigt, ist Sache des Deployments.

**Verworfen.** Eine eigene Tabelle für Domains (mehrere Aliase, Weiterleitungen): für eine Adresse je Projekt zu
viel. Ein Pflichtfeld bei `create_site`: bricht jeden bestehenden Aufruf und verlangt eine Adresse, bevor es eine
gibt. `http` zulassen: eine öffentliche Kundenseite ohne TLS ist kein Ziel, und `localhost`-Fälle laufen über die
Platzhalter-Adresse.

**Offen.** Weiterleitungen von `www` auf Apex (oder umgekehrt) und `hreflang` für mehrere Domains sind nicht Teil
dieser Entscheidung.
