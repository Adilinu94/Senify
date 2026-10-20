# Framer-Import: Medien aus der Quelle, Bildgenerierung nur auf Zuruf

Status: accepted · 16.10.2026 (von Adi im Chat festgelegt: „Beim Framer Import immer die Framer Assets nehmen. Nur wenn ich dir dann schreibe ändere Bild so und so, dann natürlich ein generiertes Bild.“)
Bezug: offener Punkt „automatische Medienbeschaffung“ aus der Übergabe vom 16.10.2026, ADR-0008 (Provider-Kette für Bildgenerierung), ADR-0016 (Abrufe nur an öffentliche Adressen).

**Problem.** Offen war, ob der Framer-Import Bilder selbst beschaffen soll, zum Beispiel generieren, wo ein Framer-Bild
fehlt, blockiert ist oder schlecht passt.

**Entscheidung.**

1. Der Import nimmt immer die Medien der Framer-Quelle: Bilder und Schriften. Beim Schreiben lädt er sie herunter,
   dedupliziert sie über den Hash und legt sie in der Medien-Pipeline ab (`importAssets` in
   `packages/framer-import/src/assets.ts`, aufgerufen aus `packages/engine/src/imports.ts`, solange nicht
   `assets=skip` gilt). Ein Bildplatz wird beim Import nie automatisch durch ein generiertes Bild ersetzt, auch nicht
   bei fehlendem oder blockiertem Medium: `asset-blocked` bleibt ein Befund im Bericht.
2. Ein generiertes Bild entsteht nur, wenn der Nutzer es ausdrücklich verlangt („ändere Bild so und so“). Dafür gelten
   die vorhandenen Wege der Bildgenerierung (ADR-0008): Provider-Kette, Editor-Dialog, MCP und „Bildrezept → Asset“.
3. Es gibt keinen Schalter „bei Lücken generieren“ und keine Regel je Bildplatz.

**Folgen.**

- Für die Entscheidung ist nichts zu bauen: Der Importpfad und die Bildgenerierung bestehen schon.
- Die Anleitung `packages/docs-portal/content/docs/framer-import.md` nennt die Regel.
- Offen bleibt eine Lücke im Medienpfad, die mit dieser Entscheidung nichts zu tun hat: Ein Mirror-Import liest die
  Medien nicht aus dem Mirror-Ordner, sondern lädt sie über eine Basis-URL nach (`docs/current/stand.md`, Zeile
  „Mirror-Quelle und Medien“).
