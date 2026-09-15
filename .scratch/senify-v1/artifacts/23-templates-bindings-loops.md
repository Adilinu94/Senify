# Artefakt 23: Entry-Templates, Bindings & Loops (Senify v1)

> Entschieden am 15.09.2026 in Ticket „Entry-Templates, Bindings & Loops".
> Grundlagen: `artifacts/01` (Datenmodell/Mutationen), `02` (Renderer/Bake), `05` (Lifecycle), `08` (Katalog — wird erweitert), `13` (AEO/Checks), `22` (Content-Kern), `research/23` + `26` (Instatic-Template-/Loop-Muster), `research/25` (Emdash `urlPattern`).

## Entscheidungen (Wizard, 10/10)

1. **Entry-Templates:** Eine **normale Page wird als Vorlage markiert** (`template.kind = "collection"` + Ziel-Collection(s) + Priorität) — kein separates Vorlagen-System (Instatic-Muster).
2. **Layouts:** **Mehrere Layouts je Site** zur Auswahl; Seiten wählen ihr Layout; der **Stil kommt aus der Referenz** (Ticket 28). Layout = Page mit `template.kind = "layout"`; Default-Layout vorausgewählt.
3. **Artikel-Bereich:** platzierbarer Baustein **`outlet`** („Inhalt hier einsetzen") — ein Konzept, kontextuell gefüllt (im Layout: Seite; im Entry-Template: Artikel).
4. **Bindings:** **Platzhalter + Text-Mix** — Whole-Prop-Bindings (`{ "$entry": "cover" }`) und Token-Interpolation in Strings (`„Neues von {entry.title}“`).
5. **Listen:** neue kuratierte Sektion **`collection-list`** (statische Sektionen bleiben statisch).
6. **Karten:** **Bausteine in einer Item-Vorlage** — Slot `item` mit `card`-Bausteinen; Stil aus der Referenz.
7. **Filter & Blättern (einfach):** Sortierung (Datum/Titel), Limit, geschlossenes Filter-Set, URL-Blättern `?seite=N`.
8. **„Weitere Artikel“:** Ausschluss des aktuellen Artikels + Filter (z. B. gleiche Kategorie).
9. **Re-Bake:** bei Entry-Publish nur **betroffene Seiten** (Detail + Listen via Abhängigkeits-Index).
10. **Live-Vorschau:** im Editor, **aktualisiert automatisch beim Tippen** (read-only; Inline-Bearbeitung später).

## 1. Vorlagen (Templates & Layouts)

**Page-Felder (additiv zu Artefakt 01):**

```ts
type PageTemplate =
  | { kind: "layout"; label: string }                          // Layout-Vorlage
  | { kind: "collection"; collectionIds: CollectionId[]; priority: number }  // Entry-Template

type Page = {
  /* … Artefakt 01 … */
  template?: PageTemplate          // markiert die Page als Vorlage
  layoutId?: LayoutPageId          // Seiten wählen ihr Layout (Default: "Standard")
}
```

**Regeln:**
- **Vorlagen-Pages haben keine eigene Route** — sie erscheinen nicht in Navigation/Sitemap.
- **Layout:** wird für jede Seite „um sie herum" aufgebaut; eine Page kann mehrere Outlets im Layout füllen? Nein — v1: **ein Outlet pro Layout** wird mit dem Seiteninhalt gefüllt (Instatic-Detail: nur der erste Outlet; weitere rendern leer).
- **Entry-Template:** gilt für die Detailrouten ihrer Collections; **Priorität** entscheidet bei mehreren Templates; Ziel = `collectionIds[]` (das erste Template gewinnt).
- **Resolve-Reihenfolge (Vorlagenkette):** Layout → Entry-Template → Seiten-/Entry-Inhalt, gespleißt an den `outlet`-Bausteinen.
- **Compose-Regeln** (Instatic-Delta, übernommen — vereinfacht):
  - Templates **ohne `outlet`** gelten als unfertig und werden ignoriert (kein Fehler).
  - **ID-Rekeying** beim Splice (`t0_c0_…`) für stabile Render-IDs; `reindexNodeParents` nach dem Merge.
  - Inneres `base.body`-Pendant entfällt (Senify-Pages haben keinen Body-Node); Prop-/Breakpoint-Erhalt ergibt sich aus dem NodeTree-Merge.

## 2. Bindings (Platzhalter & Text-Mix)

**Zwei Formen in Props:**

```json
{ "$entry": "cover" }                 // Whole-Prop: ganzer Wert eines Entry-Felds
"Neues von {entry.title}"             // Token-Mix: Feldwert in Text eingebettet
```

**Quellen (v1):**

| Quelle | Inhalt |
|---|---|
| `entry.*` | Felder des aktuellen Entries (dotted paths für Relationen: `entry.author.name`) |
| `parentEntry.*` | Entry der umschließenden Liste (z. B. „Weitere Artikel" auf der Detailseite eines anderen) |
| `site.*` | Site-Infos (Name, Logo, Kontakt …) |
| `route.query.*` | Werte aus der Adresszeile (Filter/Pagination) |

**Regeln:**
- **Typ-Kompatibilität:** Nur passende Feldtypen dürfen auf einen Prop-Typ binden (Validierung im Editor + Server); z. B. `media`-Feld → `assetRef`-Prop, `text` → `text`.
- **Richtext-Body:** Markdown → HTML gerendert und **sanitisiert** (XSS-Guard); reine Text-Props escapen.
- **Fehlende Werte:** leer (`""`); Referenzen auf unbekannte Felder sind Validierungsfehler (nicht still).
- **Auflösung ist deterministisch** (Build + Live-Vorschau teilen denselben Resolver — kein Renderer-Drift).

## 3. Listen (`collection-list`) & Karten

**Neue Sektionen (Delta zu Katalog 08):** `collection-list`, `card`, `outlet` (25 → 28 Sektionen).

```ts
type CollectionListProps = {
  collectionId: CollectionId
  filter?: { fieldId: FieldId; op: "is" | "isNot" | "isTrue" | "isFalse" | "isSet" | "isEmpty"; value?: string }
  orderBy?: { fieldId: FieldId; direction: "asc" | "desc" }   // Default: dateField desc
  limit?: number                                               // Default 6
  excludeCurrent?: boolean                                     // „Weitere Artikel“ (Default false)
  pagination?: "none" | "pages"                                // pages → ?seite=N
  paramName?: string                                           // Default "seite"
  emptyText?: string                                           // optional
  variant?: "cards" | "grid" | "list"                          // Listen-Anordnung
}
```

- **Item-Vorlage:** Slot `item` mit genau einem **`card`-Baustein** (kleine Sektion mit Varianten `image-top` · `horizontal` · `text`); die `card`-Props tragen die Bindings (`{ "$entry": "title" }`).
- **Filter-Set ist geschlossen** (Instatic-Muster); nicht vergleichbare Feldtypen (multiSelect, media, repeater, multiRelation) sind als Filter ausgeschlossen.
- **Blättern:** `?seite=N` (eigener Parameter je Liste möglich); Seite 0/out-of-range → leerer Zustand; **kein** JS nötig (Deep-Links funktionieren ohne Skript).
- **Leere Listen:** nichts rendern; `emptyText` optional als einziger sichtbarer Hinweis.
- **Bake:** Query wird zur **Buildzeit** ausgeführt (Prefetch in den NodeTree der Seite); die Liste ist statisches HTML.
- **Verschachtelte Listen:** v1 nicht vorgesehen (später).
- **Round-Robin-Varianten / Infinite-Scroll:** v1 nicht (bewusst — „einfach & praktisch").

## 4. Routen, SEO & Blättern

- **Detail-Routen** entstehen aus `Collection.urlPattern` (z. B. `/blog/{slug}`) + Entry-Templating; Einträge mit `status != published` liefern 404 (Slug-Historie → 301, Artefakt 22).
- **AEO-Set (13) gilt automatisch:** Detailseiten erscheinen in Sitemap + `llms.txt`, bekommen `.md`-Versionen und seiten-bewusstes JSON-LD (z. B. Article für Blog).
- **Navigation:** Detailseiten werden nie automatisch verlinkt; verlinkt wird über Listen/Karten oder manuell.

## 5. Live-Vorschau & Review

- **Live-Vorschau** (Ticket 22 §3): rendert Layout + Entry-Template + **Draft-Daten** in der echten Optik; aktualisiert **automatisch** (debounced); read-only.
- Technik: **leichter Server-Render der Vorschau-Sandbox** (kein vollständiger Site-Bake); nutzt denselben Renderer/Resolver wie der Build (Parität).
- **Review (06):** Entry-Reviews referenzieren die Detailroute + betroffene Listen; Screenshots wie gehabt (3 Breakpoints, Animationen aus).
- **Inline-Bearbeitung in der Vorschau:** bewusst nicht v1 (späterer Ausbau, Instatic-Parität als Ziel notiert).

## 6. Re-Bake & Abhängigkeiten

- **Abhängigkeits-Index** (bei jedem Speichern gepflegt): Entry → Seiten mit Bindings auf Collection/Entry; Collection → Seiten mit `collection-list` auf die Collection; Layout/Entry-Template → betroffene Seiten/Detailrouten.
- **Entry-Publish / -Unpublish / -Delete** → Job „Re-Bake betroffener Routen" (Detailroute + Listen-Seiten + ggf. „Weitere Artikel"-Blöcke).
- **Layout-/Template-Änderung** → Re-Bake aller Seiten, die das Layout/das Template nutzen.
- **Page-Publishing** bleibt beim bestehenden Release-Modell (Artefakt 05); Entry-Publishes bleiben eigenständig (Artefakt 22).
- Jobs folgen dem Task/Queue-Muster (Research 24 §5.4); Fehler sind sichtbar (Audit + Programm-Hinweis).

## 7. Anschlüsse

| Bereich | Ticket |
|---|---|
| Katalog-Delta (`collection-list` · `card` · `outlet`) in Section-Library nachziehen; Golden-Beispiele + Thumbnails | 08 (Nachtrag) |
| Puck-Editor: Vorlagen-Pages, Layout-Auswahl, Binding-UI, Live-Vorschau-Panel | 24 |
| Referenzen: Stil → Layouts/Karten („wie sieht es aus"-Ebene) | 28 |
| Checks: Detailrouten in Sitemap/.md/JSON-LD + Screenshot-Pipeline aufnehmen | 13 |
| Shell: Vorlagen & Layouts im Projekt sichtbar/bearbeitbar („Vorlagen"-Bereich) | 27 |
| Skill-Referenz `content.md`: Bindings, Listen, Vorlagen für Agenten dokumentieren | 11 |
