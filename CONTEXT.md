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
