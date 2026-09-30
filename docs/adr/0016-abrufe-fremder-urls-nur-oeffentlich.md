# Abrufe fremder URLs gehen nur an öffentliche Adressen

Status: vorgeschlagen · 29.09.2026
Bezug: ADR-0015 (Site-Inhalte auf der Engine-Origin), ADR-0010 (Framer-Import).

**Problem.** Import und Referenz-Analyse rufen Adressen ab, die ein Agent oder eine fremde Seite
liefert: die Import-URL, die Asset-URLs im geholten HTML, die Referenz-URL. Ohne Prüfung zeigt eine
präparierte Seite den Server auf `http://127.0.0.1:<port>/api/…` oder einen Cloud-Metadatendienst. Der
Dashboard-Proxy behandelt eine Anfrage ohne `Origin` als vertrauenswürdig und hängt den Operator-Token an;
die Antwort landet als Asset in einer Seite.

**Entscheidung.** Ein Modul `@senify/core/net` (nur Node, eigener Subpath, damit das Browser-Bundle es nie
lädt):

1. `assertPublicHttpUrl(url)` lässt nur `http(s)` ohne Zugangsdaten zu und löst den Host auf. Loopback,
   private, link-local (Cloud-Metadaten), Carrier-NAT-, Test-, Dokumentations-, Multicast- und reservierte
   Bereiche werden abgewiesen, auch in IPv6-Verpackung (`::ffff:127.0.0.1`, NAT64, 6to4, Teredo).
   Schreibweisen wie `2130706433` oder `0x7f.1` normalisiert der URL-Parser vorher.
2. `fetchPublic(url, { maxBytes, signal, headers })` prüft jede Weiterleitung neu (höchstens 5), verbindet
   sich mit der eben geprüften Adresse (kein zweiter DNS-Schritt, damit Rebinding nichts ändert) und
   begrenzt den entpackten Body.
3. Angeschlossen sind: Seiten-Abruf und Asset-Download des Framer-Imports, der Rückfall „HTTP-Snapshot“
   der Capture-Kette, und die Referenz-Analyse vor jedem Capture-Treiber (Browser, Firecrawl, HTTP).
4. Der Betreiber kann mit `SENIFY_ALLOW_PRIVATE_URLS=1` im Prozess private Ziele erlauben (Import aus einem
   lokalen Server). Der Schalter hebt die Adress-, nicht die Schema-Prüfung auf. Die Testsuite setzt ihn
   (`vitest.config.ts`); die Tests des Schutzes schalten ihn aus.

**Nicht geändert, mit Grund.**

- `captureBrowser` (framer-import) nimmt bewusst `file://` für den Offline-Mirror und ist nur aus
  Bibliothek und Tests erreichbar, nicht aus einer Agent-Route.
- Der Import aus `rootDir` bleibt für Agenten offen: er ist der Kern-Workflow für lokale Mirror-Ordner
  (ADR-0010) und bricht nicht aus dem Ordner aus (Module laufen über `safeModulePath`). **Offen:** eine
  Allowlist `SENIFY_IMPORT_ROOTS`, wenn der Betreiber Agenten auf bestimmte Wurzeln beschränken will.
- Weiterleitungen und Sub-Requests innerhalb des Browsers der Referenz-Analyse sind Sache des Browsers. Sie
  erreichen das Dashboard nur als `cross-site`, und das lehnt der Proxy ab (ADR-0015); die Engine verlangt
  dort einen Bearer.

**Folgen.** Ein Import von `http://localhost:…` oder aus dem LAN scheitert mit einer Meldung, die den
Schalter nennt. Firecrawl bekommt die Referenz-URL nur, wenn sie öffentlich ist.
