# Datenmodell & Schema-System

Type: grilling
Status: resolved

Input: research/20-referenzprojekte.md

## Question

Welche Kern-Entitäten und Beziehungen hat Senify v1 — Site, Page, Section-Instanz, Registry-Eintrag (Baustein-Typ), Asset, Token-Set/Theme, Revision, Nutzer? Wie sind Identität, Referenzen, Validierung und Erweiterbarkeit geregelt?

Definiere das Schema-System: Wie wird ein Baustein-Typ (Props, Slots, erlaubte Kinder, Varianten, Motion-Optionen) deklariert, versioniert und von Agenten gelesen? Ergebnis: kanonisches Datenmodell (Entitäten + JSON-Formen), auf dem Lifecycle, Registry, MCP-Tools und Editor aufsetzen.

## Answer

Kanonisches Datenmodell entschieden (2 Wizard-Runden, 13/13 nach Empfehlung). Vollständiges Artefakt: [artifacts/01-datenmodell.md](../artifacts/01-datenmodell.md).

- **Baum:** flacher `NodeTree { rootNodeId, nodes }`; `Node = { id, type, variant?, props, children?, slots?, overrides?, motion?, locked?, hidden? }`; Verschachtelung/Slots registry-reguliert.
- **Responsive:** Breakpoint-Overrides pro Node; **Tokens first** (`{ "$token": … }` in Props).
- **Entitäten:** Site, Page, Node, SectionDefinition, Asset, Theme, Revision, Release — kein universelles Content-Modell.
- **Schema:** TypeBox (= JSON Schema → MCP-Verträge); `schemaVersion` pro Section, additive-first + Deprecation-Muster.
- **Schreiben:** nur kanonische Mutationen (insert/delete/updateProps/move/duplicate/wrap/Breakpoint/Motion/PageMeta); interne Migrationen ausgenommen.
- **Lifecycle-Träger:** lebender Draft + immutable Revisionen; Site-Publish bündelt als Release (Policy → Ticket 05).
- **Persistenz:** Postgres + JSONB; nanoid-IDs; Author-Attribution (human/agent).
- **Prop-Typen:** text, richtext (Inline-Runs), number, boolean, enum, color, assetRef, link, list, slot.
- **Collections:** v1 nicht enthalten → Out of scope (v2).

## Comments

- **14.09.2026 — Scope-Update:** Nutzer-Anforderung „komplettes CMS" + Instatic-Deep-Dive (`research/23`). Collections/Entries sind jetzt **v1-Scope** → Ticket 22 (Content-Kern) erweitert das Datenmodell additiv; Artefakt 01 bleibt für Pages/Assets/Releases gültig.
