# hcm.local → Senify Export-Mapping (konkret)

**Datum:** 2026-11-06  
**Quelle:** LocalWP `hcm.local` (DB `local`, MySQL 8.0.35, 127.0.0.1:10167, Site-Run `VJ8E8xMcT`, Kit 6, Site `https://hcm.local`, Front Page 824). Rein lesend; keine Live-Änderungen. **Keine Secrets exportieren** (App-Passwörter, `elementor_connect_site_key`, Connect/Token-Optionen, Login-Cookies).

## 1. Export-Pakete

| Paket | Quelle (DB/Dateien) | Enthält | Senify-Ziel | Notizen |
|---|---|---|---|---|
| Site-Basis | `wp_options`: `siteurl`,`home`,`blogname`,`admin_email`,`WPLANG`,`timezone_string`,`permalink_structure`,`show_on_front`,`page_on_front`,`wp_page_for_privacy_policy`,`blog_public` | Basis-Config | Site-/Projekt-Metadaten | `blog_public=0`, Datenschutzseite = 3, Startseite = 824. |
| Kit/Theme-Tokens | Kit 6 (`wp_posts` ID 6), `_elementor_page_settings` (serialisiert), `_elementor_data` falls relevant | System-/Custom-Farben, System-/Custom-Typografie, Body/Links, Breakpoints 768/1025, Bildradius 25px, Seitentitel-Selektor `h1.entry-title`, Body-BG `#FBFDFF`, WPGHR-Kit-Easing/Dauer/Reduced-Motion | Theme-Tokens, globale Styles, Breakpoints | Kit-Globals ≠ Atomic-Variablen. `_elementor_page_settings` ist PHP-serialisiert. |
| Atomic-Variablen | Kit 6 `_elementor_global_variables` (JSON `data/watermark/version`) | 3 Variablen: `e-gv-279f32e` accent `#103F92`, `e-gv-bba5997` ueberschrift `#2a2a2a`, `e-gv-96c9277` hell `#DEE3ED` (order 0/1/2) | Globale Design-Variablen | Produktive Nutzung in veröffentlichten Daten nicht belegt. UI-Lebenszyklus nur teilweise stabil getestet. |
| Atomic-Klassen | `e_global_class` Posts 306–311 + `_elementor_global_class_data` (PHP-serialisiert) **und** Kit 6 Registry `_elementor_global_classes`, `_elementor_global_classes_post_ids`, `_elementor_global_classes_order`, `_elementor_global_classes_labels` (+ Preview/Sync/Usage-Meta) | 6 Klassen: 311 `leistungheading` `g-8601697` (font Rubik 700, refs `e-gv-279f32e`/`e-gv-bba5997`), 310 `leistungabsart` `g-c7b61c4`, 309 `leistung` `g-83a84b3`, 308 `absatz` `g-19b5a91`, 307 `headinghero` `g-82f3a8a` (ref `e-gv-bba5997`), 306 `Subheading` `g-8f65ea4` (ref `e-gv-279f32e`); Varianten/Breakpoints/Zustände/Props/teils Custom-CSS im Payload | Globale StyleRules/Klassen | Post + Kit-Registry konsistent exportieren/importieren. `using_documents` leer; produktive Nutzung nicht belegt. |
| Theme-Builder | `elementor_library` Header 789, Footer 860 + `_elementor_data`, `_elementor_conditions`/Pro-Bedingungen, `_elementor_template_type`; `wp_options.elementor_pro_theme_builder_conditions` | Header/Footer global `include/general` | Header/Footer-Templates + Display-Conditions | Footer enthält dynamische Bindung, Nested-Tabs, MetForm, klassische `css_classes`; Header Navigation/Button/Bild. Keine weiteren publizierten Template-Typen. |
| Seiten/Templates | `wp_posts`/`wp_postmeta` `_elementor_data`, `_elementor_edit_mode`, `_elementor_template_type`, Seiteneinstellungen; veröffentlichte Seiten 476/824/1009/1032/1195/1200 plus relevante Library-Container | Seiteninhalt, responsive Overrides, klassische Widgets, Plugin-Widgets | Seiten-/Block-Import | Produktive Seiten 824/1009 stark lokal/pluginlastig; 1200 atomarer Minimaltest. |
| Medien | `wp_posts` `attachment` + `_wp_attached_file`, `_wp_attachment_metadata`, `_wp_attachment_image_alt`, WebP-Meta; Uploads-Verzeichnis | 135 Anhänge/Bilder | Asset-Import + Alt-Text-Mapping | **Alle 135 Bildanhänge ohne Alt-Text im DB-Bestand** — fachlich ergänzen oder bewusst dekorativ markieren. |
| Formulare | MetForm-Posts 226 kontakt, 1043 termin, 1091 rezept; `_elementor_data`; `metform_form__form_setting` | Formularfelder, Settings, Einwilligungstexte/Hinweise im Inhalt | Formular-/Consent-Mapping | `store_entries=1`. Placeholder statt vollständiger Labels in Teilen; Erfolgsmeldungen englisch; Einwilligung technisch/rechtlich prüfen (keine Rechtsberatung). |
| Navigation | `nav_menu`, `nav_menu_item` (203 Home, 206 Aktionen, 204 Leistungen, 205 Team, 267 Kontakt) + Menüzuweisungen | Menüstruktur | Navigation-Mapping | Header nutzt Navigation-Widget; konkrete Menü-ID/Widget-Zuordnung bei Bedarf aus Header-`_elementor_data` lesen. |
| Shop/Testdaten | Woo-Seiten 318/319/320/321; Woo-Optionen (Währung EUR, Land `DE:DE-NI`); Produkte 323/324; Bestellungen/Platzhalter | Shop-Grundkonfiguration | optionaler Shop-Mapping-Test | **Testdaten getrennt behandeln**; nicht als produktive Inhalte migrieren. |
| Plugins/Integrationen | aktive Plugins, plugin-spezifische Optionen/Shortcodes/Widgetdaten | Abhängigkeiten | Adapterliste | Kritisch: ElementsKit, Qi, OriginKit, WPGHR/GSAP, MetForm, HFE/pro-elements, WooCommerce, WebP Uploads, All-in-One WP Migration. |
| Rechtstexte | Seiten Impressum/Datenschutz/AGB/Widerruf (IDs im Seitenbestand), Privacy-Policy-Option 3 | Rechtstexte | Content-Mapping | Inhaltlich/juristisch nicht geprüft. |

## 2. Konkrete Export-Reihenfolge

1. **Sicherung zuerst:** AIO WP Migration/Vollbackup oder DB+Uploads-Snapshot. Vor jedem UI-Eingriff Backup.
2. **Basis/Kit:** `wp_options`-Subset (ohne Secrets) + Kit 6 Postmeta (`_elementor_page_settings`, `_elementor_global_variables`, `_elementor_global_classes*`, kit `_elementor_data` falls genutzt).
3. **Klassen:** alle `e_global_class`-Posts + `_elementor_global_class_data`; gegen Kit-Registry prüfen (IDs/Order/Labels konsistent).
4. **Templates:** Header 789, Footer 860, weitere `elementor_library`-Einträge mit Typ/Conditions/Data.
5. **Seiten:** veröffentlichte Seiten, inkl. Home/Leistungen/Shop-Seiten/Testlabs; `_elementor_data` als JSON-Artefakt ablegen.
6. **Formulare/Menüs:** MetForm-Posts+Settings+Data, Menüs/Menüitems.
7. **Medien:** Attachment-Meta + Dateien; Alt-Text-Liste (`fehlend` für alle 135) als Nacharbeit.
8. **Shop:** nur Konfiguration referenzieren; Testprodukte/-bestellungen markieren oder ausschließen.
9. **Validierung:** JSON/Serialisierung parsebar, IDs/Refs (`e-gv-*`, `g-*`, Attachment-IDs, Formular-IDs, Menu-IDs) inventarisieren, Secrets-Scan über Export.

## 3. Referenzinventar (wichtig für Import)

| Referenztyp | Beispiel | Fundort | Import-Regel |
|---|---|---|---|
| Kit-Farben/Typo | `globals/colors?id=primary`, System/Custom IDs | `_elementor_data`, Kit Settings | Auf Senify-Theme-Tokens mappen; lokale Hex-Werte nicht verlieren. |
| Atomic-Variablen | `e-gv-279f32e`, `e-gv-bba5997`, `e-gv-96c9277` | Klassen-Props, potenziell Atomic-Widget-Styles | Variable-ID + Label + Wert erhalten; `using_documents` nach Import neu berechnen. |
| Atomic-Klassen | `g-8601697`, `g-c7b61c4`, ... Post-IDs 306–311 | Atomic-Widget-`classes`/Registry | Postdaten und Kit-Registry gemeinsam mappen; Klassen-Reihenfolge/Priorität beachten. |
| Klassische CSS-Klassen | `sticky-parent`, `ch-label` | Widget-Settings `css_classes`/ähnlich | Als freie Klassen/CSS behandeln, nicht als Atomic-Global-Klassen. |
| Template-Bedingungen | Header/Footer `include/general` | Pro-Conditions + `_elementor_conditions` | Senify-Display-Conditions äquivalent modellieren. |
| Dynamische Bindungen | Footer: 1 dynamische Bindung | `_elementor_data` | Quelltyp (Post/Site/User/ACF etc.) einzeln prüfen. |
| Formular-IDs | MetForm 226/1043/1091 | Footer/Home/Leistungen + MetForm-Posts | Formularobjekte und Einbettungen gemeinsam migrieren. |
| Menü-/Seiten-/Medien-IDs | nav 203–267, pages, attachments 135 | WordPress Posts/Terms | IDs remappen; URL/Slug/Attachment-Bezüge nachziehen. |

## 4. Risiken und offene Punkte

- **Nicht belegt produktiv genutzt:** Atomic-Variablen/Klassen existieren, aber `using_documents` leer und keine `e-gv`-Treffer in geprüften veröffentlichten Daten. Migration darf keinen Scheinbestand als produktiv markieren.
- **Atomic-UI-Lebenszyklus offen:** Anlegen/Anwenden/Priorität/Umbenennen/Löschen über Atomic-Element, Neuladen, Frontend. Braucht stabilen Editorzugang (Login) und markierte Testobjekte mit vollständigem Aufräumen. Reine DB-Anlage war früher nicht im Klassen-Manager sichtbar.
- **Plugin-Parität:** WPGHR/GSAP, ElementsKit, Qi, OriginKit, MetForm, HFE/pro-elements bestimmen große Teile des Renderings; ohne Adapter/Fallback bleibt Darstellung unvollständig.
- **DSGVO/Sicherheit:** `elementor_unfiltered_files_upload=1`, `elementor_beta=yes`, Connect-Key vorhanden, 6 App-Passwörter; Rubik/Inter und Drittlinks (`ptcloud.de`) prüfen; kein aktives Consent-Plugin gefunden; Formulare speichern Einträge. Keine Rechtsberatung.
- **A11y:** 135 Medien ohne Alt, Heading-Hierarchie, MetForm-Labels/Consent technisch, Kontrast/Fokus/Tastatur/Screenreader im Frontend prüfen. Siehe [`elementor-hcm-a11y-audit-2026-11-06.md`](elementor-hcm-a11y-audit-2026-11-06.md).
- **Nicht berühren:** Uncommittete Editor-History-Dateien im Senify-Repo (parallele Session) und echte hcm-Klassen/Variablen/Seiten.