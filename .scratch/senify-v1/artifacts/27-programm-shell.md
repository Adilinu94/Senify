# Artefakt 27: Programm-Shell & Projektverwaltung (Senify v1)

> Entschieden am 15.09.2026 in Ticket „Programm-Shell & Projektverwaltung".
> Grundlagen: `artifacts/01` (Entitäten), `04` (MCP/Tokens/Audit), `06` (Review), `09`/`24` (Editor), `22` (Content-Workspace), `23` (Vorlagen), `26` (SMTP), `research/24` §6 (Payload-Admin-UX), `research/26` (Instatic-Shell-Muster).

## Entscheidungen (Wizard, 7/7)

1. **Start:** Ein-Klick-Verknüpfung — startet die lokale Engine und öffnet das Programm automatisch im Browser.
2. **Projekt öffnen → direkt in den Editor**, mit schmaler **Kopf-Leiste**: Seiten · Artikel · Vorlagen · Prüfen · Aktivität · Einstellungen.
3. **Projekt anlegen:** **nur Name** — Stil-Referenz und Niveau (clean/standard/showcase) sind danach jederzeit einstellbar.
4. **Projekt löschen:** **Papierkorb** (wiederherstellbar; endgültig nur mit Bestätigung).
5. **Einstellungen:** komplettes Set — Agenten-Zugänge · E-Mail · Speicher & Sicherung · Standardwerte.
6. **Duplizieren:** ganzes Projekt kopierbar („Kunde B wie Kunde A").
7. **Aktivitätsliste pro Projekt:** was zuletzt passierte (wer/was/wann — Agent oder Mensch).

## 1. Start & Betrieb

- **`senify start`** (Windows-Verknüpfung/Desktop-Icon): startet die lokale Engine (Server, Postgres, Worker) und öffnet den Standardbrowser auf dem Dashboard.
- Terminal-Fenster zeigt Startstatus (Port, Bereitschaft, Fehler); sauberes Beenden.
- **Health-Check** beim Laden: Engine nicht erreichbar ⇒ klares Fehlerbild + „Engine starten"-Hinweis (kein weißer Bildschirm).
- **Autostart** optional in den Einstellungen (nicht Default). Desktop-Verpackung/Remote-Betrieb bleibt Fog (lokal/Browser zuerst).

## 2. Globale Tabs

```
Senify
├─ Projekte      Karten-Grid (Name · Vorschaubild · Status) · Suche · Neu · Duplizieren · Papierkorb
├─ Referenzen    Design-Referenzen (Ticket 28)
└─ Einstellungen Agenten-Zugänge · E-Mail · Speicher & Sicherung · Standardwerte
```

**Hinweis zur Tab-Struktur:** Ursprünglich als vier Tabs gedacht (Referenzen · Projekte · Editor · Einstellungen) — der **Editor wird als Projekt-Arbeitsbereich** umgesetzt (Klick aufs Projekt), **kein globaler Tab**: ohne Projekt fehlt ihm der Kontext (welche Site/welche Seite).

## 3. Projekte-Tab

- **Karten-Grid:** Vorschaubild (letzter Screenshot der Startseite; Fallback Platzhalter), Name, Statuspunkt (Entwurf / in Prüfung / Live), letzte Änderung.
- **Aktionen:** Neu (nur Name) · Öffnen (→ Editor) · Duplizieren · Umbenennen · Löschen (Trash). Suche + Sortierung (zuletzt geändert/Name). **Papierkorb-Ansicht** (Wiederherstellen / endgültig löschen).
- **Duplizieren-Dialog:** „Mit Inhalten" oder „Nur Struktur & Design" (Seiten, Layouts/Templates, Theme, Sammlungen — Medien referenziert, nicht kopiert).
- **Stil & Niveau** (Referenz, Profil) sind Felder am Projekt — änderbar durch dich oder Agenten (Mutationen; Profil-Validierung aus 21 greift).

## 4. Projekt-Arbeitsbereich (Kopf-Leiste)

- **Öffnen ⇒ Editor** (Puck, Artefakt 24) der Startseite; Kopf-Leiste zum Wechseln:
  - **Seiten** — Editor + Seiten-Explorer (inkl. Vorlagen-Abschnitt),
  - **Artikel** — Content-Workspace (22): Liste + Entry-Editor,
  - **Vorlagen** — Layouts & Entry-Templates (23) verwalten,
  - **Prüfen** — Review-Ansicht des Projekts (06): Screenshot-Diff + Struktur-Diff, Approve / Request changes / Discard,
  - **Aktivität** — Liste: Änderung/Review/Publish mit Zeit + Quelle (Agent/Mensch, Token-Name),
  - **Einstellungen (Projekt)** — Name, Stil-Referenz, Niveau, Domain/Deploy-Status, Gefahrenzone (Duplizieren/Löschen).
- **Zurück zu Projekte** über Breadcrumb/Logo; **Cmd+K** global (Projekte, Seiten, Aktionen — Payload-/Instatic-Muster).

## 5. Einstellungen (global)

| Bereich | Inhalt |
|---|---|
| **Agenten-Zugänge** | MCP-Clients verbinden (Claude Code / Cursor / opencode; `senify mcp configure`), Tokens erstellen/widerrufen, letzte Nutzung (04) |
| **E-Mail** | SMTP-Postfach für Formular-Benachrichtigungen + Bestätigungsmails (26); „Test-Mail senden" |
| **Speicher & Sicherung** | Storage-Pfad/-Backend, Backup-Status, manuelles Backup, Restore-Anleitung (14, lokal betrieben) |
| **Standardwerte** | Standard-Niveau (Profil) für neue Projekte, Standard-Layout, Autostart |

## 6. Übernahme-Muster (Quellen)

- **Payload** (§6): Nav-Gruppen, **Preferences pro Nutzer** (Spalten/Layouts), Command-Palette, Soft-Delete/Trash, Toasts, Stale-Data-Hinweise.
- **Instatic**: `PanelRail`/Spotlight, URL-Deep-Links, direkte Sprungpunkte („Open editor").
- **Eigene Artefakte:** Plattform-UI nutzt das **Token-System (07)**; die **Aktivität** speist sich aus dem Audit-Log (04).

## 7. Anschlüsse

| Bereich | Ticket |
|---|---|
| Referenzen-Tab (eigener globaler Tab) | 28 |
| Editor als Arbeitsbereich (Frame-Manager etc.) | 24 |
| Artikel-Workspace, Vorlagen-Verwaltung, Review | 22 / 23 / 06 |
| MCP-Clients/Tokens + Audit (Aktivität) | 04 |
| SMTP (Formulare/Newsletter) | 26 |
| Domain/Deploy-Status im Projekt | 14 |
| Spec: Shell-Paket inkl. Start-Mechanik (`senify start`) schneiden | `/to-spec` |
