# hcm.local Barrierefreiheits-Audit (lesend)

**Datum:** 2026-11-06  
**Methode:** Lesender Audit über LocalWP/DB und exportierte `_elementor_data`-JSONs (Home 824, Leistungen 1009, Header 789, Footer 860, MetForm 226/1043/1091). Kein Browser-/Assistive-Technology-Test, keine Live-Änderungen. Aussagen sind, wo möglich, am Datenbestand belegt; reine UI-/Screenreader-Befunde bleiben als Prüfaufgabe offen.

## Kurzfazit

Die produktiven Seiten sind nutzbar strukturierte Elementor-Seiten mit klaren Inhalten, aber nicht barrierefrei abgenommen. Hauptlücken: fehlende Bild-Alt-Texte (alle 135 Medien ohne Alt im Datenbestand), mehrere MetForm-Felder ohne sichtbares Label (Placeholder statt Label), nicht eindeutige Überschriftenhierarchie und unklarer Cookie-Consent/Einwilligungsstand für Formulare auf einer Staging-Site.

## Befunde

### 1. Bilder und Alternativtexte (hoch)

- **135 Bildmedien** in `wp_posts` (`attachment`, Bild-MIME), davon **135 ohne `_wp_attachment_image_alt`** (leer oder nicht gesetzt).
- Header 789 enthält 1 Bild-Widget ohne Alt; Footer 860 enthält 1 Bild-Widget ohne Alt. Home/Leistungen enthalten in den exportierten Widgetdaten keine `image`-Widgets, nutzen aber wahrscheinlich Medien über andere Widgets/Galerien — das ist separat zu prüfen.
- Risiko: Informationsverlust für Screenreader, insbesondere bei Logo, Social-/Verlinkungsbildern und dekorativen Bildern ohne bewusst leeres Alt.
- Nächster Schritt: Medieninventar nach Zweck klassifizieren (informativ/dekorativ/Logo), Alt-Texte fachlich ergänzen, dekorative Bilder bewusst mit leerem Alt kennzeichnen.

### 2. Überschriftenstruktur (mittel)

- **Home 824:** 18 Heading-Widgets, darunter mehrere `h1` und `p` als Tag sowie Einträge mit unbekanntem/Standard-Tag. Inhaltlich sinnvoll, aber nicht als klare Dokumenthierarchie belegt.
- **Leistungen 1009:** 13 Heading-Widgets, mehrere `h1`/`p`/unbekannt. Nummern wie `01.` bis `04.` sind visuell, aber als semantische Struktur zu prüfen.
- **Header 789:** keine Heading-Widgets (Logo + Navigation + Button).
- **Footer 860:** 5 Heading-Widgets (`p`, unbekannt, `span`) — Footer-Abschnitte wirken eher visuell als semantisch.
- Risiko: unklare Landmarken-/Überschriftennavigation für Screenreader.
- Nächster Schritt: pro Seite genau eine fachlich sinnvolle `h1` prüfen, Abschnittsüberschriften als `h2`/`h3` staffeln, Footer-Labels semantisch markieren.

### 3. Formulare und Einwilligung (hoch)

MetForm-Formulare (veröffentlicht): **226 kontakt**, **1043 termin**, **1091 rezept**. `store_entries=1` in den Settings; Form-Daten werden also gespeichert.

| Form | ID | Felder | ohne sichtbares Label | Pflichtfelder | DSGVO/Consent-Hinweis im JSON |
|---|---:|---:|---:|---:|---|
| kontakt | 226 | 6 | 2 (Textarea, Button) | 4 | Textfeld mit Datenschutz-Link und Checkbox-Hinweis im Widgettext belegt |
| termin | 1043 | 6 | 2 (Textarea, Button) | 4 | Textfeld mit Datenschutz-Link und Checkbox-Hinweis im Widgettext belegt |
| rezept | 1091 | 7 | 3 (Select, Textarea, Button) | 5 | Textfeld mit Datenschutz-Link und Checkbox-Hinweis im Widgettext belegt |

Beobachtungen:
- Mehrere Felder haben **leere Labels und nur Placeholder** (Name, E-Mail, Text, teils Select). Placeholder sind kein vollständiger Label-Ersatz.
- Die Texte enthalten Datenschutz-/Einwilligungsbezüge (`Datenschutzerklärung`, `Einwilligung in die Datenverarbeitung`). Ob die Checkbox technisch Pflicht, sauber verknüpft und tastatur-/screenreaderzugänglich ist, ist im Live-UI zu prüfen.
- Erfolgsmeldung ist englisch („Thank you! Form submitted successfully.“) — sprachlich inkonsistent und für deutschsprachige Nutzer/Assistenz ggf. unklar.
- Nächster Schritt: sichtbare Labels oder korrekt verknüpfte `aria-label`/`for`-Bezüge, Pflichtfeldkennzeichnung, Fokusreihenfolge, Fehlermeldungen, Consent-Checkbox technisch und rechtlich prüfen.

### 4. Links, Buttons und Tastatur (mittel, offen)

- Header-Button „Shop besuchen!“ verlinkt auf `https://taennig-apotheke.ptcloud.de/` (externe Cloud-Instanz) — Ziel, Linktext und Tastaturfokus im UI prüfen.
- Home/Leistungen nutzen teils Ankerlinks wie `#visit`. Zielanker und Fokusverhalten prüfen.
- Navigation (ElementsKit Nav Menu im Header) und Footer-Icon-Listen/Nested-Tabs sind ohne Live-Test nicht auf Tastatur, Fokuszustand, Escape/Expand-Verhalten und ARIA beurteilbar.

### 5. Kontrast, Fokus, Bewegung (mittel, offen)

- Kontrast ist aus exportierten JSON-Farben nicht zuverlässig als gerenderter Vorder-/Hintergrund-Kontrast bewertbar (Vererbung, Overlays, Hover, Responsive, Dark-Elemente).
- WPGHR/GSAP-Widgets und Animationen sind auf der Site vorhanden; Bewegungsreduktion (`prefers-reduced-motion`) und Fokus-Sichtbarkeit müssen im Frontend geprüft werden.
- Nächster Schritt: Lighthouse/axe/Pa11y plus manueller Tastatur- und Screenreader-Stichprobenlauf.

### 6. Technische/DSGVO-Randbefunde mit A11y-Bezug

- `blog_public=0` (Staging), `show_comments_cookies_opt_in=1`. Kein separates Cookie-Consent-Plugin (Complianz/Borlabs/Real Cookie Banner) in aktiven Plugins/Optionen gefunden; Einwilligungsbanner/-management ist damit nicht belegt.
- MetForm speichert Einträge. Datenminimierung, Löschkonzept, Auftragsverarbeitung und Datenschutzhinweise sind fachlich/rechtlich zu prüfen.
- Webfonts (Rubik/Inter) und Dritt-Links (Shop auf `ptcloud.de`) vor Veröffentlichung auf datenschutzkonforme Einbindung prüfen.

## Priorisierte To-dos

1. Medien-Alt-Texte für alle 135 Bilder klassifizieren und pflegen (Logo/Header/Footer zuerst).
2. MetForm-Felder mit echten Labels/ARIA verknüpfen; Datenschutz-Checkbox technisch absichern; Erfolgsmeldung auf Deutsch.
3. Überschriftenhierarchie pro Seite bereinigen (eine `h1`, sinnvolle `h2`/`h3`, Footer-Semantik).
4. Frontend-Test mit Tastatur, Fokus, Screenreader-Stichprobe, Kontrast und `prefers-reduced-motion`.
5. Consent-/Datenschutzfluss für Formulare und Dritt-Links vor Produktivbetrieb dokumentieren.