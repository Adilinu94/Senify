# Senify

Senify ist eine agent-native Website-Plattform: Agenten und Menschen bearbeiten dieselben strukturierten Baupläne (NodeTrees), die zu modernen Websites gerendert werden.

## Language

### Kern

**Site**: Ein Kunden-Website-Projekt in Senify; oberster Container für Pages, Theme und Assets.
_Avoid_: Projekt, Workspace, Instanz

**Page**: Eine adressierbare Seite einer Site; besitzt einen NodeTree.
_Avoid_: Dokument, Route, Seite (als Codeterm)

**Node**: Eine konkrete Instanz einer Section im Page-Baum.
_Avoid_: Element, Block, Widget

**Section**: Ein registrierter Bautyp (z. B. `hero`, `pricing`) im Katalog.
_Avoid_: Block, Baustein, Komponente, Modul

**Registry**: Der Katalog aller Sections einer Senify-Instanz.
_Avoid_: Bibliothek, Katalog

**Variant**: Ein kuratiertes Preset einer Section (vorbelegte Props).
_Avoid_: Stil, Style, Design

**Asset**: Eine hochgeladene Mediendatei mit Metadaten.
_Avoid_: Datei, Media, Upload

### Architektur

**Renderer**: Die Komponente, die aus NodeTree + Theme die statische Site-Ausgabe erzeugt (Astro, Sektionen als React-Komponenten).
_Avoid_: Engine, Build-Tool, Generator

**Section-SDK**: Das framework-agnostische Paket aus Registry, Prop-Schemas und Motion-Presets, das Editor und Renderer gemeinsam nutzen.
_Avoid_: Component-Library, UI-Kit, Kit

**Page-Controller**: Das zentrale vanilla Script-Tier einer Seite, das Scroll (Lenis), Motion (GSAP) und geteilten Zustand orchestriert und den Shared Store für Islands versorgt.
_Avoid_: Page-Script-Layer, Motion-Layer, Controller

**Island-Payload**: Ein versioniertes Fremd-Code-Paket einer Site (importiert oder hochgeladen), das **neben** dem NodeTree liegt und nur in Preview und Release als Island geladen wird — mit Herkunft, Lizenz, Integritätsnachweis und sichtbarem Rückfall. Transport und Bake-Regeln stehen in `docs/adr/0010-island-payload-fuer-importierten-fremd-code.md`; aktuelle Budgets stehen in `packages/engine/src/guardrails.ts`. Der Editor-Canvas lädt nie Fremd-Code, sondern Poster oder Platte.
_Avoid_: Custom-Code, Snippet, Fremd-Skript

### Design

**Token**: Eine benannte Design-Entscheidung (Farbe, Typografie, Abstand, Radius …) innerhalb eines Themes.
_Avoid_: Variable, CSS-Variable, Wert

**Theme**: Die Menge aller Tokens einer Site; gebunden über `themeId`.
_Avoid_: TokenSet, Farbschema, Stylesheet

**Motion Preset**: Eine kurierte Motion-Rezeptur, angewendet über `node.motion`.
_Avoid_: Animation, Effekt, Übergang

**Motion-Spec**: Die typisierte Gesamt-Konfiguration auf einem Node (Preset + Intensity-Dial + Tokens + Trigger), die der Renderer deterministisch in GSAP-/CSS-/Motion-Code übersetzt.
_Avoid_: Animations-Config, Keyframes

**Breakpoint-Override**: Eine responsive Anpassung eines Nodes für Tablet oder Mobile.
_Avoid_: Responsive-Variante, Media-Query

**Breakpoints (Site)**: Das Paar aus Tablet- und Mobile-Schwelle in Pixeln, ab dem ein Breakpoint-Override greift. Gilt für die ganze Site; ohne eigenen Eintrag der Standard 1024/640 (ADR-0020).
_Avoid_: Umbruchpunkt, Media-Query-Breite

**Style-Prop**: Ein Stil-Regler einer Section (z. B. Hintergrund, Abstand, Radius), dessen Wert eine Token-Referenz oder ein freier Wert ist.
_Avoid_: Stilfeld, CSS-Property, Style-Attribut

**Innenteil (Part)**: Ein benannter Bereich innerhalb einer Section (z. B. Karte, Button, Überschrift), dessen Style-Props einheitlich für alle Vorkommen gelten.
_Avoid_: Sub-Element, Kindknoten, Slot

**Token-Referenz**: Der Verweis auf einen Token in einem Prop-Wert (`{ "$token": "accent" }`), den der Renderer zur CSS-Variable auflöst.
_Avoid_: Variablenname, Alias, Platzhalter

### Lifecycle & Schreiben

**Draft**: Der lebende, editierbare Baum einer Page.
_Avoid_: Working Copy, Entwurf (als Codeterm)

**Revision**: Ein unveränderlicher Snapshot einer Page, entstanden beim Publish.
_Avoid_: Version, Snapshot, Kopie

**Release**: Ein Bündel veröffentlichter Revisionen einer Site.
_Avoid_: Version, Bundle, Deployment

**Mutation**: Eine benannte, typisierte Schreiboperation; die einzige öffentliche Schreib-API für Editor, MCP und Agenten.
_Avoid_: Patch, Edit, Änderung

### Referenzen

**Referenz**: Ein Vorbild in der Bibliothek, aus dem ein Projekt Stil-Skalen ableitet (analysiert per URL oder als Import abgelegt).
_Avoid_: Inspirationsquelle, Vorlage, Template

**Referenz-Dokumente (`documents`)**: Die Originaltexte einer importierten Referenz (`design`, `guidelines`, `components`), wie sie im Referenzen-Tab stehen und der Agent liest.
_Avoid_: Anhang, Datei, Doku

**Referenz-Profil**: Die aus Laufzeit oder Dokumenten gelesenen Messwerte einer Referenz (Tokens mit Belegstellen, Typo-Skala, Regeln); Grundlage jeder Theme-Ableitung.
_Avoid_: Analyse, Auswertung, Style-Guide

**Redesign-Paket**: Der Lesevorgang `plan_redesign`, der Seiteninhalt, Theme-Patch je Referenz, Dokumente und Regeln für einen Umbau bündelt.
_Avoid_: Umbau-Plan, Briefing, Konzept

**Direction Card**: Eine konkret angebotene Redesign-Richtung aus einer Referenz (Bild, Theme-Specimen, Begründung, Regeln), abgeleitet aus Quellseite, Theme und Referenzprofil.
_Avoid_: Vorschau, Vorschlag, Option, Entwurf, Template

**Redesign Proposal**: Die reloadfeste Sammlung von ein bis drei Direction Cards für eine Quellseite, zusammen mit ihrer Planbasis, der Direction Decision und dem Apply-Ergebnis.
_Avoid_: Plan, Redesign-Paket, Session, Job

**Direction Decision**: Die irreversible menschliche Wahl genau einer Direction Card innerhalb eines Redesign Proposals.
_Avoid_: Auswahl, Freigabe, Entscheid, Bestätigung (als persistierter Zustand)

**Sektions-Plan**: Die immutable Zuordnung der Sections einer Quellseite zu registrierten Zieltypen und Varianten, mit erhaltenen Inhalten, vollständiger Slot-Struktur und Medienbedarf; Teil der Direction Card.
_Avoid_: Umbau-Plan, Blueprint, Layout-Plan, Soll-Liste

**Medienbedarf**: Eine im Sektions-Plan ausgewiesene Medienrolle mit Herkunft und Behandlung (wiederverwenden, auswählen, hochladen, erzeugen, vermeiden, manuell entscheiden); nie ein übernommenes Referenz-Asset.
_Avoid_: Bildkopie, Asset-Import, Platzhalterbild

**Asset-Kopie**: Das Übernehmen der von den Seiten genutzten Medien einer Site in eine andere Site mit neuen Kennungen, neu gebildeten Speicherpfaden und umgeschriebenen Draft-Verweisen; beide Sites bleiben danach unabhängig.
_Avoid_: Asset-Referenz, Verweis, Freigabe

**Apply-Plan**: Die vollständig vorbereitete Schreibfolge eines Redesign-Applies mit vorab vergebenen Kennungen, erwarteten Versionen und Audit-Einträgen; reine Datenstruktur ohne Nebenwirkung.
_Avoid_: Entwurf, Skript, Auftragsliste
