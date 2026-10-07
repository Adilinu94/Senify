# Site-Inhalte laufen auf der Engine-Origin, nie unter der Dashboard-Origin

Status: vorgeschlagen · 29.09.2026 (Umsetzung im Code, Browser-Gates `verify:parity` und `test:visual` stehen aus)
Bezug: ADR-0010 (importierter Fremdcode als Island-Payload), Review-Befund „Fremdcode im Dashboard-Origin".

**Problem.** Der Dashboard-Server (Port des Programms) hängt jeder `/api/`-Anfrage den Operator-Token
an (alle Scopes, kein Ablauf). Signierte Previews und veröffentlichte Releases sind komplette gebackene
Seiten und können nach ADR-0010 importierten Fremdcode ausführen. Öffnet ein Mensch so eine Seite unter
der Dashboard-Adresse, läuft der Fremdcode in derselben Origin: `fetch('/api/…')` ist same-origin, der
Proxy hängt den Token an, das Skript hat die Rechte des Operators. Dasselbe gilt für ein hochgeladenes
SVG mit Skript, das direkt als Dokument geöffnet wird.

**Entscheidung.**

1. `/api/previews/<id>/files/…` und `/api/releases/<id>/files/…` beantwortet der Dashboard-Server mit
   `307` auf dieselbe Adresse der Engine-Origin. Beide Routen brauchen dort keinen Bearer (Preview:
   signierter Token in der Query, Release: öffentlich). Die Engine-Origin ist für den Browser eine andere
   Origin, und nur der Dashboard-Proxy hängt den Token an.
2. Der Proxy nimmt nur noch `Sec-Fetch-Site: same-origin` und `none` an. `same-site` (anderer Port auf
   demselben Rechner, etwa Seiteninhalt auf der Engine-Origin) und `cross-site` bekommen 403.
3. Der Dashboard-Server antwortet nur auf Loopback-Hostnamen (`127.0.0.1`, `localhost`, `[::1]`), damit
   DNS-Rebinding nicht wieder dieselbe Origin herstellt.
4. Die Engine liefert Dateien mit `X-Content-Type-Options: nosniff` und SVG mit
   `Content-Security-Policy: sandbox` (Dokument ohne Skript und Origin; `<img>`-Nutzung unberührt).

**Verworfen.**

- *CSP `sandbox` auf Preview- und Release-HTML.* Ein sandboxed Dokument hat eine opake Origin, alle seine
  Sub-Requests gelten als `cross-site` und scheitern am Proxy-Check; Webfonts bräuchten zusätzlich CORS.
  Die Seite würde ohne Styles, Skripte und Fonts erscheinen.
- *Nur SVG sanitizen.* Deckt Previews und Releases nicht ab.

**Folgen.**

- Preview und Release öffnen unter `http://127.0.0.1:<Engine-Port>/…`. Setups, in denen nur der
  Dashboard-Port erreichbar ist (Port-Weiterleitung nur für das Dashboard), sehen dort nichts mehr.
- Die Root-Pfade `/assets/…` und `/_astro/…` bleiben am Dashboard (der Editor braucht sie als
  Sub-Ressourcen). Dort gibt es nur Bilder, Fonts, Styles und Skripte, die als Dokument nicht ausgeführt
  werden; ein SVG ist per `sandbox` entschärft.
- Der Cutover-Browsertest öffnet Releases weiter über die Dashboard-Adresse und folgt dem Redirect. Er
  ist hier nicht gelaufen (kein Browser in der Prüfumgebung) und muss vor der Annahme grün sein.

**Offen.** Ein Playwright-Test, der belegt: `fetch('/api/sites')` aus einer geöffneten Preview scheitert
mit 401.
