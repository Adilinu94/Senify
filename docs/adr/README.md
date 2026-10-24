# Architecture Decision Records

## Index

| ADR | Thema | Status |
|---|---|---|
| [ADR-0001](0001-json-first-bau-modell.md) | JSON-first Bau-Modell und Registry | angenommen |
| [ADR-0002](0002-astro-als-site-renderer.md) | Astro als Site-Renderer | angenommen |
| [ADR-0003](0003-gsap-als-choreografie-kern.md) | GSAP und ScrollTrigger als Motion-Kern | angenommen |
| [ADR-0004](0004-postgres-only-bis-phase-5.md) | PostgreSQL-only bis mindestens Phase 5 | angenommen |
| [ADR-0005](0005-offenes-css-statt-whitelist.md) | offener CSS-Property-Raum mit Wert-Grammatik | angenommen |
| [ADR-0006](0006-motion-authoring.md) | Motion-Spec und Preset-Registry | angenommen |
| [ADR-0007](0007-puck-abschied.md) | Puck-Abschied | angenommen |
| [ADR-0008](0008-lokale-bildgenerierung.md) | Provider-Kette für Bildgenerierung | angenommen |
| [ADR-0009](0009-kein-mcp-sampling.md) | kein MCP-Sampling | angenommen |
| [ADR-0010](0010-island-payload-fuer-importierten-fremd-code.md) | Island-Payload für importierten Fremdcode | angenommen |
| [ADR-0012](0012-persistente-redesign-proposals.md) | Persistente Redesign Proposals mit menschlicher Direction Decision | angenommen |
| [ADR-0013](0013-direction-card-sektionsplan-als-handoff.md) | Direction Card mit Sektions-Plan und Medienbedarf als Handoff | angenommen |
| [ADR-0014](0014-atomarer-redesign-apply.md) | Atomarer Redesign-Apply ohne Zwischenzustand | angenommen |
| [ADR-0015](0015-site-inhalte-auf-eigener-origin.md) | Site-Inhalte auf der Engine-Origin, nie unter der Dashboard-Origin | angenommen |
| [ADR-0016](0016-abrufe-fremder-urls-nur-oeffentlich.md) | Abrufe fremder URLs gehen nur an öffentliche Adressen | angenommen |
| [ADR-0017](0017-schluessel-ausserhalb-der-datenbank.md) | Der Schlüssel für gespeicherte Zugangsdaten liegt außerhalb der Datenbank und des Backups | angenommen |
| [ADR-0018](0018-oeffentliche-adresse-je-projekt.md) | Jedes Projekt trägt seine öffentliche Adresse | angenommen |
| [ADR-0019](0019-store-als-fassade-ueber-fach-module.md) | Der Store wird Fassade über Fach-Module | angenommen |
| [ADR-0020](0020-breakpoints-je-site.md) | Breakpoints je Site einstellbar | angenommen |
| [ADR-0021](0021-framer-import-medien-aus-der-quelle.md) | Framer-Import: Medien aus der Quelle, Bildgenerierung nur auf Zuruf | angenommen |
| [ADR-0022](0022-der-browser-holt-nur-oeffentliche-adressen.md) | Der Browser holt nur öffentliche Adressen | angenommen |
| [ADR-0023](0023-seitenuebergaenge-bleiben-draussen.md) | Seitenübergänge bleiben draußen: sie sind im SSR nicht vorhanden | angenommen |

## Nächste Nummer

Die nächste freie Nummer ist `ADR-0024`. `ADR-0011` ist für die Entscheidung reserviert, ob und wann `EditorDocument` das interne kanonische Modell wird.

## Regeln

- Eine angenommene ADR-Nummer wird nie für ein anderes Thema wiederverwendet.
- Historische Plantexte ohne angenommene ADR führen keine reservierte Nummer.
- Statusänderungen und Supersession werden in der jeweiligen ADR dokumentiert.
