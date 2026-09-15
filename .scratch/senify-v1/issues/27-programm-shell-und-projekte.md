# Programm-Shell & Projektverwaltung

Type: grilling
Status: resolved

Input: research/24-payload-learnings.md
Input: research/26-instatic-delta.md

## Question

Wie sieht das Programm aus — lokale Web-App im Browser mit Tabs **Referenzen · Projekte · Editor · Einstellungen**?

- **Shell:** Start-Mechanik (`senify start`? lokaler Server + Browser-Öffnen), Routing/Tabs, Plattform-Tokens als UI-Basis, Command-Palette (Instatic-/Payload-Muster), Preferences pro Nutzer.
- **Projekte-Tab:** Grid mit Name + Thumbnail (Quelle: erster Render/Screenshot?), Anlegen/Öffnen/Löschen (Soft-Delete/Trash?), Suche/Sortierung, Duplizieren?, Status-Badge (draft/published).
- **Editor-Einstieg:** Von Projekten in den Editor (Puck) — Zurück-Navigation, Publish-Status; **Review-Bereich als Teil des Projekts** (Screenshot-Diff + Struktur-Diff + Approve/Request changes/Discard; Artefakt 06).
- **Einstellungen:** Theme/Tokens, Fonts, MCP-Clients & Tokens, Storage/Backups, Site-Profile — was gehört zu v1, was später?
- **Übernahme:** Payload Admin-UX (Nav-Gruppen, Listen, Prefs, Command-Palette), Instatic (PanelRail, Spotlight, URL-Deep-Links `?page=`).
- Abgrenzung zu Artefakt 09 (Editor) und 12 (Portal): Shell ist neu — Delta festhalten.

Ergebnis: Shell-/IA-Konzept (Delta zu 09/12) inkl. Projektverwaltung + Settings-Scope.

## Answer

**Entschieden am 15.09.2026 (Wizard, 7/7) — Artefakt: [artifacts/27-programm-shell.md](../artifacts/27-programm-shell.md)**

- **Start:** Ein-Klick-Verknüpfung startet die lokale Engine und öffnet das Programm automatisch im Browser (`senify start`); Health-Check mit klarem Fehlerbild; Autostart optional.
- **Tabs:** Projekte · Referenzen · Einstellungen — **der Editor ist Projekt-Arbeitsbereich** (Klick aufs Projekt), kein globaler Tab (Kontext fehlt sonst). Kopf-Leiste im Projekt: **Seiten · Artikel · Vorlagen · Prüfen · Aktivität · Einstellungen**.
- **Projekte-Tab:** Karten-Grid (Name, Vorschaubild = letzter Startseiten-Screenshot, Statuspunkt Entwurf/Prüfung/Live); Neu (nur Name — Stil & Niveau später setzbar), Öffnen, Duplizieren („mit Inhalten"/„nur Struktur & Design"), Umbenennen, Papierkorb.
- **Aktivität:** Liste pro Projekt (Änderung/Review/Publish, wer/was/wann — Agent/Mensch) aus dem Audit-Log (04).
- **Einstellungen (global):** Agenten-Zugänge (MCP-Clients/Tokens), E-Mail (SMTP für Formulare/Newsletter), Speicher & Sicherung, Standardwerte; Projekt-Einstellungen separat (Name, Referenz, Niveau, Domain, Gefahrenzone).
- **Übernahmen:** Payload (Nav-Gruppen, Preferences, Command-Palette, Trash, Toasts), Instatic (PanelRail, Spotlight, Deep-Links); Plattform-UI auf Token-System (07).
