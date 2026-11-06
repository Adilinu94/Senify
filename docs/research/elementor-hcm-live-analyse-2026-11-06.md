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