# Elementor hcm.local: Live-Analyse und offene Arbeiten

Stand 06.11.2026. Grundlage sind der laufende Editor, die WordPress-REST-Inventur, die lokale Datenbank und die vorhandenen Aufnahmen. Zugangsdaten, Anwendungspasswörter und Datenbankkennwörter stehen bewusst nicht in diesem Dokument. Die echten Klassen und Variablen der Site wurden nicht verändert.

## 1. Was jetzt mit der offenen Site möglich ist

Die Site ist eine echte lokale Tännig-Apotheke-Installation mit realen Seiten, Shop, Formularen, Theme-Builder-Templates und einem exponierten Design System. Damit lassen sich die bisher offenen Elementor-Punkte nicht nur an einer leeren Referenz, sondern an echten Inhalten prüfen.

**Sofort möglich**
1. Eine Testklasse und eine Testvariable im Design System anlegen, anwenden, priorisieren, umbenennen und löschen, jeweils mit Speichern, Neuladen und Frontend-Kontrolle. Die echten sechs Klassen und drei Variablen bleiben unangetastet, die Testobjekte werden danach entfernt.
2. Die sechs echten globalen Klassen (`leistungheading`, `leistungabsart`, `leistung`, `absatz`, `headinghero`, `Subheading`) auf Priorität, Verwendung, CSS und Vererbung untersuchen, ohne sie zu ändern.
3. Die drei echten Variablen (`accent` #103F92, `ueberschrift` #2a2a2a, `hell` #DEE3ED) auf Typ, Verwendung und Beziehung zu den Kit-Globalfarben prüfen.
4. Die echten Seiten und Templates auditen: Startseite (ID 824, rund 409 KB Elementor-Daten), Leistungen (ID 1009, rund 216 KB), die Testlabs, die Rechtstexte und die Shop-Seiten.
5. Den Theme Builder prüfen: Header-Template 789 und Footer-Template 860 sind live als Header/Footer zugewiesen, dazu kommen 17 Bibliothekseinträge.
6. Die Editor-Funktionsmatrix aufnehmen: Atomic Elements, klassische Widgets, Plugin-Widgets, Komponenten, Globals, Zustände, Responsive, Custom CSS, Finder, Struktur, Verlauf und Seiteneinstellungen.
7. Die Qualität der echten Site prüfen: Performance der großen Elementor-Seiten, Schriften und DSGVO, SEO, Barrierefreiheit, Sicherheit, Backups, Wartungsmodus und Plugin-/Versionsrisiken.
8. Die Daten für Senify extrahieren: Kit, globale Farben und Schriften, Klassen, Variablen, Templates, Seiten, Medien, Formulare und Shop-Daten. Das ist die Grundlage für den Import- und Paritätsabgleich.
9. Aufräumen: Testseite 1331 und temporärer Administrator ID 13 entfernen, sobald die Testläufe abgeschlossen sind.

## 2. Umgebung

- WordPress 7.1.4, Elementor 4.2.3, Elementor-Pro-Schicht 4.2.2 über das Plugin `pro-elements`, Hello-Elementor-Theme.
- Local by Flywheel, MySQL 8.0.35, Datenbank `local`, deutschsprachige Oberfläche.
- Aktive Elementor-Experimente: Container, Atomic Elements, Classes, Components, Variables, V4-Opt-in und Nested Elements. Die Atomic-Oberfläche ist damit vollständig aktiv.
- Administrator Adrian (ID 1) und der temporäre Abnahme-Admin `senify-acceptance-20261106` (ID 13). Testseite: ID 1331, Entwurf, Titel „Senify Elementor Abnahme 2026-11-06“.
- Die Site ist erreichbar; die ersten Editor-Ladevorgänge dauern deutlich länger als bei der schlanken Core-Referenz. Eine versteckte Loader-Vorlage verhindert einfache Ready-Checks. Der Editor ist deutsch, der Design-System-Button heißt „Design-System“.

## 3. Inventar der realen Site

### Seiten und Inhalte
- Veröffentlichte Seiten umfassen Startseite (ID 824), Leistungen (ID 1009), WPGHR Testlab (ID 1032), Slider Test (ID 476), Beispielseite (ID 1195), Shop, Mein Konto, Warenkorb und Kasse.
- Rechtstexte sind vorhanden: Impressum, Datenschutz, AGB und Widerruf. Zusätzlich existiert ein Entwurf „Privacy Policy“ (ID 3).
- Die Testseite 1331 ist ein leerer Entwurf für die laufende Abnahme.
- Zwei Produkte (WPAIS Test Alpha Headset, WPAIS Test Beta Tastatur) und eine abgeschlossene WooCommerce-Bestellung sind Testdaten. Währung EUR, Land DE:Niedersachsen.
- Drei MetForm-Formulare, fünf Navigationspunkte, 135 Anhänge und 374 Revisionen sind vorhanden. Der Content-Bestand ist damit deutlich größer als bei der bisherigen Core-Referenz.

### Elementor-Bibliothek und Theme Builder
- 17 `elementor_library`-Einträge. Das Standard-Kit ist ID 6.
- Header-Template 789 und Footer-Template 860 sind über die Pro-Theme-Builder-Bedingungen global zugewiesen.
- Weitere Einträge: Menü offcanvas, Services, Öffnungszeiten, Home, stacking cards, header2, Header1408, kontaktfooter, teamslider und mehrere Container-/Section-Bausteine.
- Die Theme-Builder-Bedingungen zeigen, dass die Site nicht nur Seiten, sondern auch globale Header-/Footer-Templates nutzt. Für die Senify-Parität ist das ein eigener Vertrag.

### Design System
- Sechs echte globale Klassen als `e_global_class`-Beiträge: `leistungheading`, `leistungabsart`, `leistung`, `absatz`, `headinghero`, `Subheading`.
- Drei echte Variablen aus der Live-Oberfläche: `accent` #103F92, `ueberschrift` #2a2a2a, `hell` #DEE3ED.
- Klassen-Manager ist exponiert über `elementor_global_classes_apply_class`, `update_class` und `remove_class`; zusätzlich existiert `elementor_atomic_widgets_edit_local_css_class`.
- Der Klassen-Manager erklärt Priorität, Umbenennen, Löschen und die Wirkung einer Änderung auf alle Elemente der Klasse. „Änderungen speichern“ ist vorhanden.
- Der Klassen-Speicher läuft über die `e_global_class`-Beiträge (Datenbankversion 4). Die drei Variablen sind live sichtbar; ihre exakte Speicherstelle (Beitrag, Option oder Kit-Einstellung) sollte vor einem Export noch eindeutig bestimmt werden.

### Kit und globale Gestaltung
- Kit ID 6 „Standard-Kit“ enthält:
  - Systemfarben: Primär #89A589, Sekundär #0A292B, Text #161616, Akzent #EAFFE5.
  - Sechs eigene Farben: #F4F7FA, #DEE3ED, #575757, #454545, #E73631, #F5F5F5.
  - Systemtypografie: Rubik 400 für Primär/Sekundär/Akzent, Inter 400 für Text; generische Sans-serif-Ausweichschrift.
  - Breakpoints: 768 px und 1025 px. Bildradius 25 px. Body-Hintergrund #FBFDFF.
  - Seitentitel-Selektor `h1.entry-title`, Site-Name „Tännig-Apotheke“, Site-Beschreibung „Ihre Apotheke in Würzburg und Versbach“.
  - Header-Footer-Elementor-Plugin: Scroll-to-Top-Text „Up“.
  - WPGHR-Animationseinstellungen: Easing `power3.out`, Dauer 700 ms, Reduced Motion `skip`, Split-Text-Revert aktiv.
- Die Kit-Farben und die drei Design-System-Variablen sind zwei unterschiedliche Schichten. Das ist für die Senify-Abbildung zentral: Kit-Globalfarben sind nicht automatisch dieselben Objekte wie Atomic-Variablen.

### Plugins und Theme
- 19 aktive Plugins, unter anderem Elementor, `pro-elements`, ElementsKit, MetForm, Header Footer Elementor, WooCommerce, All-in-One WP Migration, Duplicate Post, WordPress MCP, Novamira, Nick FB, Envato Template Kit, WPGHR sowie ein Maintenance-Plugin.
- Theme: Hello Elementor. Das Theme ist schlank; die Gestaltung kommt weitgehend aus Elementor.
- Die Pro-Schicht ist über `pro-elements` vorhanden, nicht über ein offiziell lizenziertes Elementor Pro. Pro-Parität bleibt damit weiterhin nicht belegbar.

## 4. Editor-Funktionsinventar

- Topbar: Design-System, Seite Einstellungen, Verlauf, Struktur, Finder, Vorschau der Änderungen, Optionen speichern, Publish, Geräteumschaltung.
- Panel: Elemente, Widgets, Komponenten, Globals; Atomic Elements (Div-Block, Flexbox, Raster, Tabs, Überschrift, Bild, Absatz, SVG, Button, YouTube, Trenner, Video, Background Video, Loop, Atomic Form); klassische Widgets und Plugin-Kategorien.
- Design System: Variablen und Klassen. Ein Defaults-Tab existiert in 4.2.3 nicht, anders als in der neueren Core-Referenz.
- Klassen-Manager: Liste, Priorität, Umbenennen, Löschen, Speichern, Einführungstext.
- Variablen: Liste der drei echten Variablen; Anlegen über Typauswahl, in der Core-Referenz mit Color/Font/Size (Size Pro).
- Weitere Oberflächen: Strukturbaum, Verlauf mit Aktionen/Revisionen, Seiteneinstellungen, Finder, Vorschau, Komponenten, Globals, Zustände (Normal/Hover), Responsive, Custom CSS, Pro-Gating.
- Der Editor ist deutsch lokalisiert. Die Übersetzung muss bei einer späteren Wiederverwendung von Tests berücksichtigt werden.

## 5. Was inhaltlich noch fehlt oder geprüft werden muss

### Design System
- Testklasse und Testvariable vollständig durchspielen: anlegen, anwenden, Priorität ändern, umbenennen, löschen, Nutzungswarnung, Speichern, Neuladen, Frontend.
- Die sechs echten Klassen inhaltlich auslesen: CSS-Regeln, Selektoren, Priorität, Verwendung auf Seiten und Templates, Vererbung, Zustände und Responsive-Anteile.
- Die drei echten Variablen: Typ, Wert, Verwendung, Beziehung zu Kit-Farben, Verhalten beim Umbenennen und Löschen.
- Klären, wo die Variablen gespeichert werden und wie sie exportiert werden können.
- Komponenten und Globals prüfen: Wie viele Komponenten gibt es, wie werden sie instanziiert, wie verhalten sie sich beim Ändern und beim Export?
- Das Verhältnis von globalen Klassen, lokalen CSS-Klassen, Kit-Globalfarben und Variablen sauber dokumentieren.

### Echte Seiten und Templates
- Startseite 824 und Leistungen 1009: Widget-Inventar, Klassen-/Variablen-Nutzung, Responsive, Zustände, Animationen, Bilder, Formulare.
- Theme Builder: Header 789, Footer 860 und die weiteren Bibliothekseinträge auf Aufbau, Bedingungen und Wiederverwendung prüfen.
- Rechtstexte, Shop-Seiten und Formulare auf Vollständigkeit und Elementor-Nutzung prüfen.
- Die Testlabs und Testprodukte als Testdaten kennzeichnen und von den echten Inhalten trennen.

### Editor-Parität zu Senify
- Die echten Design-System-Oberflächen (Klassen, Variablen, Komponenten, Globals) den Senify-Modellen für StyleRules, Theme-Tokens und Komponenten gegenüberstellen.
- Die Kit-Globalfarben/-Schriften und die Atomic-Variablen getrennt abbilden.
- Theme Builder, Popups, Dynamic Tags, Display Conditions, Loop und Formulare als eigene Paritätsfelder prüfen.
- Die Pro-Oberflächen nur als Referenz aufnehmen, solange kein offizielles Pro verfügbar ist.
- Die Daten für einen Import oder eine Migration vorbereiten: Kit, Klassen, Variablen, Templates, Seiten, Medien, Formulare, Shop-Daten.

### Qualität der echten Site
- Performance: Die Startseite hat rund 409 KB Elementor-Daten, Leistungen rund 216 KB; dazu kommen 19 Plugins, Animationen und viele Bilder. Ladezeit, CSS/JS-Gewicht und Cache prüfen.
- SEO: SEO-Plugin, Sitemap, Meta-Daten, Überschriftenstruktur und Indexierung prüfen.
- DSGVO: Schriften (Rubik/Inter), externe CDN-/Google-Fonts-Bezüge, Formulare, Cookies, Analytics und Shop-Daten prüfen.
- Barrierefreiheit: Überschriftenhierarchie, Alternativtexte, Formularlabels, Kontraste und Tastaturbedienung prüfen.
- Sicherheit: Zwei Administratoren inklusive temporärem Abnahme-Admin, Anwendungspasswörter, `elementor_unfiltered_files_upload`, Beta-Kanal, Elementor-Connect-Schlüssel und Backup-Plugin prüfen.
- Backups/Export: All-in-One WP Migration und die Elementor-Daten für eine Sicherung und einen möglichen Senify-Import nutzen.
- Wartung: Maintenance-Plugin und Elementor-Wartungsmodus, außerdem Plugin- und Versionsrisiken (Beta, Addons, Pro-Ersatz) bewerten.

## 6. Empfohlene Reihenfolge

1. **Sofort:** Testklasse und Testvariable anlegen, die Abläufe belegen, danach Testseite 1331 und Admin ID 13 entfernen. Die echten sechs Klassen und drei Variablen bleiben unverändert.
2. **Design System extrahieren:** Die sechs echten Klassen und drei Variablen samt CSS, Priorität, Verwendung und Speicherort erfassen. Das ist der wertvollste Datenbestand für die Senify-Parität.
3. **Echte Seiten und Templates auditen:** Startseite, Leistungen, Header/Footer und die Bibliothek auf Widgets, Klassen, Variablen, Responsive und Zustände untersuchen.
4. **Editor-Matrix vervollständigen:** Atomic/klassisch/Plugin-Widgets, Komponenten, Globals, Dynamic Tags, Theme Builder, Popups und Pro-Gating als Vergleichstabelle aufnehmen.
5. **Qualität prüfen:** Performance, SEO, DSGVO, Barrierefreiheit, Sicherheit und Backups der echten Site bewerten.
6. **Senify-Abbildung und Export:** Kit, Klassen, Variablen, Templates, Seiten und Medien in das Senify-Datenmodell übertragen und die Lücken dokumentieren.
7. **Aufräumen und sichern:** Testdaten entfernen, echte Inhalte unangetastet lassen, Backup erstellen und die Zugangsdaten des temporären Admins widerrufen.

## 7. Grenzen und Risiken

- Die Site ist eine echte lokale Tännig-Apotheke-Installation mit realen Inhalten, Shop- und Rechtstexten. Änderungen am Design System wirken global; die echten Klassen und Variablen dürfen nicht verändert werden.
- Der temporäre Admin und die Testseite 1331 sind noch vorhanden und müssen nach der Abnahme entfernt werden. Das Anwendungspasswort sollte danach widerrufen werden.
- `pro-elements` liefert Pro-Funktionen, ist aber kein offiziell lizenziertes Elementor Pro. Eine Pro-Paritätsaussage bleibt ausgeschlossen.
- Elementor 4.2.3 ist eine ältere Atomic-Version als die Core-Referenz 4.3.6; Oberflächen und Tabs unterscheiden sich (kein Defaults-Tab, andere Klasseneditierung).
- Die drei Variablen sind live sichtbar, ihre exakte Speicherstelle ist noch nicht abschließend bestimmt.
- Die Site enthält Testinhalte (WPAIS/WPGHR, Testprodukte, Testbestellung, Envato/Nick-FB/Novamira-Daten). Diese sind von echten Inhalten zu trennen.
- Die rechtlichen Texte, die Apotheken- und Shop-Anforderungen sowie die DSGVO-Bewertung sind keine Rechtsberatung.
- Die Performance der großen Elementor-Seiten und die 19 aktiven Plugins sind ein eigenes Risiko- und Messfeld.

## 8. Belege

- Live-Editor und Design System: `elementor-captures-2026-11-06/hcm-editor.png`, `hcm-editor-dom.png`, `hcm-classes-intro.png`, `hcm-classes.png`, `hcm-variables.png`.
- Datenbank und REST: Kit ID 6, sechs `e_global_class`-Beiträge, 17 Bibliothekseinträge, Header 789/Footer 860, Seiten 824/1009/1032/476/1195, Testseite 1331, zwei Produkte, eine Bestellung, drei MetForm-Formulare, Benutzer Adrian (1) und Abnahme-Admin (13).
- Die bisherige Core-Referenz und die übrigen Elementor-Belege: `docs/research/elementor-v4-acceptance-2026-11-06.md` und `docs/research/elementor-captures-2026-11-06/`.
- Arbeitsstand und Messwerte: `docs/current/stand.md`, `docs/current/qualitaet.md`, `docs/fahrplan.md`.

## 9. Vertiefte Live-Daten (Nachtrag 06.11.2026, DB/HTTP/HTML verifiziert)

Verifiziert über die laufende LocalWP-Instanz (`http://hcm.local`, MySQL 8.0.35 auf 127.0.0.1:10167, Site-Run `VJ8E8xMcT`). Zugriff nur lesend; keine Site-Änderungen.

### Seiteninhalte
- **home 824:** 81 Elemente, 41 Container, 40 Widgets; 18 Überschriften, 7 Text-Editor, 5 Icon-List, 4 Icon-Box, 2 Button, je 1 ElementsKit-Business-Hours, Shortcode, Qi-Bildergalerie und OriginKit-Button-Karussell; viele Tablet-/Mobile-Overrides; zwei Formularbezüge.
- **Leistungen 1009:** 96 Elemente, 49 Container, 47 Widgets; 13 Überschriften, 18 Text-Editor, 10 Icon-List, 4 Icon-Box, je 1 Animated Headline und Button; viele Tablet-/Mobile-Overrides.
- **Header 789 (Theme Builder, global):** 8 Elemente; Widgets Bild, Navigation, Button. 6 Global-Refs, 1 `css_classes`-Feld, 137 Tablet-/130 Mobile-Setting-Schlüssel. Bedingungen: `include/general`.
- **Footer 860 (Theme Builder, global):** `_elementor_data` erneut sauber exportiert und geparst (vorheriger Parsefehler war ein Exportartefakt). 32 Elemente; Widgets 5× Überschrift, 4× Icon-List, 3× MetForm, 2× Text-Editor, je 1 Animated Headline, Nested-Tabs, Bild, Social Icons. 20 Global-Refs, 1 dynamische Bindung, 2 `css_classes`-Felder, 120 Tablet-/150 Mobile-Setting-Schlüssel. Bedingungen: `include/general`. Enthält klassische `css_classes` wie `sticky-parent`/`ch-label` (keine Atomic-Global-Class-IDs).
- **WPGHR Testlab 1032:** 183 Elemente, 72 Container, 111 Widgets; pluginlastig (WPGHR/GSAP-Widgets), keine Tablet-/Mobile-Overrides.
- **WPGHR Atomic Testlab 1200:** genau ein atomares `e-heading` (311 Bytes) — einziger klar atomarer Seitentestbestand.
- Die echten produktiven Seiten verwenden **klassische Widgets und Plugin-Widgets**. In veröffentlichten `_elementor_data`-Datensätzen fanden sich keine `e-gv-`/`global-color-variable`-Referenzen; `css_classes`/Global-Class-Muster tauchen in veröffentlichten Library-/Template-Seiten auf (Header/Footer/Container-Templates, Startseite/Leistungen je nach Abfragepfad), nicht als produktive Nutzung der sechs Atomic-Global-Klassen.
- Die sechs globalen Atomic-Klassen und drei Variablen sind als Design-System-Bestand vorhanden, aber in den echten produktiven Inhalten nicht belegt genutzt; `using_documents` der Klassen ist leer. Der Bestand wirkt wie ein Atomic-/WPGHR-Testbestand, nicht wie produktiv eingesetztes Design System.
- Die Kit-Globalfarben/-typografie sind vorhanden. Der Footer nutzt Global-Refs; andere geprüfte Bereiche arbeiten stärker lokal. Kit-Globals, Atomic-Variablen und lokale Elementstile sind getrennte Schichten.

### Klassendaten
- Sechs `e_global_class`-Beiträge (306–311) mit `_elementor_global_class_data` (serialisiert): Typ `class`, Varianten für Breakpoints/Zustände (`hover`/`focus`/`active` je nach Klasse), Props (Schriftfamilie/-größe, Farbe, Margin/Padding, Border-Radius, Hintergrund/Flex), teils `custom_css`, stabile `g-...`-IDs.
- Klassen 306/307 referenzieren Atomic-Variablen `e-gv-279f32e` (`accent`, #103F92) und `e-gv-bba5997` (`ueberschrift`, #2a2a2a); `e-gv-96c9277` ist `hell` (#DEE3ED). Live-Variablen liegen im Kit 6 unter `_elementor_global_variables` (JSON mit `data`/`watermark`/`version`).
- Kit 6 enthält zusätzlich das zentrale Registry-Abbild: `_elementor_global_classes` (items/order), `_elementor_global_classes_post_ids`, `_elementor_global_classes_order`, `_elementor_global_classes_labels` und Preview-/Sync-Meta. Klassen werden also sowohl als `e_global_class`-Posts als auch im Kit gespiegelt; Senify-Import/Export muss beide Quellen konsistent behandeln.
- Keine eigene DB-Tabelle für Klassen/Variablen; Speicherung über `e_global_class`-Posttyp + Postmeta + Kit-Meta.

### Theme Builder und Woo
- Aktives Kit: 6. Theme-Builder-Bedingungen (Pro/`elementor_pro_theme_builder_conditions`): Header 789 und Footer 860 je `include/general`.
- `elementor_library`-Typen: Kit, Header, Footer, Container, Page/Section-Templates. Keine veröffentlichten Popup/Single/Archive/Loop-Item/Produkt-Archiv/404/Suchergebnis/Landing-Page-Templates gefunden.
- WooCommerce-Seiten: Shop 318, Warenkorb 319, Kasse 320, Mein Konto 321; Währung EUR, Land `DE:DE-NI`. Testdaten (2 Produkte, 1 Bestellung) bleiben von echten Inhalten zu trennen.

### Qualität, Sicherheit, DSGVO, SEO
- **Sicherheit/Risiken:** `elementor_unfiltered_files_upload=1`, `elementor_beta=yes`, Elementor-Connect-Schlüssel vorhanden, 6 Anwendungspasswörter am Admin Adrian. Nur 1 Admin-User in DB (temporärer Abnahme-Admin entfernt). `blog_public=0`, `users_can_register=0`, `default_role=subscriber`.
- **SEO:** Yoast-Optionen/Reste vorhanden (`wpseo*`), Yoast ist nicht in `active_plugins` aktiv. `blog_public=0` (Staging). Keine aktive Indexierungs-/Sitemap-Entscheidung belegt.
- **DSGVO/Inhalte:** Kit-Typografie Rubik/Inter; Schriftquellen (lokal/CDN) vor Veröffentlichung prüfen. 3 MetForm-Formulare (Footer + Startseitenbezüge) mit Einwilligungstexten — rechtlich zu prüfen, keine Rechtsberatung. Woo-Testdaten vorhanden. Plugins mit KI-/Feedback-/Tracking-Bezug (Novamira, Nick Feedback, KI-Kennzeichnung) als eigene Prüf-/Transparenzfelder behandeln.
- **Performance/Komplexität:** 19 aktive Plugins (Elementor 4.2.3, pro-elements 4.2.2, WooCommerce 11.2.1, MetForm 4.3.0, ElementsKit Lite 4.0.2, Header Footer Elementor 2.9.4, WPGHR 4.0.0, WebP Uploads 2.7.1, All-in-One WP Migration + Unlimited etc.). Große Elementor-Daten (Startseite/Leistungen) und responsive Overrides erhöhen Render-/Wartungslast.
- **Backup/Export:** All-in-One WP Migration aktiv; für weitere Eingriffe vorher Backup empfohlen.

### Konsequenzen für die weitere Arbeit
- Footer-Parse ist geklärt; offene Theme-Builder-Lücke ist nicht der Export, sondern die Senify-Abbildung von Header/Footer-Bedingungen, dynamischen Bindungen, Nested-Tabs, MetForm und klassischen `css_classes`.
- Produktiver Design-System-Einsatz ist nicht belegt. Ein stabiler UI-Test (Anlegen/Anwenden/Priorität/Umbenennen/Löschen über Atomic-Elemente, mit Neuladen und Frontend) bleibt offen und braucht einen kontrollierten Editorlauf auf einer Testseite/Sektion ohne Änderung der echten sechs Klassen/drei Variablen.
- Senify-Parität muss getrennt abbilden: Kit-Globals, Atomic-Variablen (`_elementor_global_variables`), Atomic-Klassen (`e_global_class` + Kit-Registry), lokale Elementstile, Theme-Builder-Templates/Bedingungen, Plugin-Widgets und Form-/Shop-Daten.

## 10. Klassen-/Variablen-Testlauf und Aufräumen (06.11.2026)

- Die Design-System-Oberfläche im Editor ließ sich nicht zuverlässig öffnen; die Live-Liste zeigte die sechs echten Klassen und die Klassen-Manager-Einführung. Ein eigener Anlegeknopf fehlt im Klassen-Manager.
- Eine datenmodellseitig angelegte Testklasse (`e_global_class` 1334, `senify-test-class`) erhöhte die Live-Liste nicht. Der Klassen-Manager liest offenbar einen Cache beziehungsweise den Atomic-Anlegepfad, nicht beliebige `e_global_class`-Beiträge. Die Testklasse wurde wieder entfernt.
- Das Variablen-Plus öffnet die Typauswahl **Color/Font/Size** in englischer Sprache; die drei echten Variablen sind sichtbar. Eine Testvariable wurde nicht gespeichert, weil das Design-System-Panel im Editor nicht stabil offen blieb. Die echten Variablen wurden nicht verändert.
- Aufgeräumt wurden: Testklasse 1334, Testseite 1331 und temporärer Administrator 13. Die sechs echten Klassen und drei echten Variablen sind unverändert; der echte Bestand ist wiederhergestellt.
- Konsequenz: Der Klassen-/Variablentest braucht einen stabilen Editorlauf. Der Klassen-Anlegepfad liegt in den Atomic-Elementen, nicht im Klassen-Manager. Der Test bleibt der nächste offene Punkt; die Datenmodelle und die Nutzung sind dokumentiert.

## 11. Qualität, Sicherheit, DSGVO, SEO und Backup

### Footer 860 (Theme Builder)
- 32 Elemente, 14 Container, 18 Widgets: 5 Überschriften, 3 MetForm-Formulare, 1 Nested-Tabs, 4 Icon-List, 1 Animated Headline, 2 Text-Editor, 1 Bild, 1 Social Icons.
- 20 Global-Color-Referenzen, eine dynamische Bindung, 120 Tablet- und 150 Mobile-Overrides. Keine Klassen-, Variablen- oder Custom-CSS-Referenzen.
- Der Footer ist damit der einzige geprüfte Bereich, der die Kit-Globalfarben tatsächlich nutzt. Header 789 und die Seiten 824/1009 nutzen lokale Stile.

### Sicherheit
- `elementor_unfiltered_files_upload` ist aktiviert (`1`), der Elementor-Beta-Kanal ist aktiv (`elementor_beta=yes`), ein Elementor-Connect-Schlüssel ist hinterlegt, und es existieren sechs Anwendungspasswörter am Administrator Adrian. Der temporäre Abnahme-Admin ist entfernt.
- `blog_public=0`, `users_can_register=0`, `default_role=subscriber`. Die Site ist als Staging/Local eingerichtet und nicht für Suchmaschinen freigegeben.
- Kein dediziertes Security-Plugin ist aktiv. All-in-One-WP-Migration samt Unlimited-Erweiterung ist aktiv; der Elementor-Wartungsmodus ist aus, Slim Maintenance ist vorhanden, aber nicht in der aktiven Plugin-Liste.
- Empfehlung: Unfiltered Uploads und den Beta-Kanal nach der Abnahme abschalten, Connect-Schlüssel und Anwendungspasswörter prüfen, ein Backup vor weiteren Eingriffen erstellen.

### Performance
- 19 aktive Plugins, darunter Elementor 4.2.3, `pro-elements` 4.2.2, WooCommerce 11.2.1, MetForm 4.3.0, ElementsKit Lite 4.0.2, Header Footer Elementor 2.9.4, WP GSAP Heading Reveal 4.0.0, WebP Uploads 2.7.1, All-in-One WP Migration 7.78.
- Startseite 824: rund 409 KB Elementor-Daten, 81 Elemente. Leistungen 1009: rund 216 KB, 96 Elemente. Dazu 135 Anhänge, WebP-Konvertierung, aber kein aktives Caching-Plugin in der Liste.
- Die GSAP-/WPGHR-Widgets im Testlab und die zahlreichen Responsive-Overrides sind eigene Performance- und Paritätsfelder.

### SEO
- Yoast SEO 28.3 ist im Plugin-Verzeichnis vorhanden, aber nicht in der aktiven Plugin-Liste. `wpseo`-Optionen existieren aus früheren Konfigurationen. `blog_public=0` verhindert die Indexierung; die Site ist Staging.
- Für eine spätere Veröffentlichung fehlen ein aktives SEO-Plugin, eine Sitemap-Prüfung und eine bewusste Indexierungsentscheidung.

### DSGVO und Inhalte
- Kit-Typografie Rubik/Inter; der Ursprung der Schriftdateien und mögliche Google-Fonts-/CDN-Bezüge sind vor einer Veröffentlichung zu prüfen.
- Drei MetForm-Formulare, davon drei im Footer und zwei Formularbezüge auf der Startseite. Die Formulare enthalten Einwilligungstexte („Ich stimme zu …“), die rechtlich zu prüfen sind.
- WooCommerce mit zwei Testprodukten und einer abgeschlossenen Testbestellung; Zahlungs-, Versand- und Widerrufsdaten sind zu prüfen.
- KI-Kennzeichnung, Novamira, Nick-Feedback und die KI-bezogenen Plugins sind eigene DSGVO-/Transparenzfelder. Die Rechtstexte (Impressum, Datenschutz, AGB, Widerruf) sind vorhanden, aber nicht juristisch geprüft. Keine Rechtsberatung.

### Barrierefreiheit
- Überschriftenhierarchie, Alternativtexte, Formularlabels, Kontraste und Tastaturbedienung sind noch nicht automatisiert geprüft. Die vorhandenen 135 Medien und die drei Formulare sind die wichtigsten Prüfstellen.

## 12. Senify-Abbildung und Export

| Elementor-hcm | Senify-Ziel (vorläufig) | Status | Hinweis |
|---|---|---|---|
| Kit-Systemfarben/-typografie, Breakpoints 768/1025, Radius, Seitentitel, Body-Hintergrund | Theme-Tokens / Site-Theme | teilweise belegt | Kit-Globals sind nicht Atomic-Variablen. |
| Atomic-Variablen (`_elementor_global_variables`, `e-gv-*`) | Theme-Variablen / globale Variablen | Datenmodell belegt | 3 echte Variablen; produktive Nutzung nicht belegt. |
| Atomic-Klassen (`e_global_class`, `g-*`, Kit-Registry) | StyleRules / globale Klassen | Datenmodell belegt | 6 Klassen, Zustände/Breakpoints; produktive Nutzung nicht belegt. UI-Lebenszyklus (Anlegen/Priorität/Umbenennen/Löschen über Atomic-Element) offen. |
| Lokale Elementstile, responsive Overrides | Node/Widget-Styles, Breakpoints | im Bestand dominant | Startseite/Leistungen arbeiten stark lokal. |
| Header 789 / Footer 860 (`elementor_pro_theme_builder_conditions`) | Header-/Footer-Templates + Bedingungen | strukturell belegt | Nur `include/general`; keine weiteren Template-Typen publiziert. |
| Klassische `css_classes` (`sticky-parent`, `ch-label` etc.) | freie Klassen/Selektoren | im Bestand vorhanden | Nicht mit Atomic-Global-Klassen verwechseln. |
| Dynamische Bindungen, Nested-Tabs | Dynamic Tags / verschachtelte Widgets | vorhanden | Footer enthält 1 dynamische Bindung und Nested-Tabs. |
| Plugin-Widgets (ElementsKit, Qi, OriginKit, WPGHR/GSAP, Navigation, MetForm, Social) | eigene Adapter oder Fallback-Import | offen | Größtes Paritätsrisiko der produktiven Seiten. |
| MetForm-Formulare (3) | Formular-/Integration-Mapping | offen | Footer + Startseitenbezüge; Einwilligungstexte prüfen. |
| WooCommerce (Shop/Cart/Checkout/Account, EUR, DE:DE-NI, 2 Testprodukte, 1 Testbestellung) | Shop-/Content-Mapping | offen | Testdaten trennen. |
| Medien (135 Anhänge), WebP | Asset-Import | teilweise belegbar | Pfade/IDs/Alt-Texte gesondert prüfen. |

- **Export vor Migration:** Kit, `_elementor_global_variables`, `_elementor_global_classes*`, `e_global_class`-Posts + `_elementor_global_class_data`, Template-`_elementor_data`/`_elementor_conditions`, Seiten-`_elementor_data`, Medien, Formulare und Shop-Daten konsistent sichern (All-in-One WP Migration und gezielte Exporte). Secrets/Anwendungspasswörter nicht in Exporte übernehmen.

## 13. Variablen- und Klassentest, zweiter Lauf + datenmodellbasierter Nachweis (06.11.2026)

### Variablen (UI, vorheriger Lauf)
- Mit einem frischen temporären Admin öffnete das Design-System-Panel zuverlässig. Das Plus öffnet die Typauswahl **Color/Font/Size**; **Color** legte `color-1` (`#ffffff`) an. **Speicherort bestätigt:** Kit 6, `_elementor_global_variables` (JSON `data/watermark/version`; `id`, `label`, `value`, `order`, Zeitstempel).
- Umbenennen auf `senify-test-color` griff im UI nicht. Testvariable `color-1` wurde danach gezielt aus dem Kit-JSON entfernt. Die drei echten Variablen sind unverändert: `e-gv-279f32e` accent `#103F92`, `e-gv-bba5997` ueberschrift `#2a2a2a`, `e-gv-96c9277` hell `#DEE3ED`.

### Klassen (UI + Datenmodell)
- UI: atomarer Heading hat Tabs Allgemein/Stil/Interaktionen; die Atomic-Klassenzeile war im Testlauf nicht stabil erreichbar (Editor-Timeout). Eine datenmodellseitig angelegte Testklasse erschien nicht in der Live-Liste des Klassen-Managers.
- Datenmodell (lesend verifiziert): 6 `e_global_class`-Posts (306–311) mit `_elementor_global_class_data` plus Kit-6-Registry `_elementor_global_classes*` (Items/IDs/Order/Labels/Preview/Sync/Usage-Meta). Klassen: 311 `leistungheading` `g-8601697`, 310 `leistungabsart` `g-c7b61c4`, 309 `leistung` `g-83a84b3`, 308 `absatz` `g-19b5a91`, 307 `headinghero` `g-82f3a8a`, 306 `Subheading` `g-8f65ea4`. Variable-Refs in Klassen: 306/307/309/311 referenzieren `e-gv-279f32e`/`e-gv-bba5997`/`e-gv-96c9277` je nach Klasse.
- `using_documents` der Klassen ist leer; produktive Nutzung der Atomic-Global-Klassen/Variablen in veröffentlichten Seitendaten nicht belegt.

### Offener Restpunkt (UI, kontrolliert)
- Vollständiger stabiler Lifecycle über Atomic-Element auf einer markierten Testsektion/Seite: Klasse anlegen, anwenden, Priorität prüfen/ändern, Umbenennen, Löschen, Nutzungswarnung, Speichern, Neuladen, Frontend. Erfordert interaktiven Editorzugang (Login); dabei nur Testobjekte erzeugen und vollständig entfernen, echte 6 Klassen/3 Variablen nicht ändern.

### Aufräumen
- Entfernt (vorherige Läufe): Testvariable `color-1`, Testklassen/Testseiten, temporäre Admins. Unverändert: sechs echte globale Klassen, drei echte Variablen, echte Seiten/Templates, Admin Adrian.