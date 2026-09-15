# 12: Programm-Shell & Projektverwaltung

**What to build:** Das lokale Programm: `senify start` startet Engine + öffnet den Browser (Health-Check mit klarem Fehlerbild). Globale Tabs **Projekte · Referenzen · Einstellungen**; Projekt-Arbeitsbereich mit Kopf-Leiste **Seiten · Artikel · Vorlagen · Prüfen · Aktivität · Projekt-Einstellungen**. Projekte-Tab: Karten-Grid (Thumbnail, Statuspunkt, letzte Änderung), Neu (nur Name), Öffnen → Editor, Duplizieren (mit Inhalten / nur Struktur & Design), Umbenennen, Papierkorb (wiederherstellen/endgültig). Review-Ansicht im Projekt (aus 07: Screenshot-Slider, Struktur-Diff, Aktionen). Aktivitätsliste pro Projekt (Audit: wer/was/wann, Agent/Mensch + Token). Globale Einstellungen: Agenten-Zugänge (Tokens/MCP-Clients), E-Mail (SMTP + Testmail), Speicher & Sicherung (Backup-Status, Restore-Anleitung), Standardwerte (Profil, Layout, Autostart). Cmd+K global.

**Blocked by:** 02 (Site & Pages + Mutations), 06 (MCP-Kern & Agent-Setup), 07 (Lifecycle, Review & Checks).

**Status:** ready-for-agent

- [ ] `senify start` startet Engine und öffnet das Dashboard; bei nicht erreichbarer Engine erscheint ein Hinweis mit „Engine starten"-Aktion
- [ ] Projekt anlegen (nur Name) → Karte erscheint; Öffnen landet im Editor der Startseite; Duplizieren (mit/ohne Inhalte) erzeugt vollständiges Projekt (Medien referenziert)
- [ ] Papierkorb: löschen → wiederherstellen → endgültig löschen (nur mit Bestätigung)
- [ ] Kopf-Leiste navigiert zu Seiten/Artikel/Vorlagen/Prüfen/Aktivität/Einstellungen; Aktivität listet Audit-Ereignisse mit Quelle (Agent/Mensch, Token-Name)
- [ ] Review-Ansicht: Screenshot-Slider + Struktur-Diff sichtbar; Approve/Request changes/Discard aus der UI ausführbar
- [ ] Einstellungen wirken: Token anlegen/widerrufen (letzte Nutzung), SMTP-Testmail, Backup-Status, Standard-Niveau für neue Projekte
- [ ] Cmd+K findet Projekte/Seiten/Aktionen; Plattform-UI nutzt das Theme-System

Quellen: `artifacts/27`, `artifacts/06` (Review-Ansicht), `artifacts/04` (Audit), Spec „Shell, Start & Betrieb".