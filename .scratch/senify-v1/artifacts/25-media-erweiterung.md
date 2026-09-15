# Artefakt 25: Media-Erweiterung — Instatic-Delta (Senify v1)

> Entschieden am 15.09.2026 in Ticket „Media-Erweiterung (Instatic-Delta)".
> Grundlagen: `artifacts/15` (Media-Basis-Pipeline), `09`/`24` (Editor + Medien-Fenster), `13` (Alt-Hard-Check), `22` (Trash-Muster), `research/23` §2 (Instatic-Media), `research/25` (Emdash Signed-Upload/Transforms).

## Entscheidungen (Wizard, 8/8)

1. **Organisation:** **Ordner-Baum** (anlegen, per Drag&Drop verschieben) **+ Tags** zum Filtern.
2. **Smart-Listen:** vier feste, selbstfüllende Listen — **Ohne Alt-Text · Ohne Tags · Große Dateien · Zuletzt ersetzt**.
3. **Replace File:** Neue Datei ersetzt die alte unter **gleicher ID/URL** — alle Verwendungen bleiben gültig.
4. **Papierkorb:** Soft-Delete (wiederherstellbar) + endgültiges Löschen nur explizit.
5. **Varianten:** feine Staffel **+ automatische Größenwahl** (`sizes`-Resolver aus der Layout-Mathematik).
6. **Mehrfach-Bearbeitung:** mehrere Dateien gemeinsam bearbeiten (Alt-Texte, Tags, Ordner, Trash/Purge).
7. **Alles öffentlich:** kein geschützter Datei-Abruf in v1 (normale Website-Auslieferung über CDN).
8. **Agenten:** volle Medien-Rechte (upload/update/replace/delete/restore) mit `write`-Scope — Schutz durch Trash, Replace-Historie und Audit.

## 1. Library & Organisation

```
Medien-Bibliothek
├─ Ordner        Baum, anlegen/umbenennen/verschieben (DnD); Asset in max. 1 Ordner
├─ Tags          frei vergebbar; Filtern + Bulk-Vergabe
├─ Smart-Listen  Ohne Alt-Text · Ohne Tags · Große Dateien · Zuletzt ersetzt
└─ Trash         Wiederherstellen / endgültig löschen (Purge, mit Bestätigung)
```

- Ansichten: Raster/Liste; Suche (Name/Alt-Text); Filter (Typ/Ordner/Tags/Zeit); Sortierung.
- **Ordner löschen** verschiebt Inhalte nach „Ohne Ordner" (nichts wird mitgelöscht).
- Smart-Listen sind **Arbeitsflächen**: „Ohne Alt-Text" speist direkt den Hard-Check aus Artefakt 13.

## 2. Replace File (Entscheidung 3)

- Neue Binärdatei ersetzt die alte unter derselben Asset-ID/-URL (Instatic-Muster) — Einsatzstellen bleiben unverändert gültig.
- **Replace-Historie:** vorherige Datei-Versionen bleiben erhalten (Restore möglich); Limit konfigurierbar; Audit-Event.
- Metadaten (Alt, Tags, Ordner, Focal Point) bleiben erhalten; Maße/Hash/Derivate werden neu erzeugt; CDN-Cache wird invalidiert (atomarer Wechsel).

## 3. Varianten-Ladder & `sizes`-Resolver (Entscheidung 5)

- **Ladder:** `64 · 320 · 640 · 1024 · 1600 · 2048 · Intrinsic` (Originalgröße als oberste Rung; **kein Upscaling** — Rungen nur bis zur Originalgröße), je in **AVIF + WebP** + Original-Fallback (Formate aus Artefakt 15).
- **`srcset` nur aus Varianten** (keine Ad-hoc-Größen); Blurhash/Aspect-Ratio-Reservierung wie 15.
- **`sizes`-Resolver:** leitet aus der Sektion ab, wie breit ein Bild je Breakpoint tatsächlich dargestellt wird (Container, Spalten, Grids) — der Browser lädt die passende Variante; Fallback: Standard-`sizes`.
- Bestehende `assetRef`-Zuordnungen und Focal-Point-Crops bleiben unverändert.

## 4. Bulk & Editor-Anbindung (Entscheidung 6)

- **Bulk:** Auswahl → Alt-Texte setzen, Tags vergeben, in Ordner verschieben, Trash/Purge; Ergebnisbericht mit Fehler-IDs (Emdash-Muster).
- **Medien-Fenster im Editor (24):** eingebettete Library (Ordner/Tags/Smart-Listen), **Signed-Upload** (Client lädt direkt zum EU-Storage, Engine bestätigt — Emdash-Muster), „Als dekorativ markieren" (Alt-Ausnahme, 15).

## 5. Betrieb, Scopes & Sicherheit

- **Alles öffentlich:** Auslieferung über CDN; Signed-URLs nur für **Uploads** (Client → Storage) und interne Vorgänge — kein Private-Delivery in v1.
- **Agenten-Rechte (Entscheidung 8):** upload/update/replace/delete/restore laufen mit `write`; Schutzmechanik statt Scope-Hürde — Trash (reversibel), Replace-Historie (reversibel), volles Audit (04), Programm-Badge „zuletzt von Agent geändert". Der Alt-Pflicht-Hard-Check (13) bleibt unberührt.
- Gelöschte Assets markieren referenzierende `assetRef`s als „broken" (Artefakt-15-Regel: markieren, nie automatisch entfernen).

## 6. Anschlüsse

| Bereich | Ticket |
|---|---|
| Basis-Pipeline (Speicherung, Formate, Alt-Pflicht, Video ohne Transcoding) | 15 (unverändert) |
| Medien-Fenster-UI im Editor | 24 |
| Alt-Hard-Check + Smart-Liste als Arbeitsfläche | 13 |
| Media-Tools (`upload_asset`, `update_asset`, `list_assets` + neu: `replace_asset`, `delete_asset`, `restore_asset`) | 10 (Nachtrag) |
| Skill-Referenz „Media" für Agenten (Ordner/Tags/Replace/Trash) | 11 |
| CDN/Storage: Upload-Signierung, Cache-Invalidierung | 14 |
