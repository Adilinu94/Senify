# Entry-Templates, Bindings & Loops

Type: grilling
Status: resolved
Blocked by: 22

Input: research/23-instatic-deepdive.md
Input: research/25-emdash-learnings.md
Input: research/26-instatic-delta.md

## Question

Wie rendern Collection-Entries als Seiten und wie fließen Entry-Daten in Page-Trees?

- **Entry-Templates:** eine Page als Template für eine Collection (Pfad z. B. `/blog/:slug`); Entry-Stack beim Rendern (Instatic-Muster: Template-Chain + `currentEntry`).
- **Dynamische Bindings:** Props können an Entry-Felder gebunden werden (`{ "$entry": "title" }` analog Token-Refs 01/07) — welche Prop-Typen, welche Quellen (currentEntry, parentEntry, route, site)?
- **Loops:** Iterieren über Collection-Queries (Sortierung, Filter, Limit, Pagination) — eigene Section (`collection-list`) mit Item-Template?
- **Preview & Build:** Loops/Bindings im statischen Bake (02), Re-Bake betroffener Seiten bei Entry-Publish (05), Screenshots im Review (06).

Ergebnis: Template-/Bindings-/Loop-Modell, das Pages und Collections verbindet.

## Answer

**Entschieden am 15.09.2026 (Wizard, 10/10) — Artefakt: [artifacts/23-templates-bindings-loops.md](../artifacts/23-templates-bindings-loops.md)**

- **Templates:** Page wird als Vorlage markiert (`template.kind = "collection" | "layout"`); Vorlagen-Pages haben keine eigene Route. **Layouts** (mehrere je Site, Seiten wählen, Default „Standard") umrahmen jede Seite; **Entry-Templates** bedienen Detailrouten ihrer Collections (Priorität, `collectionIds`). Der Baustein **`outlet`** („Inhalt hier") markiert die Einsetz-Stelle — kontextuell gefüllt (Layout → Seite; Entry-Template → Artikel). Compose: ID-Rekeying, Templates ohne Outlet gelten als unfertig.
- **Bindings:** Whole-Prop `{ "$entry": "cover" }` + Text-Mix `„Neues von {entry.title}"`; Quellen `entry`, `parentEntry`, `site`, `route.query`; Typ-Kompatibilität validiert; Richtext-Bindings sanitisiert; deterministischer Resolver (Build = Vorschau).
- **Listen:** neue Sektion **`collection-list`** (Varianten cards/grid/list) mit `card`-Baustein als Item-Vorlage im Slot; geschlossenes Filter-Set; `?seite=N`-Blättern ohne JS; `excludeCurrent` für „Weitere Artikel"; Query wird im Bake aufgelöst (statisches HTML).
- **Katalog-Delta:** 25 → 28 Sektionen (`collection-list`, `card`, `outlet`) — Nachtrag zu Artefakt 08.
- **Routen/SEO:** Detailrouten aus `urlPattern`; Nicht-published → 404 (Slug-Historie → 301); AEO-Set (Sitemap/.md/JSON-LD) gilt automatisch.
- **Re-Bake:** Abhängigkeits-Index (Entry→Bindings, Collection→Listen, Layout/Template→Seiten); Entry-Publish rebuildet nur betroffene Routen (Job).
- **Live-Vorschau:** automatisch beim Tippen (debounced, read-only, leichte Render-Pipeline ohne Voll-Bake); Inline-Bearbeitung in der Vorschau bewusst nicht v1.
