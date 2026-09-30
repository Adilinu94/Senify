# Der Schlüssel für gespeicherte Zugangsdaten liegt außerhalb der Datenbank und des Backups

Status: vorgeschlagen · 29.09.2026
Bezug: T12 (Secrets at rest), Review-Befund „Backup ist faktisch Klartext".

**Problem.** SMTP-Passwort und Deploy-Token stehen AES-256-GCM-verschlüsselt in der Datenbank. Der Schlüssel
stand in der Tabelle `engine_secrets` derselben Datenbank. `createBackup` exportiert alle Tabellen als JSON
und kopiert außerdem den ganzen Datenordner nach `files/`. Damit enthielt jedes Backup Chiffrat und Schlüssel
nebeneinander, dazu `program-token.json` (Operator-Token: alle Scopes, kein Ablauf). Ein Backup ist dafür
gemacht zu reisen (externes Laufwerk, synchronisierter Ordner).

**Entscheidung.**

1. Der Schlüssel liegt in `<Datenordner>/engine-secret.key` (32 Zufallsbytes, base64url, Modus `0600`). Der
   Store liest ihn dort, einmal je Store und Prozess. Die Datei entsteht atomar und exklusiv (temporäre Datei,
   dann `link`), zwei gleichzeitige Prozesse behalten denselben Schlüssel.
2. Ein bestehender Schlüssel in `engine_secrets` wird unverändert in die Datei übernommen (das Chiffrat bleibt
   lesbar). Die Zeile wird erst gelöscht, nachdem die Datei gelesen wurde und denselben Wert trägt. Eine
   abweichende Zeile (altes Backup von einem anderen Rechner) bleibt liegen.
3. Eine vorhandene, aber beschädigte Datei ist ein Fehler. Ein stilles Neu-Erzeugen würde alle gespeicherten
   Passwörter unlesbar machen.
4. Das Backup lässt die Tabelle `engine_secrets`, `engine-secret.key` und `program-token.json` (Wurzel des
   Datenordners) aus.

**Folgen.**

- Ein Restore auf einem anderen Rechner beginnt mit einem neuen Schlüssel. Gespeicherte Passwörter (SMTP,
  Deploy-Token) sind dort nicht lesbar und müssen neu gesetzt werden; die vorhandene Meldung sagt das.
  Wer sie mitnehmen will, kopiert `engine-secret.key` bewusst und getrennt vom Backup.
- Das Formular-Secret (`form_settings`) bleibt im Backup: ohne es wären die in veröffentlichte Seiten
  gestempelten Formular-Tokens nach einem Restore ungültig.
- Unter Windows wirkt `0600` nicht; es gilt die ACL des Datenordners. Der Standardordner `~/.senify` liegt im
  Benutzerprofil.

**Verworfen.** Windows-DPAPI (sauber, aber ein nativer Aufruf oder `powershell` in jedem Start, und ein
Schlüssel, der nur auf diesem Benutzerkonto lesbar ist, macht den Umzug auf einen neuen Rechner schwerer);
Passphrase (jeder Start braucht eine Eingabe). Die Schlüsseldatei ist der einfachste Schritt, der das Backup
entschärft; DPAPI bleibt als spätere Härtung offen.

**Offen.** `program-token.json` selbst wird unter Windows nicht auf den Benutzer beschränkt.
