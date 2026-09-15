# 10: Templates, Bindings & Loops

**What to build:** Kunden-Sites mit Blog/Artikeln ohne Code: Seiten als Vorlagen (`template.kind = layout | collection` + Ziel-Collection + Priorität; Vorlagen-Pages ohne eigene Route), Layout-Auswahl je Seite, `outlet`-Baustein (kontextuell gefüllt: im Layout die Seite, im Entry-Template den Artikel), Resolve-Kette Layout → Entry-Template → Inhalt (Splice an Outlets, ID-Rekeying; Templates ohne Outlet = unfertig/ignoriert). Bindings in zwei Formen (Whole-Prop `{ "$entry": … }` + Text-Mix `„Neues von {entry.title}"`) mit Quellen `entry.*` (dotted), `parentEntry.*`, `site.*`, `route.query.*`, Typ-Kompatibilitätsprüfung, Markdown→HTML sanitisiert; ein Resolver für Build + Vorschau. Sektionen `collection-list` (geschlossenes Filter-Set, Sortierung, Limit, `excludeCurrent`, `?seite=N`, Varianten cards/grid/list) + `card`-Bausteine im Item-Slot. Detailrouten aus `urlPattern` (404/301), Re-Bake nur betroffener Seiten (Abhängigkeits-Index), Live-Vorschau im Entry-Editor (Server-Render, debounced, read-only).

**Blocked by:** 05 (Renderer & Bake), 09 (Content-Kern).

**Status:** ready-for-agent

- [ ] Blog-Fixture läuft: Layout + Sammelseite mit `collection-list` + Detailseite über Entry-Template; Blättern `?seite=N` ohne JS; leere Liste/Out-of-range sauber
- [ ] Bindings füllen Props und Text-Mix korrekt; Typ-Mismatch und unbekannte Felder sind Validierungsfehler; Markdown-Body ist XSS-sicher
- [ ] `excludeCurrent` („Weitere Artikel") + Filter funktionieren; Karten-Slot rendert genau einen `card`-Baustein
- [ ] Re-Bake-Index: Entry-Publish/Unpublish/Delete und Layout-/Template-Änderungen backen nur betroffene Routen/Listen neu
- [ ] Detailrouten in Sitemap/`.md`/JSON-LD; nicht-published → 404; alte Slugs → 301
- [ ] Live-Vorschau aktualisiert beim Tippen (read-only) und nutzt denselben Renderer/Resolver wie der Build (Parität)
- [ ] Bake-Tests (Prüfstelle 2): Bindings, Listen, Routen, 404/301, keine Draft-Leaks

Quellen: `artifacts/23`, Spec „Templates, Bindings & Loops", `research/26` (Instatic-Delta).