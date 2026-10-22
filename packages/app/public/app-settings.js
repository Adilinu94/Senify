// Die Einstellungen eines Projekts (P3-2, Schritt 43): Profil, Modus,
// Engine, Bilder, Referenzen, Formulare und der Papierkorb der Backups.
// `app-projects.js` importiert die View.
//
// Die View hat keine Modulvariable der Datei gebraucht - nur `backupRow`, das
// mitgewandert ist. Deshalb liess sie sich als Ganzes schneiden, obwohl sie die
// groesste einzelne Funktion der Oberflaeche war.

import {
  IMAGE_PROVIDER_LABELS,
  PROFILE_LABELS,
  api,
  askConfirm,
  el,
  failed,
  formatBytes,
  formatDate,
  friendlyError,
  render,
  routeScope,
  settingField,
  toast,
} from "./app-core.js";
import { refsSettingsSection } from "./app-refs-settings.js";
import { renderRoute } from "./app.js";

export function backupRow(backup) {
  const cancel = el("button", { class: "ghost", text: "Abbrechen", hidden: true });
  const button = el("button", { class: "ghost", text: "Wiederherstellen" });
  cancel.addEventListener("click", () => {
    button.dataset.stage = "";
    button.textContent = "Wiederherstellen";
    button.disabled = false;
    cancel.hidden = true;
  });
  button.addEventListener("click", async () => {
    if (button.dataset.stage !== "confirm") {
      button.dataset.stage = "confirm";
      button.textContent = "Wirklich wiederherstellen?";
      cancel.hidden = false;
      return;
    }
    button.disabled = true;
    button.textContent = "Stelle wieder her …";
    try {
      const result = await api(`/api/backups/${encodeURIComponent(backup.id)}/restore`, {
        method: "POST",
        body: { confirm: true },
      });
      toast(`Wiederhergestellt — Schutznetz: ${result.safetyBackup}`);
      await renderRoute();
    } catch (error) {
      failed(error);
      button.disabled = false;
      button.textContent = "Wiederherstellen";
      button.dataset.stage = "";
      cancel.hidden = true;
    }
  });
  return el(
    "tr",
    {},
    el("td", { text: formatDate(backup.createdAt) }),
    el("td", { text: formatBytes(backup.bytes) }),
    el("td", {
      text: `${backup.fileCount} Dateien · ${Object.keys(backup.tables).length} Tabellen`,
    }),
    el("td", {}, el("span", { class: "inline" }, button, cancel)),
  );
}

export async function settingsView() {
  const current = routeScope();
  const { tokens } = await api("/api/tokens");
  const settings = await api("/api/settings");
  const backups = await api("/api/backups");
  const rows = tokens.map((token) =>
    el(
      "tr",
      {},
      el("td", { text: token.name }),
      el("td", { text: token.scopes.join(", ") }),
      el("td", {}, el("code", { text: token.prefix })),
      el("td", { text: token.lastUsedAt ? formatDate(token.lastUsedAt) : "nie" }),
      el("td", {}, token.revokedAt ? el("span", { class: "tag", text: "widerrufen" }) : el("span", { class: "muted", text: "aktiv" })),
      el(
        "td",
        {},
        el(
          "div",
          { class: "row-actions" },
          token.revokedAt
            ? undefined
            : el("button", {
                class: "danger",
                text: "Widerrufen",                 onclick: async () => {
                  const sure = await askConfirm({
                    title: "Token widerrufen?",
                    message: `Token „${token.name}“ wirklich widerrufen? Danach kann der Client nicht mehr zugreifen.`,
                    confirmLabel: "Widerrufen",
                    danger: true,
                  });
                  if (!sure) return;
                   try {
                     await api(`/api/tokens/${token.id}`, { method: "DELETE" });
                    toast("Token widerrufen");
                    await renderRoute();
                  } catch (error) {
                    failed(error);
                  }
                },
              }),
        ),
      ),
    ),
  );
  render([
    el("h1", { text: "Einstellungen" }),
    el(
      "section",
      { class: "panel" },
      el("h2", { text: "Agenten-Zugänge" }),
      el("p", {
        class: "muted",
        text: "Zugangsschlüssel (Tokens) für KI-Werkzeuge wie Claude Code, Cursor oder opencode, die deine Projekte bearbeiten dürfen. Jeder Schlüssel hat nur die Rechte, die du ihm gibst. Ein Werkzeug verbindest du im Terminal mit `senify mcp configure`.",
      }),
      tokens.length === 0
        ? el("p", { class: "muted", text: "Noch keine Zugangsschlüssel." })
        : el(
            "table",
            {},
            el(
              "thead",
              {},
              el(
                "tr",
                {},
                el("th", { text: "Name" }),
                el("th", { text: "Rechte" }),
                el("th", { text: "Kennung" }),
                el("th", { text: "Letzte Nutzung" }),
                el("th", { text: "Status" }),
                el("th", {}),
              ),
            ),
            el("tbody", {}, rows),
          ),
      el(
        "div",
        { class: "settings-grid settings-grid--two", style: "margin-top: 0.9rem" },
        settingField(
          "Name",
          el("input", { id: "token-name", type: "text", placeholder: "z. B. Claude Code" }),
          "Woran du das Werkzeug erkennst, zum Beispiel sein Name.",
        ),
        settingField(
          "Berechtigungen",
          el("input", { id: "token-scopes", type: "text", value: "read,write" }),
          "read = ansehen, write = ändern, publish = veröffentlichen. Mehrere mit Komma trennen.",
        ),
        el(
          "div",
          { class: "settings-actions" },
          el("button", {
            class: "primary",
            text: "Zugangsschlüssel anlegen",
            onclick: async () => {
              const name = document.getElementById("token-name").value.trim();
              const scopes = document
                .getElementById("token-scopes")
                .value.split(",")
                .map((entry) => entry.trim())
                .filter(Boolean);
              if (!name) {
                toast("Bitte einen Namen angeben.", "error");
                document.getElementById("token-name").focus();
                return;
              }
              try {
                const created = await api("/api/tokens", { method: "POST", body: { name, scopes } });
                toast(`Zugangsschlüssel angelegt — Geheimnis (wird nur jetzt angezeigt): ${created.secret}`);
                await renderRoute();
              } catch (error) {
                failed(error);
              }
            },
          }),
        ),
      ),
    ),
    el(
      "section",
      { class: "panel" },
      el("h2", { text: "E-Mail" }),
      el("p", {
        class: "muted",
        text: "Das Postfach, über das Senify Mails verschickt: Benachrichtigungen zu Formularen und Newsletter. Die Zugangsdaten bekommst du von deinem Mail-Anbieter (SMTP). Das Passwort wird verschlüsselt gespeichert und nie angezeigt.",
      }),
      el(
        "div",
        { class: "settings-grid" },
        settingField("Server", el("input", { id: "smtp-host", type: "text", placeholder: "smtp.example.com", value: settings.email.host }), "Der Postausgangsserver deines Mail-Anbieters."),
        settingField("Port", el("input", { id: "smtp-port", type: "number", placeholder: "587", value: String(settings.email.port) })),
        settingField(
          "Verschlüsselung",
          el(
            "select",
            { id: "smtp-tls" },
            ...["starttls", "tls", "none"].map((mode) =>
              el("option", {
                value: mode,
                text:
                  mode === "starttls"
                    ? "Verschlüsselt, meist Port 587 (STARTTLS)"
                    : mode === "tls"
                      ? "Verschlüsselt, meist Port 465 (TLS)"
                      : "Unverschlüsselt (nur im eigenen Netz)",
                selected: mode === settings.email.tls ? "" : undefined,
              }),
            ),
          ),
          "Im Zweifel die erste Auswahl; der Mail-Anbieter nennt den passenden Port.",
        ),
      ),
      el(
        "div",
        { class: "settings-grid", style: "margin-top: 0.75rem" },
        settingField("Benutzer", el("input", { id: "smtp-user", type: "text", placeholder: "meist die E-Mail-Adresse", value: settings.email.user })),
        settingField(
          "Passwort",
          el("input", {
            id: "smtp-password",
            type: "password",
            placeholder: settings.email.hasPassword
              ? "gespeichert — leer lassen zum Beibehalten"
              : "noch nicht gespeichert",
          }),
        ),
        settingField("Absender", el("input", { id: "smtp-from", type: "text", placeholder: "z. B. formular@kunde.de", value: settings.email.from }), "Diese Adresse sehen die Empfänger als Absender."),
      ),
      el(
        "div",
        { class: "settings-actions", style: "margin-top: 0.9rem" },
        el("button", {
          class: "primary",
          text: "E-Mail-Einstellungen speichern",
          onclick: async () => {
            const value = (id) => document.getElementById(id).value;
            const password = value("smtp-password");
            try {
              await api("/api/settings", {
                method: "PUT",
                body: {
                  email: {
                    host: value("smtp-host"),
                    port: Number(value("smtp-port")) || 587,
                    tls: value("smtp-tls"),
                    user: value("smtp-user"),
                    from: value("smtp-from"),
                    ...(password ? { password } : {}),
                  },
                },
              });
              toast("E-Mail-Einstellungen gespeichert");
              await renderRoute();
            } catch (error) {
              failed(error);
            }
          },
        }),
        settingField(
          "Testempfänger",
          el("input", { id: "smtp-test-to", type: "text", placeholder: "name@example.de" }),
        ),
        el("button", {
          class: "ghost",
          text: "Testmail senden",
          onclick: async () => {
            const to = document.getElementById("smtp-test-to").value.trim();
            const result = document.getElementById("smtp-test-result");
            if (!to) {
              toast("Bitte eine Empfängeradresse angeben.", "error");
              return;
            }
            result.textContent = "Sende …";
            try {
              const response = await api("/api/settings/email/test", { method: "POST", body: { to } });
              result.textContent = response.ok
                ? `Gesendet an ${response.to}.`
                : `Fehler (${response.reason}): ${response.message}`;
              result.dataset.tone = response.ok ? "success" : "error";
              if (!response.ok) toast(response.message, "error");
            } catch (error) {
              result.textContent = friendlyError(error);
              result.dataset.tone = "error";
              failed(error);
            }
          },
        }),
        el("span", { id: "smtp-test-result", class: "settings-message", role: "status" }),
      ),
    ),
    el(
      "section",
      { class: "panel" },
      el("h2", { text: "Bildgenerierung" }),
      el("p", {
        class: "muted",
        text: "Woher Senify Bilder bekommt, wenn ein KI-Werkzeug oder du ein Bild erzeugen lässt. Zuerst fragt Senify den ersten Dienst; fällt er aus, übernimmt der zweite, zuletzt immer ComfyUI auf diesem Rechner. Der Schlüssel für einen eigenen Dienst wird verschlüsselt gespeichert und nie angezeigt.",
      }),
      el(
        "div",
        { class: "settings-grid" },
        settingField(
          "Erster Dienst",
          el(
            "select",
            { id: "image-provider" },
            ...["image-use", "comfyui", "custom", "off"].map((provider) =>
              el("option", {
                value: provider,
                text: IMAGE_PROVIDER_LABELS[provider] ?? provider,
                selected: provider === settings.image.provider ? "" : undefined,
              }),
            ),
          ),
        ),
        settingField(
          "Zweiter Dienst (wenn der erste ausfällt)",
          el(
            "select",
            { id: "image-fallback" },
            ...["comfyui", "image-use", "custom", "none"].map((provider) =>
              el("option", {
                value: provider,
                text: provider === "none" ? "Keiner" : (IMAGE_PROVIDER_LABELS[provider] ?? provider),
                selected: provider === settings.image.fallbackProvider ? "" : undefined,
              }),
            ),
          ),
        ),
      ),
      el("h3", { text: "Eigener Dienst (eigene Schnittstelle)" }),
      el(
        "div",
        { class: "settings-grid" },
        settingField(
          "Format",
          el(
            "select",
            { id: "image-custom-format" },
            ...["minimax", "openai"].map((format) =>
              el("option", {
                value: format,
                text: format === "minimax" ? "MiniMax" : "OpenAI-kompatibel",
                selected: format === settings.image.customFormat ? "" : undefined,
              }),
            ),
          ),
        ),
        settingField(
          "Basis-URL",
          el("input", {
            id: "image-custom-url",
            type: "text",
            placeholder: "https://api.minimax.io/v1",
            value: settings.image.customBaseUrl,
          }),
        ),
        settingField(
          "Modell",
          el("input", {
            id: "image-custom-model",
            type: "text",
            placeholder: "image-01",
            value: settings.image.customModel,
          }),
        ),
      ),
      el(
        "div",
        { class: "settings-actions", style: "margin-top: 0.9rem" },
        settingField(
          "API-Key",
          el("input", {
            id: "image-custom-key",
            type: "password",
            placeholder: settings.image.hasCustomApiKey
              ? "gespeichert — leer lassen zum Beibehalten"
              : "noch nicht gespeichert",
          }),
        ),
        el("button", {
          class: "primary",
          text: "Bild-Einstellungen speichern",
          onclick: async () => {
            const value = (id) => document.getElementById(id).value;
            const key = value("image-custom-key");
            try {
              await api("/api/settings", {
                method: "PUT",
                body: {
                  image: {
                    provider: value("image-provider"),
                    fallbackProvider: value("image-fallback"),
                    customFormat: value("image-custom-format"),
                    customBaseUrl: value("image-custom-url"),
                    customModel: value("image-custom-model"),
                    ...(key ? { customApiKey: key } : {}),
                  },
                },
              });
              toast("Bildgenerierung gespeichert");
              await renderRoute();
            } catch (error) {
              failed(error);
            }
          },
        }),
        el("button", {
          class: "ghost",
          text: "Status prüfen",
          onclick: async () => {
            const out = document.getElementById("image-health");
            out.textContent = "prüfe …";
            try {
              const health = await api("/api/images/health");
              const custom = health.providers?.custom;
              out.textContent = `Custom: ${custom?.ok ? "bereit" : "nicht bereit"} – ${custom?.detail ?? "keine Antwort"}`;
              out.dataset.tone = custom?.ok ? "success" : "error";
            } catch (error) {
              out.textContent = friendlyError(error);
              out.dataset.tone = "error";
            }
          },
        }),
        el("span", { id: "image-health", class: "settings-message", role: "status" }),
      ),
      el("p", {
        class: "muted",
        text: "Das Format ist die Sprache, die dein Dienst spricht: MiniMax oder OpenAI-kompatibel. Welche zutrifft, steht in der Beschreibung des Dienstes.",
      }),
    ),
    el(
      "section",
      { class: "panel" },
      el("h2", { text: "Speicher & Sicherung" }),
      el("p", {
        class: "muted",
        text: backups.status.lastBackup
          ? `Letzte Sicherung: ${formatDate(backups.status.lastBackup.createdAt)}, ${formatBytes(backups.status.lastBackup.bytes)}, ${backups.status.lastBackup.fileCount} Dateien`
          : "Noch keine Sicherung erstellt.",
      }),
      el("p", {
        class: "muted",
        text: `${backups.status.count} Sicherung(en), Zielordner: ${backups.status.targetDir}`,
      }),
      el(
        "div",
        { class: "settings-actions" },
        settingField(
          "Zielordner",
          el("input", { id: "backup-dir", type: "text", placeholder: "Standard verwenden", value: settings.backup.targetDir }),
          "Leer lassen, um den Standardpfad zu verwenden.",
        ),
        el("button", {
          class: "ghost",
          text: "Zielordner speichern",
          onclick: async () => {
            try {
              await api("/api/settings", {
                method: "PUT",
                body: { backup: { targetDir: document.getElementById("backup-dir").value.trim() || null } },
              });
              toast("Zielordner gespeichert");
              await renderRoute();
            } catch (error) {
              failed(error);
            }
          },
        }),
        el("button", {
          class: "primary",
          text: "Sicherung jetzt erstellen",
          onclick: async () => {
            try {
              const created = await api("/api/backups", { method: "POST" });
              toast(`Sicherung erstellt: ${created.backup.id}`);
              await renderRoute();
            } catch (error) {
              failed(error);
            }
          },
        }),
      ),
      el(
        "div",
        { class: "backup-list" },
        (backups.backups ?? []).length === 0
          ? el("p", {
              class: "muted",
              text: "Noch keine Sicherung vorhanden — oben eine erstellen.",
            })
          : el(
              "table",
              {},
              el(
                "thead",
                {},
                el(
                  "tr",
                  {},
                  el("th", { text: "Zeitpunkt" }),
                  el("th", { text: "Größe" }),
                  el("th", { text: "Inhalt" }),
                  el("th", {}),
                ),
              ),
              el("tbody", {}, ...(backups.backups ?? []).map((backup) => backupRow(backup))),
            ),
      ),
      el("p", {
        class: "muted",
        text: "Die Wiederherstellung ersetzt Tabellen und Dateien durch die Sicherung; der bisherige Stand wird vorher automatisch als Schutznetz gesichert. Währenddessen nicht im Programm arbeiten.",
      }),
      el(
        "details",
        {},
        el("summary", { text: "Manuelle Wiederherstellung (ohne laufende Engine)" }),
        el(
          "ol",
          {},
          el("li", { text: "Engine beenden (`senify start` mit Strg+C)." }),
          el("li", { text: "Zielordner öffnen, den gewünschten Zeitstempel-Ordner wählen und das Manifest prüfen." }),
          el("li", { text: "Tabellen aus `tables/*.json` in die Zieldatenbank einspielen (psql, z. B. TRUNCATE dann COPY)." }),
          el("li", { text: "Dateien aus `files/` über das Datenverzeichnis kopieren (SENIFY_DATA_DIR, Standard ~/.senify)." }),
          el("li", { text: "Engine starten und Projektliste sowie Health-Check prüfen." }),
        ),
      ),
    ),
    refsSettingsSection(settings),
    el(
      "section",
      { class: "panel" },
      el("h2", { text: "Standardwerte" }),
      el("p", {
        class: "muted",
        text: "Gelten für neue Projekte und für den Programmstart. Was „Niveau“ bedeutet: wie viel Bewegung und Effekte eine Seite haben darf.",
      }),
      el(
        "div",
        { class: "inline" },
        el("label", { class: "muted", for: "defaults-profile" }, "Niveau für neue Projekte"),
        el(
          "select",
          { id: "defaults-profile" },
          ...["clean", "standard", "showcase"].map((profile) =>
            el("option", {
              value: profile,
              text: PROFILE_LABELS[profile] ?? profile,
              selected: profile === settings.defaults.defaultProfile ? "" : undefined,
            }),
          ),
        ),
        el("label", { class: "muted", for: "defaults-layout" }, "Layout für neue Seiten"),
        el("input", { id: "defaults-layout", type: "text", value: settings.defaults.defaultLayout }),
      ),
      el(
        "label",
        { class: "muted", for: "defaults-autostart" },
        el("input", {
          id: "defaults-autostart",
          type: "checkbox",
          checked: settings.defaults.autostart ? "" : undefined,
        }),
        " Beim Start von Senify (`senify start`) den Browser automatisch öffnen",
      ),
      el("button", {
        class: "primary",
        text: "Standard-Einstellungen speichern",
        onclick: async () => {
          try {
            await api("/api/settings", {
              method: "PUT",
              body: {
                defaults: {
                  defaultProfile: document.getElementById("defaults-profile").value,
                  defaultLayout: document.getElementById("defaults-layout").value.trim(),
                  autostart: document.getElementById("defaults-autostart").checked,
                },
              },
            });
            toast("Standardwerte gespeichert");
            await renderRoute();
          } catch (error) {
            failed(error);
          }
        },
      }),
    ),
  ], current);
}
