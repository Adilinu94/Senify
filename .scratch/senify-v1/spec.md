# Spec: Senify v1

> Status: `ready-for-agent` · Datum: 15.09.2026
> Quelle: Wayfinder-Map [map.md](map.md) + 23 Artefakte ([artifacts/](artifacts/)) + 12 Research-Dokumente ([research/](research/)).
> Diese Spec ist die baubare Synthese des Wayfinder-Prozesses (28/28 Tickets gelöst). Für Detailtiefe je Bereich gilt das verlinkte Artefakt.

## Problem Statement

Als Agentur-Betreiber (Single-Operator, internes Werkzeug) baue und pflege ich Kunden-Websites heute mit Framer/Webflow und WordPress. Die Probleme:

- **Agenten bauen blind.** Ich kann KI-Agenten (Claude Code, Cursor, opencode) nicht sinnvoll an Website-Bau anschließen: Es gibt keinen strukturierten Baukasten, keine Validierung, keinen Review-Punkt — Agenten müssten freien Code schreiben, den ich nicht vertrauen kann.
- **Kein CMS, das mit Agenten zusammenspielt.** Bestehende CMS verwalten Inhalte entweder für Menschen (Instatic/Payload) oder sind nicht agenten-native: Entries, Loops, Formular-Einsendungen und Templates sind nicht durchgängig über eine Tool-Schnittstelle steuerbar.
- **Design-Systeme fehlen oder entstehen manuell.** Wenn ich „im Stil von X" bauen will, extrahiere ich Farben, Fonts und Muster von Hand. Es gibt keinen Weg, eine Referenz-Website automatisch zu analysieren und als nutzbares Design-Profil zu übernehmen — mit klaren Schutzregeln statt 1:1-Kopie.
- **Kein Kontrollpunkt.** Agenten-Änderungen landen ohne Review, Diffs oder Guardrails live. Ich brauche Drafts, Previews, Screenshot-/Struktur-Diffs und eine Freigabe, bevor etwas veröffentlicht wird.
- **Kein komplettes lokales Programm.** Die Teile (Editor, Content, Referenzen, Deploy) existieren nirgends integriert; ich will ein lokales Programm (Browser-App) auf meinem Rechner, keine gehostete SaaS-Suite.

## Solution

**Senify** ist eine agent-native Website-Plattform („WordPress für KI-Agenten") als **lokales Programm** — eine Web-App im Browser, deren Engine komplett auf meinem Rechner läuft.

- **Ein Start:** `senify start` startet die Engine (Server, Postgres, Worker) und öffnet das Programm im Browser.
- **Drei globale Tabs:** **Projekte · Referenzen · Einstellungen**. Der Editor ist der Arbeitsbereich eines geöffneten Projekts (Kopf-Leiste: Seiten · Artikel · Vorlagen · Prüfen · Aktivität · Einstellungen).
- **Referenzen-Tab:** URL eingeben → vollautomatische Analyse (Playwright-Capture in 3 Größen + Motion-Sampling → deterministische Extraktion → KI) → **volles Design-Profil** (Tokens, Komponenten, Bewegung, Stil-Blatt), sofort in Projekten nutzbar; mehrere Referenzen über Skalen-Zuordnung kombinierbar; Schutzregeln „Inspiration, kein Klon".
- **Content-Kern:** Collections & Entries (16 Feldtypen, Markdown-Body, Workflow draft/published/unpublished/scheduled, Versionen, Slug-301, Trash) + Content-Workspace im Programm — ein „komplettes CMS".
- **Templates, Bindings & Loops:** Seiten als Vorlagen (Layouts, Entry-Templates), `outlet`-Baustein, Platzhalter-Bindings, Sektionen `collection-list` + `card` mit URL-Blättern — Kunden-Sites mit Blog/Artikeln ohne Code.
- **Visueller Editor (Puck-Basis):** Design-Modus (Breakpoint-Fenster nebeneinander, Zoom/Pan) + Live-Modus, Inline-Text-Editing, Explorer-Tabs, Cmd+K, Deep-Links, Medien-Fenster — Instatic-Niveau.
- **Agenten via MCP:** lokaler stdio-MCP (`senify mcp configure`) mit 50+ Tools, scoped Tokens (`read`/`write`/`publish`), `apply_mutations` (atomar, `dry_run`), strukturierten Fehlern und Hard-Guardrails. Agenten bauen Drafts, Menschen publizieren.
- **Review im Projekt:** Agent-Submit → Preview-Build + Struktur-/Screenshot-/Motion-Diffs → Approve / Request changes / Discard.
- **Sites:** Astro-7-Bake pro Release (statische Artefakte), AEO-Set standardmäßig (llms.txt, .md, JSON-LD), Media-Pipeline (EU-Storage, srcset, Alt-Pflicht), Forms nativ (Einsendungen als Entries, Double-Opt-In), Deploy über Vercel/Netlify-Adapter.

Qualitätshaltung: **Schlicht-modern ist ein vollwertiger Default** — Profile `clean` · `standard` · `showcase`; Motion und 3D sind Optionsstufen, nie Pflicht.

## User Stories

### Programm & Projekte (Shell)

1. Als Agentur-Betreiber möchte ich das Programm mit einem Klick starten (Desktop-Verknüpfung → Engine startet, Browser öffnet das Dashboard), damit ich ohne Terminal-Wissen arbeiten kann.
2. Als Agentur-Betreiber möchte ich beim Start einen klaren Status sehen (Engine läuft, Port, Bereitschaft; bei Fehlern einen verständlichen Hinweis statt weißem Bildschirm), damit ich Probleme sofort einordnen kann.
3. Als Agentur-Betreiber möchte ich Projekte als Karten-Grid sehen (Vorschaubild, Name, Statuspunkt Entwurf/in Prüfung/Live, letzte Änderung), damit ich den Überblick behalte.
4. Als Agentur-Betreiber möchte ich ein Projekt mit nur einem Namen anlegen, damit ich schnell starten kann (Stil & Niveau sind danach jederzeit einstellbar).
5. Als Agentur-Betreiber möchte ich ein Projekt öffnen und direkt im Editor der Startseite landen, damit der Einstieg ins Bauen reibungslos ist.
6. Als Agentur-Betreiber möchte ich ein ganzes Projekt duplizieren (mit Inhalten oder nur Struktur & Design), damit „Kunde B wie Kunde A" ein Ein-Klick-Fall ist.
7. Als Agentur-Betreiber möchte ich Projekte in einen Papierkorb verschieben (wiederherstellbar; endgültig löschen nur mit Bestätigung), damit Fehlgriffe nicht wehtun.
8. Als Agentur-Betreiber möchte ich in der Kopf-Leiste des Projekts zwischen Seiten, Artikeln, Vorlagen, Prüfen, Aktivität und Projekt-Einstellungen wechseln, damit alle Arbeitsbereiche erreichbar sind.
9. Als Agentur-Betreiber möchte ich eine Aktivitätsliste pro Projekt (wer/was/wann; Agent oder Mensch, Token-Name), damit ich jederzeit nachvollziehen kann, was passiert ist.
10. Als Agentur-Betreiber möchte ich globale Einstellungen (Agenten-Zugänge, SMTP/E-Mail, Speicher & Sicherung, Standardwerte), damit ich das Programm an meine Umgebung anpasse.

### Referenzen-Tab

11. Als Agentur-Betreiber möchte ich eine Referenz-URL eingeben und eine vollautomatische Analyse starten, damit ich sofort ein nutzbares Design-Profil erhalte (kein Pflicht-Review).
12. Als Agentur-Betreiber möchte ich, dass die Analyse Tokens (Farbe/Typo/Spacing/Radius/Shadow/Motion), Komponenten-Inventar, Motion-Verhalten und ein Stil-Blatt extrahiert, damit das Profil ein volles Designsystem abbildet.
13. Als Agentur-Betreiber möchte ich Evidenz und Konfidenz je Aussage sehen (keine erfundenen Werte; Widersprüche markiert), damit ich dem Profil vertrauen kann.
14. Als Agentur-Betreiber möchte ich Referenzen als Karten verwalten (Vorschaubild, Familien, „verwendet in N Projekten", Suche/Filter, Löschen mit Nutzungs-Hinweis), damit ich den Bestand pflege.
15. Als Agentur-Betreiber möchte ich mehrere Referenzen über Skalen-Zuordnung kombinieren (Farben von A, Schriften von B, Motion von C; Default: eine Referenz für alles), damit „im Stil von" präzise steuerbar ist.
16. Als Agentur-Betreiber möchte ich, dass ein Design-Profil automatisch als Senify-Theme ableitbar ist, damit Sektionen und Tokens im Referenz-Stil gebaut werden können.
17. Als Agentur-Betreiber möchte ich Schutzregeln („Inspiration, kein Klon": keine Logos/Marken-Assets/Originaltexte/Fotos/1:1-Layouts) mit Nähe-Warnung, damit Kundensites rechtlich sauber bleiben.
18. Als Agent möchte ich das Stil-Blatt einer Referenz per `get_reference` lesen und eine Referenz per `apply_reference` einem Projekt zuordnen, damit ich ohne Copy-Paste-Briefs im Ziel-Stil baue.
19. Als Agentur-Betreiber möchte ich bei blockierten Seiten einen Screenshot-Upload als Fallback (reduziertes Profil), damit ich trotz Bot-Schutz arbeitsfähig bleibe.

### Content-Kern (Collections & Entries)

20. Als Agentur-Betreiber möchte ich Collections mit Feldern anlegen (16 Typen: text, longText, richtext, number, boolean, date, dateTime, select, multiSelect, url, email, media, mediaMulti, relation, relationMulti, repeater), damit ich beliebige Inhaltsstrukturen abbilde.
21. Als Agentur-Betreiber möchte ich, dass Relationen eine Ziel-Whitelist (1–n Collections) haben und Repeater genau eine Ebene tief sind, damit Modelle einfach und validierbar bleiben.
22. Als Agentur-Betreiber möchte ich Entries in einer Liste sehen (Suche via Postgres-FTS, Status-Filter, Sortierung, Pagination, Bulk-Aktionen Publish/Unpublish/Trash), damit ich Inhalte effizient verwalte.
23. Als Agentur-Betreiber möchte ich Entries in einem Editor mit Markdown-Body (Tiptap) und generierten Custom-Feldern pflegen (Autosave in den Draft + explizites Publish), damit Redaktion sich natürlich anfühlt.
24. Als Agentur-Betreiber möchte ich den vollständigen Workflow (draft/published/unpublished/scheduled, Version je Publish, „Restore as Draft", Slug-Änderung → 301, Soft-Delete/Trash), damit Veröffentlichung kontrollierbar ist.
25. Als Agentur-Betreiber möchte ich Kategorien als Collection + Relation und Tags als multiSelect abbilden, damit Taxonomien ohne Sondersystem funktionieren.
26. Als Agent möchte ich Collections/Entries über MCP-Tools lesen und schreiben (`list_collections`, `get_collection`, `create_collection`, `update_collection`, `add_field`, `update_field`, `list_entries`, `get_entry`, `create_entry`, `update_entry`, `search_entries`), damit ich Inhalte vollständig pflegen kann.
27. Als Agent möchte ich Entries mit `baseVersion`-Konfliktschutz schreiben (409 mit klarer Anweisung bei Mismatch), damit parallele Änderungen nie still überschrieben werden.
28. Als Agent möchte ich `publish_entry`/`unpublish_entry` mit `publish`-Scope bzw. über den Review-Flow nutzen, damit Inhalte kontrolliert live gehen.
29. Als Agentur-Betreiber möchte ich, dass Entry-Publishes eigenständig vom Seiten-Release sind und betroffene Routen/Listen automatisch neu gebacken werden, damit Inhalte sofort erscheinen.
30. Als Agent möchte ich Feld-/Collection-`description`-Texte lesen, damit ich Schemas ohne Rückfragen korrekt befüllen kann.
31. Als Agentur-Betreiber möchte ich Einsendungen (Formulare) als normale Entries in Ziel-Collections sehen und per CSV exportieren, damit alles in einem System bleibt.
32. Als Agentur-Betreiber möchte ich Content-Änderungen im Audit und in der Aktivität sehen, damit Verantwortlichkeit klar ist.

### Templates, Bindings & Loops

33. Als Agentur-Betreiber möchte ich eine normale Seite als Vorlage markieren (`template.kind = "collection"` + Ziel-Collections + Priorität), damit Detailseiten ohne separates Vorlagen-System entstehen.
34. Als Agentur-Betreiber möchte ich mehrere Layouts je Site anlegen und pro Seite ein Layout wählen (Default vorausgewählt), damit Grundgerüste (Header/Footer) konsistent sind.
35. Als Agentur-Betreiber möchte ich einen `outlet`-Baustein („Inhalt hier einsetzen"), der kontextuell gefüllt wird (im Layout: Seite; im Entry-Template: Artikel), damit ein Konzept alle Spleiß-Fälle abdeckt.
36. Als Agent möchte ich Bindings in zwei Formen nutzen (Whole-Prop `{ "$entry": "cover" }` und Text-Mix `„Neues von {entry.title}"`), damit Inhalte in Sektionen fließen.
37. Als Agent möchte ich Bindungs-Quellen `entry.*`, `parentEntry.*`, `site.*`, `route.query.*` mit Typ-Kompatibilitätsprüfung nutzen, damit Bindings validiert und deterministisch auflösen.
38. Als Agentur-Betreiber möchte ich die Kuratierte Sektion `collection-list` (Sortierung, Limit, geschlossenes Filter-Set, `excludeCurrent`, Blättern `?seite=N`, Varianten cards/grid/list) einsetzen, damit Listen ohne Code funktionieren.
39. Als Agentur-Betreiber möchte ich `card`-Bausteine in einem Item-Slot der Liste (image-top/horizontal/text) mit Bindings bestücken, damit Karten-Designs sauber entstehen.
40. Als Agentur-Betreiber möchte ich „Weitere Artikel"-Blöcke (Ausschluss des aktuellen Artikels + Filter), damit Detailseiten sinnvoll verlinken.
41. Als Agent möchte ich, dass Re-Bakes nur betroffene Seiten treffen (Abhängigkeits-Index: Entry→Seiten, Collection→Listen, Layout/Template→Nutzerseiten), damit Builds schnell bleiben.
42. Als Agentur-Betreiber möchte ich eine Live-Vorschau im Entry-Editor (aktualisiert automatisch beim Tippen, read-only), damit ich Inhalte in echter Optik sehe — Inline-Bearbeitung dort ist bewusst nicht v1.

### Visueller Editor

43. Als Agentur-Betreiber möchte ich im Design-Modus pro Breakpoint ein eigenes Fenster nebeneinander (Zoom/Pan, Start ~50 %, echte Media-Queries; alle Fenster voll editierbar), damit ich alle Ansichten gleichzeitig im Blick habe.
44. Als Agentur-Betreiber möchte ich im Live-Modus ein Fenster in echter Größe (normal scrollbar), damit ich das Verhalten der echten Seite teste.
45. Als Agentur-Betreiber möchte ich Inline-Text-Editing (Doppelklick → direkt tippen, plaintext; Änderung live in allen Breakpoints; Escape = Revert als ein Undo-Eintrag), damit Texte ohne Panel-Klicks entstehen.
46. Als Agentur-Betreiber möchte ich Explorer-Tabs (Ebenen · Seiten · Vorlagen · Medien), damit ich Baum, Site-Explorer (inkl. Vorlagen-Abschnitt) und Library an einem Ort habe.
47. Als Agentur-Betreiber möchte ich ein Cmd+K-Spotlight (Seiten, Sektionen mit Thumbnails, Aktionen wie „Seite wechseln", „Sektion einfügen", „Publizieren"), damit alles tastatur-schnell erreichbar ist.
48. Als Agentur-Betreiber möchte ich Selection-/Hover-Rings, Alt-Klick-Ebenen-Auswahl und eine Mini-Toolbar am Element (Duplizieren/Löschen/Verschieben), damit Feinschliff-Arbeit flüssig ist.
49. Als Agentur-Betreiber möchte ich URL-Deep-Links (`?page=&node=&mode=&bp=`), damit Zustand teilbar und reload-sicher ist.
50. Als Agentur-Betreiber möchte ich ein Medien-Fenster im Editor (Suchen, Hochladen, Einsetzen; Ordner/Tags/Smart-Listen), damit Assets ohne Kontextwechsel verfügbar sind.
51. Als Agentur-Betreiber möchte ich registry-generierte Property-Panels (Content/Aktionen/Styling, bedingte Sichtbarkeit) und semantische Token-Picker, damit keine handgebauten Panels gepflegt werden müssen.
52. Als Agentur-Betreiber möchte ich Undo/Redo über Mutations-Patches und ein History-Panel mit „Restore as Draft", damit Änderungen sicher rückgängig sind.
53. Als Agentur-Betreiber möchte ich, dass jede Editor-Aktion eine kanonische Mutation emittiert (Editor und Agent nutzen dieselbe Schreib-API), damit es nie zwei Wahrheiten gibt.
54. Als Agentur-Betreiber möchte ich bei Draft-Konflikten (Agent und ich gleichzeitig) einen klaren „neu laden"-Fehler statt stillem Überschreiben, damit nichts verloren geht.
55. Als Agentur-Betreiber möchte ich, dass Puck gepinnt ist und Upgrade-Tests die bekannten Bugs (#1829 ActionBar-Overlay, #1794 Inline-Editing im Root) einplanen, damit 0.x-Breaking-Changes kontrolliert landen.

### Media

56. Als Agentur-Betreiber möchte ich eine Medien-Bibliothek mit Ordner-Baum (anlegen, DnD-verschieben, Ordner löschen → „Ohne Ordner") und Tags (Filter + Bulk), damit Ordnung ohne Zwang entsteht.
57. Als Agentur-Betreiber möchte ich vier Smart-Listen (Ohne Alt-Text · Ohne Tags · Große Dateien · Zuletzt ersetzt) als Arbeitsflächen — „Ohne Alt-Text" speist direkt den Alt-Hard-Check.
58. Als Agentur-Betreiber möchte ich Dateien ersetzen (gleiche ID/URL; Verwendungen bleiben gültig; Metadaten bleiben; Replace-Historie mit Restore; Audit; CDN-Invalidierung), damit Korrekturen site-weit durchschlagen.
59. Als Agentur-Betreiber möchte ich feine Varianten (64 · 320 · 640 · 1024 · 1600 · 2048 · Intrinsic; kein Upscaling; AVIF+WebP+Fallback) mit automatischem `sizes`-Resolver aus der Sektions-Layoutmathematik, damit Bilder passend und schnell laden.
60. Als Agentur-Betreiber möchte ich Mehrfach-Bearbeitung (Alt-Texte, Tags, Ordner, Trash/Purge) mit Ergebnisbericht, damit Listenpflege effizient ist.
61. Als Agentur-Betreiber möchte ich einen Papierkorb (Soft-Delete, wiederherstellen; endgültig nur explizit) und dass gelöschte Assets referenzierende `assetRef`s als „broken" markieren (nie automatisch entfernen).
62. Als Agent möchte ich volle Medien-Rechte mit `write`-Scope (`upload_asset`, `update_asset`, `replace_asset`, `delete_asset`, `restore_asset`), damit Medienarbeit nicht am Scope klemmt — Schutz kommt von Trash, Replace-Historie, Audit und Programm-Badge „zuletzt von Agent geändert".
63. Als Agentur-Betreiber möchte ich, dass Uploads client-seitig signiert direkt zum EU-Storage gehen und die Engine bestätigt, damit große Dateien nicht durch die API müssen.
64. Als Agentur-Betreiber möchte ich Alt-Text-Pflicht mit Dekorativ-Ausnahme (Hard-Check), Blurhash/Aspect-Reservierung und Focal-Point-Crops, damit A11y und CLS stimmen.
65. Als Agentur-Betreiber möchte ich Videos ohne Transcoding (Poster automatisch, loop/muted-Optionen; Transcoding → v2), damit v1 einfach bleibt.

### Forms

66. Als Agentur-Betreiber möchte ich `contact`/`newsletter` als native Formular-Sektionen mit Feldliste (Text, E-Mail, Telefon, Textarea, Select, Radios, Checkbox, Datum, Zahl) im Editor konfigurieren, damit keine externen Form-Dienste nötig sind.
67. Als Agentur-Betreiber möchte ich „Sammlung aus Formular anlegen" (ein Klick erzeugt Ziel-Collection samt Feldern + Vorlage z. B. Status „neu/beantwortet"), damit Setup trivial ist.
68. Als Formular-Absender möchte ich, dass Absenden ohne JavaScript (POST → Danke-Seite) und mit JavaScript (Inline-Bestätigung, Feldfehler direkt am Feld, Ladezustand) funktioniert, damit ich in jedem Fall klarkomme.
69. Als Agentur-Betreiber möchte ich den Senify-Endpoint auf dem EU-VPS mit signiertem Formular-Token (HMAC: siteId, formId, Ausstellungszeit; cache-sicher, cookielos), damit statische Sites sicher einsenden können.
70. Als Agentur-Betreiber möchte ich automatischen Spam-Schutz (Honeypot, Mindest-Ausfüllzeit, Origin-Prüfung, Rate-Limits pro IP/Formular, Body-Cap, Feld-Whitelist), damit kein Captcha nötig ist.
71. Als Agentur-Betreiber möchte ich, dass der Server nur dem eingefrorenen Formular-Snapshot vertraut (Validierung gegen Definition, nicht gegen Client; unbekannte Felder abgelehnt), damit Manipulation wirkungslos ist.
72. Als Agentur-Betreiber möchte ich Benachrichtigungs-Mails (SMTP konfigurierbar; Job mit Retry/Backoff; Tokens für FormName/Feldwerte/Zeit/Quellseite/Link) und eine Ansicht im Programm, damit ich nichts verpasse.
73. Als Newsletter-Abonnent möchte ich Double-Opt-In (Bestätigungsmail mit Token/TTL → Bestätigungsseite → confirmed; Abmeldelink → unsubscribed), damit Anmeldung DSGVO-konform ist.
74. Als Agentur-Betreiber möchte ich Zustimmungs-Checkbox (Pflicht, verlinkte Datenschutz-Seite) und dokumentierte Consent-Fassung je Einsendung, damit Aufbewahrung bis Löschung sauber belegt ist.
75. Als Agentur-Betreiber möchte ich Formular-Hard-Checks bei Publish (Ziel-Collection existiert, Felder valide/eindeutige Keys, Consent mit Page-Link, Erfolgsseite existiert) und weiche Zustellbarkeits-/Spam-Statistiken, damit nichts Kaputtes live geht.

### Agenten, MCP & Skills

76. Als Agent möchte ich einen lokalen stdio-MCP über die Senify-CLI nutzen (`senify mcp configure` erkennt Claude Code/Cursor/opencode; `--print` Dry-Run), damit Setup ohne Handarbeit klappt.
77. Als Agentur-Betreiber möchte ich scoped API-Tokens (Name, Scopes, Ablauf; Secret einmal sichtbar, gehasht; Revocation sofort; letzte Nutzung), damit Zugriff kontrolliert ist.
78. Als Agentur-Betreiber möchte ich serverseitige Scope-Durchsetzung (`read`/`write`/`publish`) mit agentenlesbaren Fehlern, damit Scopes nicht umgehbar sind.
79. Als Agent möchte ich den Tool-Katalog v1 nutzen (Lesen: `whoami`, `list_sites`, `get_site`, `list_pages`, `get_page`-Outline, `get_nodes`, `list_sections`, `get_section` mit Golden, `get_theme`, `list_assets`, `search_docs`, `read_docs`, `senify_feedback`; Schreiben: `apply_mutations`, `create_page`, `update_theme`, `upload_asset`, `update_asset`, `create_preview`, `submit_for_review`, `restore_revision`; Lifecycle: `get_review_feedback`, `publish_release`, `rollback_release`, `delete_page`; Plus Content-, Media- und Referenz-Tools), damit ich alles Nötige ohne Lücken habe.
80. Als Agent möchte ich `apply_mutations` (Batch kanonischer Mutationen; `{ baseDraftVersion, mutations[], dry_run? }` → `{ newDraftVersion, undoBatchId, warnings[] }`; atomar all-or-nothing), damit komplexe Umbauten in einem Schritt gehen.
81. Als Agent möchte ich strukturierte Fehler (category validation/guardrail/conflict/auth/not_found; message, opIndex, field, suggestion als Handlungsanweisung), damit ich Fehler selbst beheben kann.
82. Als Agent möchte ich `dry_run` für Vorab-Prüfungen (vollständige Validierung + Guardrails ohne Schreiben), damit ich mutieren kann, ohne zu raten.
83. Als Agentur-Betreiber möchte ich Hard-Guardrails sofort beim Schreiben (max 1 Pin-Preset/Seite; max 2 Parallax-Layer/Viewport; keine Scroll-Listener; Reduced-Motion-Variante Pflicht) und erneut beim Submit, damit Performance-Regeln nie „durchgewunken" werden.
84. Als Agentur-Betreiber möchte ich Rate-Limits pro Token (Default 60/min, Burst 20; Publish/destruktiv 10/min; 429 mit retry-after) und ein volles Audit-Log (Zeit, Token, Tool, Args-Kurzfassung, Ergebnis, Entität, Dauer; append-only; Secrets redigiert), damit Missbrauch und Nachvollziehbarkeit geregelt sind.
85. Als Agent möchte ich ein `senify`-Skillpaket mit Knowledge-Router nutzen (workflow.md Master-Flow „Site aus Brief"; sections.md/errors.md generiert aus Registry/Tool-Katalog; motion.md, tokens.md, content.md, prompts/), damit ich ohne Trainingsdaten produktiv bin.
86. Als Agentur-Betreiber möchte ich `senify setup` als Ein-Kommando-Onboarding (Login/Token → MCP configure → Skill-Installation → Check `whoami`+`list_sites` → „arbeitsfähig ✓"), damit Agenten in Minuten startklar sind.
87. Als Agent möchte ich Feedback über `senify_feedback` melden (Tool-Fehler, fehlende Fähigkeiten, unklare Doku), damit das System kuratiert nachgeschärft wird.
88. Als Agentur-Betreiber möchte ich Profile (`clean`/`standard`/`showcase`, Default `standard`) mit Intensity-Caps, Preset-Klassen und Lenis/3D-Regeln; Profil-Wechsel validiert und listet Verstöße (nichts ändert sich still).

### Lifecycle, Versionen & Review

89. Als Agentur-Betreiber möchte ich, dass jede Seite einen lebenden Draft hat und Publish eine unveränderliche Revision erzeugt; Release bündelt alle Seiten-Revisionen + Theme-Snapshot, damit Veröffentlichungen atomare, vollständige Site-Zustände sind.
90. Als Agentur-Betreiber möchte ich Previews als echte Draft-Builds mit Token-URL + TTL (30 Tage) und Löschjob, damit Teilen und Aufräumen geregelt sind (Drafts leaken nie).
91. Als Agentur-Betreiber möchte ich append-only-Semantik (Restore → neuer Draft; Rollback → neues Release mit `basisReleaseId`), damit Historie unveränderlich bleibt.
92. Als Agent möchte ich die Seite vor Änderungen als Outline lesen (`get_page` → `get_nodes` selektiv; `draftVersion`), damit ich token-effizient arbeite.
93. Als Agent möchte ich `create_preview` (Draft-Build → PreviewId + Token-URL) und `submit_for_review` (Preview + Diffs; Hard-Guardrails müssen passen), damit meine Arbeit den Review erreicht.
94. Als Agentur-Betreiber möchte ich dreiteilige Review-Items (Struktur-Diff JSON-Tree, Screenshot-Diff betroffene Seiten × 3 Breakpoints, Preview-Link; Motion-Video nur bei Motion-Änderungen) mit Aktionen Approve / Request changes / Discard, damit ich visuell, strukturell und motion-seitig prüfen kann.
95. Als Agentur-Betreiber möchte ich, dass Request changes eine Pflicht-Notiz in den Thread schreibt, die der Agent über `get_review_feedback` liest, damit Iterationen gerichtet sind.
96. Als Agentur-Betreiber möchte ich, dass Discard den Draft auf den Stand vor dem Review-Block zurückstellt (Änderungen verworfen, Historie/Preview bleiben), damit Fehl-Läufe folgenlos sind.
97. Als Agentur-Betreiber möchte ich, dass Approve den Publish-Flow auslöst (Release-Assembly → Bake → atomarer Swap) und `publish`-Scope/Mensch-Policy gilt, damit nie ein Agent alleine live schaltet.
98. Als Agentur-Betreiber möchte ich Release-Historie und Page-Revisionsliste mit JSON-Diff und „Restore as Draft"/„Re-Rollout", damit ich jederzeit zurück kann.

### Qualität, AEO & Checks

99. Als Agentur-Betreiber möchte ich stufenweise Checks — Schreiben (live je Mutation), Submit (vollständiger Katalog; Hard-Fail ⇒ kein Review-Item), Publish (Defense-in-Depth + Report) — damit Fehler früh und spät gefangen werden.
100. Als Agentur-Betreiber möchte ich Hard-Checks: Motion-Guardrails (03), kaputte interne Links, fehlende Alt-Texte, Kontrast < WCAG AA (Token-Paare), fehlender Seitentitel/Meta, ungültiges JSON-LD; Weich: Lighthouse/CWV (Ziel 80–90 bei Motion), Bundle-Größen, externe Links, Screenshot-Abweichungen (Review) — Ergebnisse im Review-Tab „Checks" und im Release-Audit.
101. Als Agentur-Betreiber möchte ich das AEO-Set standardmäßig pro Site (`/llms.txt`, `.md` je Seite, Structured Data JSON-LD, semantisches HTML, Sitemap, Robots; pro Site abschaltbar), damit Sites „agent-ready by default" sind.
102. Als Agentur-Betreiber möchte ich Structured Data automatisch (Organization/LocalBusiness, WebSite, WebPage, BreadcrumbList) + sektions-bewusst (z. B. faq → FAQPage) mit Schema-Validierung, damit Rich Results stimmen.
103. Als Agentur-Betreiber möchte ich Detailrouten von Entries automatisch in Sitemap/llms.txt/.md/JSON-LD (z. B. Article), damit Inhalte auffindbar sind.
104. Als Agentur möchte ich weiche Style-Adhärenz-Hinweise gegen das Referenz-Profil, damit ich im Stil bleibe, ohne blockiert zu werden.
105. Als Agentur-Betreiber möchte ich AEO der Plattform selbst (Portal-Exports llms.txt/llms-full.txt/.md je Seite + MCP-Docs-Tools), damit Agenten die Doku direkt konsumieren.

### Hosting, Deploy & Betrieb

106. Als Agentur-Betreiber möchte ich die Plattform lokal betreiben (Engine, Postgres, Worker) und Sites als statische Artefakte auf Vercel/Netlify deployen (Adapter-Interface `deploy`/`protect`/`addDomain`/`remove`; Deployment je Release unveränderlich; Rollback = Re-Deploy), damit Sites schnell und austauschbar gehostet sind.
107. Als Agentur-Betreiber möchte ich geschützte Preview-Deployments mit TTL-Cleanup und Screenshot-/Video-Jobs auf der Preview-URL, damit Review-Infrastruktur darauf läuft.
108. Als Agentur-Betreiber möchte ich Domains (Subdomain-Default `kunde.senify.xyz`, Custom-Domain per Hosting-API, TLS automatisch), damit Kunden-URLs einfach sind.
109. Als Agentur-Betreiber möchte ich tägliche EU-Backups (Postgres-Dump + Assets) mit dokumentiertem Restore und Plattform-Update per Image-Redeploy, damit Betrieb sicher ist.
110. Als Agentur-Betreiber möchte ich den Forms-Endpoint live auf dem EU-VPS (TLS via Caddy; lokal derselbe Endpoint für Tests/Previews), damit Daten bei mir bleiben.

### Portal & Doku

111. Als Agentur-Betreiber möchte ich ein Docs-Portal (Getting Started · Platform · Reference · Guides · Changelog; Astro + MDX; Plattform-Tokens) mit Referenzen generiert aus Registry/Tool-Katalog/Fehlercodes, damit Doku nie driftet.
112. Als Agentur-Betreiber möchte ich Pagefind-Suche + „Ask AI" (BYOK, Quellenlinks), damit finden und fragen schnell geht.
113. Als Agent möchte ich `search_docs`/`read_docs` gegen dieselben Inhalte, damit ich über MCP an die Doku komme.
114. Als Agentur-Betreiber möchte ich, dass Portal und Skillpaket aus derselben Generierungs-Pipeline stammen, damit sie nie auseinanderlaufen.

## Implementation Decisions

> Detailtiefe je Entscheidung: siehe verlinkte Artefakte. Dieser Abschnitt ist die kondensierte Bau-Anweisung.

### Modul-Landkarte (Monorepo, pnpm-Workspaces, TypeScript überall)

- **`engine`** — Node/TS: HTTP-API, Postgres (JSONB), kanonische Mutations, Content-Services (Collections/Entries/Versionen/Redirects/FTS), Media-Services, Lifecycle (Revisionen/Releases/Previews), Review, Forms-Endpoint (signiertes Token, Spam-Schutz, SMTP-Jobs), Referenzen-Service, Profile/Guardrail-Validierung, Auth (Tokens/Scopes), Audit. Einzige Schreib-API für Editor und MCP. (`artifacts/01`, `04`, `05`, `22`, `26`, `28`)
- **`section-sdk` + `registry`** — TypeBox als Single Source (Validierung + MCP-Verträge + Editor-Controls in einem Schema); SectionDefinition mit `props`/`variants`/`styleProps`/`slots`/`allowedChildren`/`motionPresets`/`golden` (Beispiel-JSON + Thumbnails 3 Breakpoints); Katalog: 25 Sektionen × 2–3 Varianten + Delta (`collection-list`, `card`, `outlet` → 28; `contact`/`newsletter` nativ). (`artifacts/08`, `22`, `23`, `26`)
- **`renderer`** — Astro 7 SSG; Section-Auflösung über Registry; zentraler Dispatcher für `client:*` (Hydration nur echte Interaktion + 3D); Page-Script-Layer (GSAP+ScrollTrigger+Lenis werten `node.motion` deklarativ aus; kein Sektions-Client-Code); Page-Controller + Shared-Store für Cross-Island; ein WebGL-Canvas/Seite lazy (R3F), Mobile/RM = Poster; Bake pro Release → statische Artefakte; Previews = echte Draft-Builds; AEO-Outputs (.md, llms.txt, JSON-LD, Sitemap). (`artifacts/02`, `03`, `13`)
- **`editor`** — React + Puck (MIT, gepinnt): dünner Adapter NodeTree ⇄ Puck; jede Aktion = kanonische Mutation; Frame-Manager (Eigenbau, größter Block: ein Store, mehrere Preview-Instanzen, frame-bewusste Overlays/DnD) für Design-Modus (Desktop/Tablet/Mobile nebeneinander, Zoom/Pan, Start 50 %); Live-Modus (ein Frame); Inline-Text-Editing (contentEditable plaintext; Commit live in alle Frames; Escape = Revert als ein Undo); Explorer-Tabs; Cmd+K; Deep-Links `?page=&node=&mode=&bp=`; Medien-Fenster; Registry-generierte Panels; Override-Badges; History-Panel. (`artifacts/09`, `24`; Gap-Analyse `research/28-puck-gap.md`; Bugs #1829/#1794 einplanen)
- **`app`** — Programm-Shell (Browser-App): global Tabs Projekte · Referenzen · Einstellungen; Projekt-Arbeitsbereich mit Kopf-Leiste Seiten · Artikel · Vorlagen · Prüfen · Aktivität · Projekt-Einstellungen; Content-Workspace (Entries, Autosave, Versionen, Live-Vorschau); Review-Ansicht; Aktivität aus Audit; Plattform-UI nutzt dasselbe Token-System. (`artifacts/27`, `22`, `23`, `06`)
- **`analysis-worker`** — Playwright headless: Capture 3 Größen (1440/810/390) + Full-Page-/Sektions-Screenshots + DOM-Dump + Asset-Liste + Motion-Sampling (Transitions/Durations/Easings, Scroll-/Hover, Lib-Erkennung); deterministische Extraktion (Farb-Histogramm, Font-Inventar, Spacing/Radii/Shadows/Container, Breakpoints); KI-Analyse (Familien-Klassifikation, Vokabular, Komponenten-Inventar, Regeln, Evidenz/Konfidenz) → Design-Profil (JSONB) + Stil-Blatt; Fallback Screenshot-Upload. (`artifacts/28`, `research/27`)
- **`mcp`** — CLI + stdio-MCP (Tool-Kern transport-agnostisch im geteilten Paket): Tool-Katalog (read/write/publish), `apply_mutations`-Vertrag, Fehlerformat, Rate-Limits serverseitig; CLI-Befehle `senify start | setup | mcp configure | tokens …`. (`artifacts/04`, `10`)
- **`docs-portal`** — Astro + MDX, statisch, Plattform-Tokens; IA Getting Started/Platform/Reference/Guides/Changelog; Referenzen generiert aus Registry/Tools/Fehlercodes; Pagefind + Ask AI (BYOK); llms.txt/llms-full.txt/.md-Exports. (`artifacts/12`)
- **`skills`** — senify-Skillpaket (Knowledge-Router; generierte sections.md/errors.md; workflow.md Master-Flow „Site aus Brief"; motion/tokens/content-Leitfäden; Szenario-Prompts). (`artifacts/11`)

### Kanonischer NodeTree & Mutations-Vertrag

- Flacher `NodeTree { rootNodeId; nodes: Record<NodeId, Node> }`; `Node { id, type, variant?, props, children?, slots?, overrides? (tablet/mobile), motion?, locked?, hidden? }`. Verschachtelung registry-reguliert; gebrochene Referenzen werden markiert, nie gelöscht; Reihenfolge = Array-Ordnung. (`artifacts/01`)
- Prop-Typen: `text`, `richtext` (Inline-Runs; Markdown an der MCP-Grenze), `number`/`boolean`/`enum`, `color` (Token-Ref `{ "$token": … }` bevorzugt), `assetRef { assetId, focal? }`, `link { pageId? , url? }`, `list`, `slot`.
- Schreib-API ausschließlich kanonische, benannte Mutations: `insertNode`, `deleteNode`, `duplicateNode`, `moveNode`, `wrapNode`, `updateNodeProps`, `updateNodeMeta`, `setBreakpointOverride`, `clearBreakpointOverride`, `setMotion`, `clearMotion`, `updatePageMeta` (+ Theme-/Asset-/Site-Kataloge). Jede Mutation: validiert (TypeBox + Registry) → erzeugt Undo-Patch → deterministisch; `baseDraftVersion` pro Write (optimistisches Locking; Konflikt = klarer Fehler, kein stilles Überschreiben). (`artifacts/01`, `09`)
- Alle Mutations mit `author { kind: "human"|"agent", id, label }`; Audit append-only. (`artifacts/01`, `04`)

### Content-Kern (additiv)

- `Collection { id, siteId, name, slug, fields[], titleField, dateField?, urlPattern?, supports[], listColumns? }`; `FieldDef { id, key, label, type, required?, defaultValue?, unique?, description?, options?/targetCollections?/subFields?/mediaKind? }` — 16 Typen; Relation mit Ziel-Whitelist; Repeater genau 1 Ebene; eingebettete Felder (kein Universal-Tabellen-Muster). (`artifacts/22`)
- `Entry { id, siteId, collectionId, slug, status, cells (JSONB keyed by FieldId), activeVersionId?, version, author, … deletedAt? }`; Status gespeichert (draft/published/unpublished/scheduled); `EntryVersion` immutabel je Publish (Retention-Limit Default 50); `EntryRedirect` (301); Trash = Soft-Delete, Purge nur `publish`-Scope; Konfliktschutz `baseVersion`; Autosave in Draft (nie Versionen); FTS (tsvector gewichtet title A/slug B/body C; Sprachkonfig pro Collection, Default `simple`). (`artifacts/22`)
- Built-ins: `title` + `slug` immer; optional `body` (Markdown kanonisch), `featuredMedia`, `seoTitle`, `seoDescription` via `supports` (Default `["drafts","versions","scheduling","seo","search"]`).
- Taxonomien: Kategorien = Collection + Relation; Tags = `multiSelect`.

### Templates, Bindings & Loops (additiv)

- `Page.template?: { kind: "layout", label } | { kind: "collection", collectionIds[], priority }`; `Page.layoutId?`; Vorlagen-Pages ohne eigene Route (nicht in Navigation/Sitemap). (`artifacts/23`)
- Resolve-Kette: Layout → Entry-Template → Seiten-/Entry-Inhalt, gespleißt an `outlet`-Bausteinen (v1: ein Outlet pro Layout gefüllt; Templates ohne Outlet = unfertig/ignoriert); ID-Rekeying + `reindexNodeParents` beim Merge.
- Bindings: Whole-Prop `{ "$entry": "cover" }` + Token-Mix `"Neues von {entry.title}"`; Quellen `entry.*` (dotted für Relationen), `parentEntry.*`, `site.*`, `route.query.*`; Typ-Kompatibilität validiert; Markdown-Body → HTML sanitisiert; fehlende Werte leer, unbekannte Felder = Fehler; ein Resolver für Build + Live-Vorschau.
- Sektion `collection-list` (Props: `collectionId`, geschlossenes `filter`-Set `is|isNot|isTrue|isFalse|isSet|isEmpty`, `orderBy` Default dateField desc, `limit` Default 6, `excludeCurrent`, `pagination: none|pages` mit `?seite=N`, `paramName` Default „seite", `emptyText`, `variant cards|grid|list`); Item-Slot mit genau einem `card` (Varianten image-top/horizontal/text); kein JS für Blättern; Liste zur Buildzeit als statisches HTML (Prefetch); verschachtelte Listen/Infinite-Scroll nicht v1.
- Detailrouten aus `Collection.urlPattern` (z. B. `/blog/{slug}`); nicht-published → 404; Slug-Historie → 301; AEO-Outputs automatisch.
- Re-Bake: Abhängigkeits-Index (Entry→Seiten mit Bindings; Collection→Listenseiten; Layout/Template→Nutzerseiten); Entry-Publish/Unpublish/Delete und Layout-/Template-Änderungen stoßen Jobs an (Task/Queue-Muster); Page-Publishing bleibt beim Release-Modell.
- Live-Vorschau: leichter Server-Render der Sandbox (gleicher Renderer/Resolver), debounced, read-only; Inline-Bearbeitung dort nicht v1.

### Lifecycle & Review (Verträge)

- `Revision` immutabel je Page (tree-Snapshot); `Release` bündelt ALLE Seiten-Revisionen + Theme-Snapshot (`pageRevisions[]`, `themeSnapshotId`, `basisReleaseId?`); Publish = neues Release + Bake + atomarer Swap + `activeReleaseId`; Rollback = neues Release aus altem Zustand. (`artifacts/05`)
- `Preview` = echter Draft-Build + signierte Token-URL + TTL 30 Tage + Löschjob + Status ready/failed/expired; Drafts leaken nie. Previews sind immutable Snapshots.
- Restore (Page/Entry) → neuer Draft; nichts wird umgeschrieben; Page-Status abgeleitet (draft-only/published/draft-ahead).
- `ReviewItem` (id, siteId, previewId, draftBaseRef, pages[], author, status submitted/in_review/approved/changes_requested/discarded, diffs {structureRef, screenshotsRef, motionVideoRef?}, guardrails {hard/soft}, thread[], …); Trigger = Agent-Submit; Aktionen Approve/Request changes (Pflicht-Notiz)/Discard (Draft-Restore); Granularität = ganzes Item; Screenshots betroffene Seiten × 3 Breakpoints, Vorher = aktives Release, Nachher = Preview, Animationen deaktiviert; Motion-Video nur bei Motion-Änderungen. (`artifacts/06`)

### MCP-Vertrag (Kern)

- `apply_mutations`-Input `{ siteId, pageId, baseDraftVersion, dry_run?, mutations[] }` → Output `{ newDraftVersion, undoBatchId, warnings[] }`; atomar (nichts bei Fehler, Undo-Batch erst bei Erfolg); `dry_run` voll validiert.
- Fehlerformat `{ error: { category: validation|guardrail|conflict|auth|not_found, message, opIndex?, field?, suggestion } }` — Handlungsanweisungen.
- Scopes: `read` (Kontext/Queries/Schema/Docs), `write` (Drafts; Default zusammen mit read), `publish` (live/zurücknehmen/löschen; auch Purge); serverseitig am API-Gateway erzwungen; Token gehasht, revozierbar; Rate-Limits + Audit.
- Content-Tools (`list_collections` … `restore_entry_version`, `search_entries`), Media-Tools (+ `replace_asset`, `delete_asset`, `restore_asset`), Referenz-Tools (`analyze_reference`, `list_references`, `get_reference`, `apply_reference`), Docs-Tools (`search_docs`, `read_docs`) und `senify_feedback` als feste Katalog-Erweiterungen.

### Guardrails, Profile & Checks

- Hard (validiert, blockiert Schreiben/Submit/Publish): max 1 Pin-Preset/Seite; max 2 Parallax-Layer/Viewport; keine `scroll`-Listener-Muster/kein State pro Scroll-Frame; Reduced-Motion-Variante Pflicht (WCAG C39/2.3.3). (`artifacts/03`)
- Weich (Review-Hinweise): Reveals < 800 ms, max 1 Char-Split/Seite, Preloader ≤ 2,5 s, Anti-Pattern-Katalog, Lighthouse/CWV 80–90 bei Motion (Richtwerte ohne Gates), externe Links, Screenshot-Abweichungen (Info).
- Profile: `clean` (Intensity ≤ 3; Lenis aus; keine Pins; kein 3D; Presets A/B-Reveals/D/E/F; Lighthouse 95+), `standard` Default (≤ 7; Lenis an; max 1 Pin; kein 3D; + B-Scrub/Sticky/Pan + C; 85–95), `showcase` (≤ 10; Lenis an; max 1 Pin; 3D ja (max 1 Canvas); alle Presets; 80–90); `Site.profile` per Mutation; Wechsel validiert und listet Verstöße. (`artifacts/21`)
- Checks-Pipeline: Schreiben (live je Mutation) → Submit (vollständiger Katalog; Hard-Fail ⇒ kein Review-Item) → Publish (Defense-in-Depth + Report); Ergebnisse im Review-Tab „Checks" + Release-Audit; Fehler nutzen das MCP-Fehlerformat. (`artifacts/13`)
- Motion-Spec: `preset` + `intensity` (1–10) + `tokens` (ease/duration/stagger aus Theme) + `trigger` + `reducedMotion` + `budget`; deterministische Übersetzung, kein freier Motion-Code durch Agenten; Page-Script-Layer, Prototyp validiert (ein persistenter Canvas, Shared Store, ein rAF-Loop, Lenis↔ScrollTrigger-Sync). (`artifacts/03`, `prototypes/scroll-3d/`)

### Token- & Theme-System

- Zwei Ebenen (Primitive → Semantik) über 6 Skalen (Farbe, Typo, Spacing, Radius, Shadow, Motion); Skalen-Engine generiert + überschreibbar; Light/Dark strukturell; DTCG-nahes JSON → CSS-Variablen + Tailwind-v4-Theme; semantische Rollen zuerst; Fonts kuratiert + self-hosted (woff2, preload, `font-display: swap`); Springs als `linear()` + JS-Spring. (`artifacts/07`)

### Forms (Verträge)

- `FormFieldSpec` (kind text/email/phone/textarea/select/radios/checkbox/date/number; key eindeutig = Feldname-Whitelist; required/placeholder/options/validation) + `FormProps` (fields[], targetCollectionId, consent Pflicht mit verlinkter Page, successMessage, successPageId, honeypotKey Default „company").
- `POST /forms/:siteId/:formId`: signiertes Formular-Token (HMAC: siteId, formId, Ausstellungszeit) im Bake eingestampft; Spam-Schutz automatisch (Honeypot, Mindestzeit < 2 s verwerfen, Origin Pflicht, Rate-Limits, Body-Cap 1 MB, Feld-Whitelist); Validierung nur gegen eingefrorenen Snapshot; Einsendung = Entry (Auto-Felder submittedAt/sourcePage/optional Status); Benachrichtigung als Job (Retry/Backoff) + Programm-Ansicht; DOI-Flow (pending → Bestätigungsmail Token/TTL → confirmed; Abmeldelink → unsubscribed); DSGVO-Hinweis + Consent-Doku je Entry. (`artifacts/26`)

### Referenzen-Pipeline (Verträge)

- `Reference` (id, name, sourceUrl, capturedAt, status analyzing|ready|failed, families[], vocabulary[], profile { tokens, components, rules constants/never }, styleBrief (maschinenlesbar EN; UI Deutsch), evidence[] (claim, confidence, source), snapshots[] intern, provenance { url, date, hash }); Nachbearbeitung → neue Profil-Revision (append-only, leichtgewichtig).
- Evidence-Stufen: `confidence` = `confirmed | observed | inferred` (nie hochstufen); jeder Wert mit Häufigkeit + Belegstellen. Motion-Sampling liefert Reveal-/Effekt-Inventar mit exakten Runtime-Params und mappt auf die Presets aus `artifacts/03`.
- **Umsetzungsbasis (15.09.):** Die Probe-Scripts aus `Repos/site-clone` (MIT) werden adaptiert — Token-Extraktion (frequenz-gerankt, `:root`-Vokabular behalten), Motion-Probe (GSAP/ScrollTrigger/WAAPI/Lenis verbatim), Surface-Map (GPU-/Video-/SVG-Routing, Lazy-GPU-Warnung); Tablet-Breite 810. Details: [research/29-site-clone-learnings.md](research/29-site-clone-learnings.md).
- Skalen-Zuordnung (Projekt): je Skala (Farben/Typo/Motion/Rest) eine Referenz; Default eine für alles; Theme-Ableitung → Senify-Theme; „too close"-Repair-Hinweise; QA-Adhärenz weich; Snapshots nie in die Site-Medien-Bibliothek. (`artifacts/28`)

### Shell, Start & Betrieb

- `senify start` startet Engine (Server, Postgres, Worker) und öffnet Browser; Health-Check mit klarem Fehlerbild; Autostart optional. (`artifacts/27`)
- Adapter-Interface für Hosting: `deploy(artifact) → id`, `protect(id)`, `addDomain(host, id)`, `remove(id)`; erste Implementierungen Vercel + Netlify; Deployment je Release; Rollback = Re-Deploy; Previews geschützt + TTL; Subdomain-Default; tägliche EU-Backups. (`artifacts/14`)

## Testing Decisions

**Was einen guten Test ausmacht:** Nur externes Verhalten prüfen, nie Interna. Kein Test gegen private Funktionen, Datenbanktabellen direkt oder Komponenten-Interna — sondern gegen die drei bestätigten **Prüfstellen** (Nutzer-Entscheidung im `/to-spec`-Dialog):

### Prüfstelle 1 — Engine-API (die zentrale Schnittstelle)

Alles spricht mit der Engine: Editor, MCP, Programm-Shell, Forms-Endpoint. Tests laufen als **Black-Box gegen die HTTP-API** (echte Postgres in einem Wegwerf-Schema):

- Jede kanonische Mutation: gültig → erwarteter Zustand; ungültig → erwartetes Fehlerobjekt (Kategorie/Feld/Suggestion).
- `baseDraftVersion`/`baseVersion`-Konflikte → 409 mit Neu-Laden-Anweisung; keine stillen Überschreibungen.
- Scope-Durchsetzung (`read`/`write`/`publish`) pro Tool/Endpoint; Revocation wirkt sofort.
- Guardrails (hart) blockieren; `dry_run` validiert ohne Schreiben; Warnings kommen als `warnings[]`.
- Content: Entry-Workflow-Zustandsmaschine (draft→published→unpublished→scheduled→…), Versionen nur bei Publish, Slug-301, Trash/Purge, FTS-Treffer, Re-Bake-Trigger (Job enqueued).
- Forms: Token-Signatur (gültig/abgelaufen/manipuliert), Snapshot-Validierung, Spam-Heuristiken, Einsendung→Entry, DOI-Übergänge.
- Referenzen: Pipeline mit **gemocktem Capture** (Fixture-Snapshots) → Profil-Form + Evidenz; Statusübergänge.
- Lifecycle: Publish → Release-Assembly → Bake-Auftrag → Swap; Rollback erzeugt neues Release mit `basisReleaseId`; Preview-TTL.

### Prüfstelle 2 — Bake-Output (die gebaute Website)

Tests bauen aus Fixture-Releases (Registry-Golden-Beispiele als Inhalte) und prüfen die **erzeugten statischen Artefakte**:

- HTML: semantische Struktur, Heading-Hierarchie, Layout-Integration (Layout→Template→Inhalt an `outlet`‑Splice).
- Bindings/Listen: gefüllte Werte, Text-Mix, `collection-list` mit Sort/Limit/Filter/`excludeCurrent`, `?seite=N`-Routen, leere Liste, Karten-Slot.
- Routen: Detailrouten aus `urlPattern`, 404 für nicht-published, 301 für alte Slugs; keine Draft-Leaks (Previews enthalten Drafts, Produktions-Bake nie).
- Media: `srcset`/`sizes` aus der Ladder (kein Upscaling), AVIF/WebP/Fallback, Aspect-Reservierung, Focal-Crops.
- AEO: `.md`-Versionen, `llms.txt`, Sitemap, JSON-LD (validiert gegen Schema; FAQPage aus faq), kein 3D als LCP.
- Forms: Token im Markup, Endpoint-Aufruf aus dem Formular, No-JS-Redirect-Pfad.
- Motion: `node.motion` erzeugt erwartete Page-Script-Konfiguration (deterministische Übersetzung); RM-Varianten vorhanden.

### Prüfstelle 3 — MCP-Workflows (Agenten-Abläufe)

End-to-End über den stdio-MCP-Server (echte Engine, echter Client-Transport) — die Szenarien aus dem Master-Flow:

- „Site aus Brief": Seiten anlegen → Sektionen via `get_section`-Golden einfügen → `create_preview` → `submit_for_review` → nach Freigabe `publish_release`.
- „Content-Publish → Re-Bake": Entry erstellen → publish → betroffene Route/Liste erscheint neu gebacken; Konflikt-Fall (`baseVersion`) sauber.
- „Referenz → Theme → Build": `analyze_reference` (gemockter Capture) → `apply_reference` → Theme-Draft → Seiten bauen → Bake enthält Referenz-Tokens.
- „Review-Loop": Submit → Request changes → Agent liest `get_review_feedback` → Nachbesserung → Approve; Discard-Pfad stellt Draft wieder her.
- „Formular-Einsatz": Formular bauen → Bake → Submission (Test-Endpoint) → Entry + Benachrichtigungs-Job + DOI-Mail (SMTP-Fixture).
- Guardrail-Fall: Pin-Kollision beim Schreiben → Fehlerobjekt mit `suggestion` (kein Schreiben) — die Fehlertexte sind selbst Testvertrag.

**Getestete Module:** `engine` (API-Verträge), `renderer` (Bake-Artefakte), `mcp` (Tool-Verträge + Workflows), `registry`/`section-sdk` (Schemas + Golden-Konsistenz), `analysis-worker` (Pipeline mit Fixtures). **Nicht** primär automatisiert: Editor-Feinschliff/Ästhetik (Review-Urteil), Motion-Geschmack (Motion-Diff im Review), Shell-Layout (manueller Smoke).

**Prior Art:** Greenfield — es gibt noch keine Tests. Etablierte Referenzen für das Vorgehen: der validierte Prototyp `prototypes/scroll-3d/` (Nutzer-Check als Abnahmemuster), die Registry-`golden`-Beispiele als Fixtures (Beispiel-JSON + Thumbnails), Puck-Issues #1829/#1794 als bekannte Regression-Fälle (Upgrade-Tests), `research/28-puck-gap.md` als Aufwandsbasis.

## Out of Scope

- Produktisierung: SaaS-Billing, Accounts, Marketing-Website, externes Onboarding (kein Produkt-Geschäft).
- Importe: Framer/Webflow/WP → Senify (erster v2-Kandidat).
- i18n/Multilingual für generierte Sites.
- Plattform-eigene AI-APIs (Content-/Bild-Generierung).
- Marktplatz/Ökosystem (Third-Party-Sections, Plugins), Mobile-Apps.
- Figma-Sync/Design-Tool-Auto-Importe; weitere Komfort-Features jenseits des Referenzen-Tabs (v2).
- Newsletter-Kampagnen-Versand (Massenmails, Segmentierung) — v1 sammelt nur Abos ein (DOI).
- Desktop-Verpackung (Tauri)/Remote-Betrieb; Rollen-UI (intern, Single-Operator); Spreadsheet-Grid für Entries; Inline-Bearbeitung in der Entry-Live-Vorschau; verschachtelte Listen/Infinite-Scroll; Video-Transcoding; Layout-Morph/SPA-Übergänge; Re-Analyse-Funktion für Referenzen; Private-Media-Delivery; OAuth; Remote-MCP.
- OAuth/DCR, Cloudflare-Deploy-Implementierung (Adapter offen, später ohne Artefakt-Änderung).

## Further Notes

- **Build-Reihenfolge (Empfehlungen aus den Artefakten):** ① Sektions-Gerüst (navbar, footer, hero, content, media, cta; dann Überzeugung/Vertrauen/Zusatz — `artifacts/08`); ② Editor-Frame-Manager als größter Einzelblock zuerst schneiden (`artifacts/24`); ③ Shell-Paket inkl. `senify start` (`artifacts/27`); ④ Referenz-Analyse-Job als eigenes Paket (`artifacts/28`); ⑤ Content-Kern → Templates/Loops → Forms-Aufsätze in dieser Abhängigkeitsfolge (22 → 23 → 26).
- **Referenzmaterial:** Shallow-Clones unter `Repos/` (instatic, payload, emdash, taste-vault, puck, **site-clone**) + Deep-Dives `research/24`–`28` + `research/29-site-clone-learnings.md` (Umsetzungsbasis Referenzen-Pipeline); Framer-Analyse `research/22`; Renderer/Motion/Approval-Recherche `research/16`–`19`.
- **Sprache & Arbeitsweise:** Artefakte/UI Deutsch, Fachbegriffe Englisch; Nutzer-Fragen immer via Klick-Wizard (AGENTS.md); PHP-Kommentare sind hier irrelevant (TS-Stack).
- **AEO der Plattform selbst** (Portal-Exports + Docs-Tools) ist Teil von v1 — Agenten sind die primären Nutzer der Doku.
- **Risiken:** Puck-0.x-Upgrade-Drift (pinnen + Regression-Tests), Astro-Island-Orchestrierung (Dispatcher früh), Cross-Frame-Editing (Frame-Manager früh), Vercel-Hobby non-commercial (Plan einplanen), `Repos/`-Clones nicht committen.
- **Technologie-Check 15.09.2026** ([research/30](research/30-technologie-check.md)): GSAP-Plugins frei (echtes SplitText nutzbar) · Puck 0.23 aktuell, Bugs #1829/#1794 mit Workarounds eingeplant · Firefox weiter ohne Scroll-Timelines (Regel bestätigt) · llms.txt agenten-relevant, aber SEO-neutral (keine Ranking-Claims) · Cloudflare übernimmt Astro (Deploy-Adapter: Cloudflare Pages als nächste Priorität) · WebGPU Baseline (v1 bleibt WebGL, Renderer-Abstraktion) · MCP-Spec-RC 2026-07-28 (Remote = Streamable HTTP + OAuth 2.1).
