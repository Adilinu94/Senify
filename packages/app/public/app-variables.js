// Variablen-Oberfläche der App: Liste, Anlegen, Speichern, Umbenennen,
// Löschen/Wiederherstellen und die gemeinsame Server-History.
//
// Der Block stammt aus dem Editor-Zweig (C) und wird hier als eigenes Modul
// geführt, damit die modulare G-Oberfläche ihn an ihre Seitenspalte hängen
// kann, ohne den Monolithen zurückzuholen.

import { el } from "./app-core.js";
import { createVariableHistory } from "./variable-history.js";

export function createVariablesPanel(ctx) {
  const variablesHost = el("div", { class: "canvas-view__variables" });
  let siteTheme = ctx.getTheme();
  let siteThemeVersion = ctx.getThemeVersion();
  const applyTheme = (latest) => {
    siteTheme = latest.theme;
    siteThemeVersion = latest.version;
    ctx.session.acceptThemeVersion(latest.version);
    ctx.setTheme(latest.theme, latest.version, latest.css);
  };
  const variableDrafts = new Map();
  const variableCreateDrafts = { color: { name: "", value: "" }, spacing: { name: "", value: "" } };
  let variableQuery = "";
  let variableSaving = false;
  let lastVariableDeletion = null;
  const variableHistoryKey = `senify:variable-history:${ctx.siteId}:${ctx.pageId}`;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(variableHistoryKey) ?? "null");
    if (saved && ["color", "spacing"].includes(saved.group) && typeof saved.receiptId === "string") {
      if (saved.kind === "delete" && typeof saved.name === "string" && typeof saved.restored === "boolean") {
        lastVariableDeletion = { group: saved.group, name: saved.name, receiptId: saved.receiptId, restored: saved.restored };
      }
    }
  } catch { /* Storage can be unavailable or contain invalid data. */ }
  const rememberVariableHistory = () => {
    try {
      if (lastVariableDeletion) window.sessionStorage.setItem(variableHistoryKey, JSON.stringify({ kind: "delete", ...lastVariableDeletion }));
      else window.sessionStorage.removeItem(variableHistoryKey);
    } catch { /* The action remains available for the current editor session. */ }
  };
  const pendingVariableKey = `senify:pending-variable:${ctx.siteId}:${ctx.pageId}`;
  let pendingVariableOperation = null;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(pendingVariableKey) ?? "null");
    if (saved && saved.format !== 2 && saved.action === "rename" && ["color", "spacing"].includes(saved.group) &&
        typeof saved.name === "string" && typeof saved.body?.receiptId === "string" &&
        (saved.action !== "rename" || typeof saved.body?.newName === "string") &&
        Number.isInteger(saved.body?.baseThemeVersion) && saved.body?.pageContext?.pageId === ctx.pageId &&
        Number.isInteger(saved.body?.pageContext?.baseDraftVersion)) {
      saved.uncertain = true;
      pendingVariableOperation = saved;
    }
  } catch { /* Storage can be unavailable or contain invalid data. */ }
  let variableHistory = null;
  const openVariableDeletePanels = new Set();
  variableHistory = createVariableHistory({
    session: ctx.session, api: ctx.api, storage: window.sessionStorage, editor: ctx.editor,
    hasPendingLegacyRename: () => pendingVariableOperation !== null,
    getTheme: () => siteTheme,
    setTheme: (latest) => {
      applyTheme(latest);
      lastVariableDeletion = null;
      rememberVariableHistory();
    },
    onChange: () => {
      if (!variableHistory || variableSaving) return;
      const state = variableHistory.state();
      const status = variablesHost.querySelector("[data-variable-status]");
      if (status && ["running", "rejected"].includes(state.status)) {
        status.textContent = state.message;
        for (const button of variablesHost.querySelectorAll("button")) button.disabled = state.status === "running";
      } else renderVariables();
    },
    isActive: () => ctx.isActive(),
  });
  function renderVariables() {
    variablesHost.replaceChildren();
    variablesHost.append(el("h2", { text: "Globale Variablen" }), el("p", { class: "canvas-view__variables-help", text: "Variablen gelten für das gesamte Projekt." }));
    if (!siteTheme) {
      variablesHost.append(el("p", { role: "alert", text: "Die Variablen konnten nicht geladen werden. Bitte lade den Editor erneut." }));
      return;
    }
    const colors = siteTheme.tokens?.primitive?.color ?? {};
    const spacings = siteTheme.tokens?.primitive?.spacing ?? {};
    const variableRows = [];
    const search = el("input", { type: "search", class: "canvas-view__variables-search", value: variableQuery, placeholder: "Variablen suchen", "aria-label": "Variablen suchen" });
    const noMatches = el("p", { class: "canvas-view__variables-help", "aria-live": "polite" });
    const filterVariables = () => {
      const query = variableQuery.trim().toLocaleLowerCase("de");
      let matches = 0;
      for (const row of variableRows) {
        const visible = row.name.toLocaleLowerCase("de").includes(query);
        row.element.hidden = !visible;
        if (visible) matches += 1;
      }
      noMatches.textContent = query && matches === 0 ? "Keine Variablen gefunden." : "";
    };
    search.addEventListener("input", () => { variableQuery = search.value; filterVariables(); });
    variablesHost.append(search, noMatches);
    const status = el("span", { role: "status", "aria-live": "polite", "data-variable-status": "true" });
    const reload = el("button", { type: "button", text: "Variablen neu laden" });
    reload.hidden = true;
    const statusBar = el("div", { class: "canvas-view__variables-status" }, status, reload);
    variablesHost.append(statusBar);
    const missingDrafts = [...variableDrafts].filter(([key]) => {
      const dot = key.indexOf(".");
      const group = key.slice(0, dot);
      const name = key.slice(dot + 1);
      return !Object.hasOwn(group === "color" ? colors : spacings, name);
    });
    if (missingDrafts.length > 0) {
      const drafts = el("div", { class: "canvas-view__variable-delete" }, el("p", { text: "Nicht gespeicherte Werte für nicht mehr vorhandene Variablen:" }));
      for (const [key, value] of missingDrafts) {
        const dot = key.indexOf(".");
        const label = `${key.slice(0, dot) === "color" ? "Farbe" : "Abstand"} ${key.slice(dot + 1)}`;
        const input = el("input", { type: "text", value, "aria-label": `Nicht gespeicherter Wert für ${label}` });
        const remove = el("button", { type: "button", text: "Entwurf entfernen", "aria-label": `Entwurf für ${label} entfernen` });
        input.addEventListener("input", () => variableDrafts.set(key, input.value));
        remove.addEventListener("click", () => { variableDrafts.delete(key); renderVariables(); });
        drafts.append(el("p", { text: label }), input, remove);
      }
      variablesHost.append(drafts);
    }
    reload.addEventListener("click", async () => {
      reload.disabled = true;
      try {
        const latest = await ctx.api(`/api/sites/${ctx.siteId}/theme`);
        applyTheme(latest);
        ctx.session.acceptThemeVersion(latest.version);
        renderVariables();
        variablesHost.querySelector('[role="status"]').textContent = "Aktualisiert. Bitte prüfe deine Eingaben.";
      } catch (error) {
        status.textContent = error?.message ?? "Aktualisieren fehlgeschlagen";
        reload.disabled = false;
      }
    });
    const saveVariable = async (group, name, value, button) => {
      if (variableSaving) return;
      if (pendingVariableOperation || variableHistory.pending()) { status.textContent = "Bitte zuerst den ausstehenden Variablenvorgang prüfen."; return; }
      if (ctx.session.saveState().unsupported.length > 0) { status.textContent = "Bitte zuerst nicht speicherbare Editoränderungen klären."; return; }
      if (group === "spacing" && !window.CSS.supports("padding", value)) {
        status.textContent = "Bitte einen gültigen Abstand eingeben, zum Beispiel 16px oder 1rem.";
        return;
      }
      variableSaving = true;
      for (const item of variablesHost.querySelectorAll("button")) item.disabled = true;
      status.textContent = "Wird gespeichert …";
      try {
        const isNew = !Object.hasOwn(group === "color" ? colors : spacings, name);
        const updated = await ctx.api(`/api/sites/${ctx.siteId}/theme`, {
          method: "PUT",
          body: { baseVersion: siteThemeVersion, theme: { tokens: { primitive: { [group]: { [name]: value } } } }, author: ctx.author },
        });
        applyTheme(updated);
        ctx.session.acceptThemeVersion(updated.version);
        if (variableDrafts.get(`${group}.${name}`) === value) variableDrafts.delete(`${group}.${name}`);
        const createDraft = variableCreateDrafts[group];
        if (isNew && createDraft.name.trim() === name && createDraft.value.trim() === value) {
          createDraft.name = "";
          createDraft.value = "";
        }
        ctx.canvas.setTheme(updated.theme, updated.css);
        ctx.inspector.setTheme(updated.theme);
        variableSaving = false;
        renderVariables();
        variablesHost.querySelector('[role="status"]').textContent = "Gespeichert";
      } catch (error) {
        status.textContent = error?.status === 409
          ? "Die Variablen wurden zwischenzeitlich geändert. Lade den aktuellen Stand und prüfe deine Eingaben."
          : (error?.message ?? "Speichern fehlgeschlagen");
        variableSaving = false;
        for (const item of variablesHost.querySelectorAll("button")) item.disabled = false;
        reload.hidden = error?.status !== 409;
        button.disabled = false;
      }
    };
    const canChangeVariable = (operation = null) => {
      if ((pendingVariableOperation && pendingVariableOperation !== operation) || variableHistory.pending()) {
        status.textContent = "Bitte zuerst den ausstehenden Variablenvorgang prüfen.";
        return false;
      }
      const save = ctx.session.saveState();
      if (save.pending > 0 || save.unsupported.length > 0 || save.status === "saving" || save.status === "conflict" || save.status === "error") {
        status.textContent = "Bitte zuerst offene Editoränderungen speichern oder ihren Konflikt klären.";
        return false;
      }
      return !variableSaving;
    };
    const variableActionLabel = (operation) => operation.action === "delete"
      ? `Variable ${operation.group}.${operation.name} gelöscht`
      : operation.action === "rename"
        ? `Variable ${operation.group}.${operation.name} umbenannt`
        : `Variable ${operation.group}.${operation.name} wiederhergestellt`;
    const beginVariableExternalHistory = (operation) => {
      if (typeof operation.externalHistoryId === "string" && ctx.session.pendingExternalId === operation.externalHistoryId) return operation.externalHistoryId;
      const entry = ctx.session.beginExternalAction({
        label: variableActionLabel(operation),
        versionBefore: ctx.session.version,
        versionAfter: ctx.session.version,
      });
      operation.externalHistoryId = entry.id;
      return entry.id;
    };
    const failVariableExternalHistory = (operation) => {
      if (operation.committed || typeof operation.externalHistoryId !== "string") return;
      try { ctx.session.failExternalAction(operation.externalHistoryId); } catch { /* History may have been cleared by a reload. */ }
      delete operation.externalHistoryId;
    };

    const runVariableOperationInner = async (operation) => {
      if (!canChangeVariable(operation)) return;
      if (operation.action !== "rename" && !operation.uncertain) {
        await variableHistory.start(operation);
        return;
      }
      variableSaving = true;
      try {
        beginVariableExternalHistory(operation);
        window.sessionStorage.setItem(pendingVariableKey, JSON.stringify(operation));
      } catch (error) {
        variableSaving = false;
        // A failed retry preflight does not resolve an earlier unknown write.
        if (!operation.uncertain) failVariableExternalHistory(operation);
        status.textContent = error?.message?.includes("externer Vorgang")
          ? "Bitte zuerst den laufenden Verlaufsvorgang abschließen."
          : "Der Vorgang kann nicht sicher vorgemerkt werden. Bitte Browser-Speicher freigeben.";
        return;
      }
      variableSaving = true;
      for (const item of variablesHost.querySelectorAll("button")) item.disabled = true;
      status.textContent = operation.action === "delete" ? "Variable wird gelöscht …" : operation.action === "rename" ? "Variable wird umbenannt …" : "Variable wird wiederhergestellt …";
      try {
        const result = await ctx.api(`/api/sites/${ctx.siteId}/theme/variables/${operation.group}/${encodeURIComponent(operation.name)}/${operation.action}`, { method: "POST", body: operation.body });
        if (!Number.isInteger(result.version) || !Number.isInteger(result.pageDraftVersion) ||
            result.version !== operation.body.baseThemeVersion + 1 || result.pageDraftVersion !== operation.body.pageContext.baseDraftVersion + 1 ||
            (["delete", "rename"].includes(operation.action) && result.receiptId !== operation.body.receiptId) ||
            (operation.action === "rename" && !Number.isInteger(result.registryVersion))) {
          throw new Error("Der Server hat die Änderung nicht vollständig bestätigt. Bitte erneut versuchen.");
        }
        operation.uncertain = true;
        const [latest, fresh, registry] = await Promise.all([
          ctx.api(`/api/sites/${ctx.siteId}/theme`),
          operation.action === "rename" ? ctx.api(`/api/pages/${ctx.pageId}`) : null,
          operation.action === "rename" ? ctx.api(`/api/sites/${ctx.siteId}/style-rules`) : null,
        ]);
        if (!latest.theme || !Number.isInteger(latest.version) || latest.version < result.version) throw new Error("Der aktuelle Variablenstand konnte nicht geladen werden. Bitte erneut versuchen.");
        if (operation.action === "rename" && (!fresh?.draft || !Number.isInteger(fresh.draftVersion) || !Array.isArray(registry?.rules) || !Number.isInteger(registry.version))) {
          throw new Error("Der aktuelle Editorstand konnte nicht geladen werden. Bitte erneut versuchen.");
        }
        const save = ctx.session.saveState();
        const clean = save.pending === 0 && save.unsupported.length === 0 && !["saving", "conflict", "error"].includes(save.status);
        const alreadyLoaded = ctx.session.version === result.pageDraftVersion && siteThemeVersion === result.version && clean;
        let accepted;
        let renameEntryId;
        if (operation.action === "rename") {
          const unchanged = clean && ctx.session.version === operation.body.pageContext.baseDraftVersion && siteThemeVersion === operation.body.baseThemeVersion;
          accepted = (unchanged || alreadyLoaded) && latest.version === result.version && fresh.draftVersion === result.pageDraftVersion && registry.version === result.registryVersion;
          if (accepted) {
            // Rename rewrites references on the server. Structured token
            // references in retained history patches are migrated so undo/redo
            // cannot bring the old name back; CSS-text references discard the
            // history instead of guessing. The confirmed server state is
            // adopted together with the committed external history entry.
            const loaded = ctx.editor.loadDocument(fresh.draft, { styleRules: registry.rules }).document;
            const migrated = ctx.session.migrateHistoryReferences(operation.group, operation.name, operation.body.newName);
            renameEntryId = operation.externalHistoryId;
            const base = ctx.session.pipeline.externalVersions();
            const next = { pageVersion: fresh.draftVersion, themeVersion: latest.version, registryVersion: registry.version };
            const atomic = migrated && unchanged && clean && typeof renameEntryId === "string" &&
              ctx.session.confirmExternalReplacement(renameEntryId, ctx.session.document, base, next, loaded);
            if (!atomic) {
              ctx.session.replaceDocument(loaded, fresh.draftVersion, registry.version, { preserveHistory: migrated });
              ctx.session.acceptThemeVersion(latest.version);
              ctx.setVersion(fresh.draftVersion);
              if (typeof renameEntryId === "string") ctx.session.commitExternalAction(renameEntryId, { versionAfter: fresh.draftVersion });
            } else {
              ctx.setVersion(fresh.draftVersion);
            }
            operation.committed = typeof renameEntryId === "string";
          }
        } else {
          accepted = latest.version === result.version && (alreadyLoaded || ctx.session.acceptExternalVersions(operation.body.pageContext.baseDraftVersion, operation.body.baseThemeVersion, result.pageDraftVersion, result.version));
        }
        applyTheme(latest);
        if (operation.action === "delete") {
          lastVariableDeletion = { group: operation.group, name: operation.name, receiptId: operation.body.receiptId, restored: false };
        } else if (operation.action === "restore") {
          lastVariableDeletion = { group: operation.group, name: operation.name, receiptId: operation.body.receiptId, restored: true };
        } else {
          const oldKey = `${operation.group}.${operation.name}`;
          const newKey = `${operation.group}.${operation.body.newName}`;
          if (variableDrafts.has(oldKey) && !variableDrafts.has(newKey)) {
            variableDrafts.set(newKey, variableDrafts.get(oldKey));
            variableDrafts.delete(oldKey);
          }
          lastVariableDeletion = null;
        }
        rememberVariableHistory();
        if (accepted) {
          pendingVariableOperation = null;
          if (operation.action === "rename" && typeof renameEntryId === "string") {
            variableHistory.recordRename(renameEntryId, { kind: "rename", group: operation.group, name: operation.name, newName: operation.body.newName, receiptId: result.receiptId, entryId: renameEntryId });
          } else {
            failVariableExternalHistory(operation);
          }
          try { window.sessionStorage.removeItem(pendingVariableKey); } catch { /* A replay remains idempotent. */ }
        } else {
          // A confirmed write without an adoptable base still leaves this
          // editor unresolved. Do not allow old history patches to cross it.
          pendingVariableOperation = operation;
          try { window.sessionStorage.setItem(pendingVariableKey, JSON.stringify(operation)); } catch { /* Recovery remains available in-memory. */ }
        }
        variableSaving = false;
        renderVariables();
        variablesHost.querySelector('[role="status"]').textContent = accepted
          ? (operation.action === "delete" ? "Variable gelöscht." : operation.action === "rename" ? "Variable umbenannt." : "Variable wiederhergestellt.")
          : "Änderung ausgeführt. Der Editorstand hat sich inzwischen geändert; bitte offene Änderungen prüfen.";
        if (!accepted) {
          const reloadEditor = el("button", { type: "button", text: "Editorstand laden (offene Änderungen verwerfen)" });
          reloadEditor.addEventListener("click", () => void ctx.reloadDraft());
          variablesHost.append(reloadEditor);
        }
      } catch (error) {
        variableSaving = false;
        for (const item of variablesHost.querySelectorAll("button")) item.disabled = false;
        if (operation.uncertain || !Number.isInteger(error?.status) || error.status >= 500) {
          // An unknown answer is not proof of rollback. Retain the navigation
          // lock, including when a later retry returns a version conflict.
          operation.uncertain = true;
          pendingVariableOperation = operation;
          try { window.sessionStorage.setItem(pendingVariableKey, JSON.stringify(operation)); } catch { /* Recovery UI remains available in-memory. */ }
          showPendingVariableRetry();
        } else {
          failVariableExternalHistory(operation);
          try { window.sessionStorage.removeItem(pendingVariableKey); } catch { /* A replay remains idempotent. */ }
        }
        status.textContent = error?.message ?? "Änderung fehlgeschlagen. Bitte erneut versuchen.";
        reload.hidden = error?.status !== 409;
      }
    };
    // Nach dem Vorgang gehoert die Seitenspalte wieder den Variablen: die
    // Dokument-Ersetzung waehrend der Bestaetigung waehlt sonst den Inspektor.
    const runVariableOperation = async (operation) => {
      try { await runVariableOperationInner(operation); }
      finally { ctx.showVariables?.(); }
    };
    const showPendingVariableRetry = () => {
      if ((!pendingVariableOperation && !variableHistory.pending()) || statusBar.querySelector("[data-variable-retry]")) return;
      const retry = el("button", { type: "button", text: "Ausstehenden Variablenvorgang prüfen", "data-variable-retry": "true" });
      const checkpointOnly = variableHistory.recoveryOnly();
      retry.hidden = checkpointOnly;
      const stop = el("button", { type: "button", text: "Prüfung beenden …" });
      const confirm = el("button", { type: "button", text: "Prüfung beenden und Editorstand laden" });
      const cancel = el("button", { type: "button", text: "Weiter prüfen" });
      const warning = el("div", { hidden: true },
        el("p", { text: checkpointOnly
          ? "Der gespeicherte Verlauf wird bewusst verworfen und der aktuelle Editorstand geladen. Separate ältere Belege bleiben erhalten. Offene Editoränderungen müssen vorher gespeichert oder geklärt sein."
          : "Der Vorgang könnte ausgeführt worden sein. Die Zuordnung zum Rückgängig geht verloren und die Editor-History wird geleert. Offene Editoränderungen müssen vorher gespeichert oder geklärt sein." }), confirm, cancel);
      retry.addEventListener("click", () => { if (variableHistory.pending()) void variableHistory.retry(); else void runVariableOperation(pendingVariableOperation); });
      stop.addEventListener("click", () => { warning.hidden = false; stop.hidden = true; });
      cancel.addEventListener("click", () => { warning.hidden = true; stop.hidden = false; });
      confirm.addEventListener("click", async () => {
        if ((!pendingVariableOperation && !variableHistory.pending()) || variableSaving || variableHistory.state().status === "running") return;
        const before = ctx.session.saveState();
        if (before.pending > 0 || before.unsupported.length > 0 || ["saving", "conflict", "error"].includes(before.status)) {
          status.textContent = "Bitte zuerst offene Editoränderungen speichern oder ihren Konflikt klären.";
          return;
        }
        const originalDocument = ctx.session.document;
        const originalVersion = ctx.session.version;
        const originalOperation = pendingVariableOperation ?? variableHistory.pending();
        const originalThemeVersion = siteThemeVersion;
        const originalVersions = ctx.session.pipeline.externalVersions();
        variableSaving = true;
        for (const item of variablesHost.querySelectorAll("button")) item.disabled = true;
        status.textContent = "Editorstand wird geladen …";
        try {
          const [fresh, registry, theme] = await Promise.all([ctx.api(`/api/pages/${ctx.pageId}`), ctx.api(`/api/sites/${ctx.siteId}/style-rules`), ctx.api(`/api/sites/${ctx.siteId}/theme`)]);
          if (!fresh.draft || !Number.isInteger(fresh.draftVersion) || !Array.isArray(registry.rules) || !Number.isInteger(registry.version) || !theme.theme || !Number.isInteger(theme.version)) {
            throw new Error("Der aktuelle Editorstand konnte nicht geladen werden.");
          }
          const after = ctx.session.saveState();
          if (!ctx.isActive() || (pendingVariableOperation ?? variableHistory.pending()) !== originalOperation || ctx.session.document !== originalDocument || ctx.session.version !== originalVersion || siteThemeVersion !== originalThemeVersion || after.pending > 0 || after.unsupported.length > 0 || ["saving", "conflict", "error"].includes(after.status)) {
            throw new Error("Der Editorstand hat sich inzwischen geändert. Bitte offene Änderungen prüfen und erneut versuchen.");
          }
          const loaded = ctx.editor.loadDocument(fresh.draft, { styleRules: registry.rules }).document;
          if (!variableHistory.abandon({ original: originalDocument, base: originalVersions, document: loaded,
            next: { pageVersion: fresh.draftVersion, registryVersion: registry.version, themeVersion: theme.version },
            pendingId: originalOperation.externalHistoryId,
            beforeCommit: () => {
              if (!checkpointOnly) window.sessionStorage.removeItem(variableHistoryKey);
              pendingVariableOperation = null;
              if (!checkpointOnly) { lastVariableDeletion = null; }
              siteTheme = theme.theme;
              siteThemeVersion = theme.version;
            },
          })) throw new Error("Der Editorstand hat sich inzwischen geändert. Bitte offene Änderungen prüfen und erneut versuchen.");
          ctx.setTheme(theme.theme, theme.version, theme.css);
          ctx.setVersion(fresh.draftVersion);
          variableSaving = false;
          renderVariables();
          variablesHost.querySelector('[role="status"]').textContent = "Prüfung beendet. Der aktuelle Editorstand wurde geladen.";
        } catch (error) {
          variableSaving = false;
          for (const item of variablesHost.querySelectorAll("button")) item.disabled = false;
          status.textContent = error?.message ?? "Der Editorstand konnte nicht geladen werden.";
        }
      });
      statusBar.append(retry, stop, warning);
    };
    // Reload creates a fresh ctx.session, so persisted history ids cannot own its
    // lock. Reattach before the user can navigate, not only when Retry starts.
    if (pendingVariableOperation) beginVariableExternalHistory(pendingVariableOperation);
    showPendingVariableRetry();
    if (pendingVariableOperation) status.textContent = "Ein Variablenvorgang wurde noch nicht bestätigt. Bitte prüfe ihn.";
    else status.textContent = variableHistory.state().message;
    if (variableHistory.state().status === "unresolved") {
      const reloadEditor = el("button", { type: "button", text: "Editorstand laden (offene Änderungen verwerfen)" });
      reloadEditor.addEventListener("click", () => void ctx.reloadDraft());
      variablesHost.append(reloadEditor);
    }
    const newVariableOperation = (action, group, name, receiptId) => ({
      action, group, name,
      body: { receiptId, baseThemeVersion: siteThemeVersion, pageContext: { pageId: ctx.pageId, baseDraftVersion: ctx.session.version } },
    });
    if (lastVariableDeletion) {
      const entry = lastVariableDeletion;
      const label = entry.restored ? `Löschen von ${entry.name} wiederholen` : `Löschen von ${entry.name} rückgängig`;
      const undo = el("button", { type: "button", text: label, "aria-label": label });
      let operation = null;
      undo.addEventListener("click", () => {
        if (!canChangeVariable()) return;
        if (entry.restored && variableDrafts.has(`${entry.group}.${entry.name}`)) { status.textContent = "Bitte den geänderten Wert vor dem Löschen speichern."; return; }
        operation ??= newVariableOperation(entry.restored ? "delete" : "restore", entry.group, entry.name, entry.restored ? window.crypto.randomUUID() : entry.receiptId);
        void runVariableOperation(operation);
      });
      variablesHost.append(undo);
    }
    const sharedNavigation = variableHistory.navigation();
    if (sharedNavigation) {
      const label = sharedNavigation.action === "rename"
        ? (sharedNavigation.direction === "undo" ? `Umbenennung von ${sharedNavigation.name} rückgängig` : `Umbenennung von ${sharedNavigation.name} wiederholen`)
        : sharedNavigation.action === "restore" ? `Löschen von ${sharedNavigation.name} rückgängig` : `Löschen von ${sharedNavigation.name} wiederholen`;
      const undo = el("button", { type: "button", text: label, "aria-label": label });
      undo.disabled = !sharedNavigation.available;
      undo.addEventListener("click", () => {
        if (!canChangeVariable()) return;
        const currentName = sharedNavigation.action === "rename"
          ? (sharedNavigation.direction === "undo" ? sharedNavigation.newName : sharedNavigation.name)
          : sharedNavigation.name;
        if ((sharedNavigation.action === "delete" || sharedNavigation.action === "rename") && variableDrafts.has(`${sharedNavigation.group}.${currentName}`)) {
          status.textContent = sharedNavigation.action === "rename" ? "Bitte den geänderten Wert vor dem Umbenennen speichern." : "Bitte den geänderten Wert vor dem Löschen speichern.";
          return;
        }
        void (sharedNavigation.direction === "undo" ? ctx.session.undoAsync() : ctx.session.redoAsync());
      });
      variablesHost.append(undo);
    }
    const appendUsage = (row, group, name) => {
      const label = group === "color" ? "Farbe" : "Abstand";
      const button = el("button", { type: "button", text: "Verwendung", "aria-label": `Verwendung von ${label} ${name} anzeigen` });
      const result = el("div", { class: "canvas-view__variable-usage", "aria-live": "polite" });
      button.addEventListener("click", async () => {
        button.disabled = true;
        result.textContent = "Verwendung wird geladen …";
        try {
          const usage = await ctx.api(`/api/sites/${ctx.siteId}/theme/variables/${group}/${encodeURIComponent(name)}/usage`);
          const nodes = usage.pages.reduce((sum, page) => sum + page.nodes.length, 0);
          const pages = usage.pages.length;
          const rules = usage.rules.length;
          const aliases = usage.themePaths.length;
          const summary = `Gespeicherte direkte Verweise: ${nodes} ${nodes === 1 ? "Element" : "Elemente"} auf ${pages} ${pages === 1 ? "Seite" : "Seiten"}, ${rules} ${rules === 1 ? "Stilregel" : "Stilregeln"} und ${aliases} Theme-${aliases === 1 ? "Verweis" : "Verweise"}.`;
          const details = [
            ...usage.pages.map((page) => `Seite ${page.pagePath}: ${page.nodes.length} ${page.nodes.length === 1 ? "Element" : "Elemente"} (${page.nodes.map((node) => node.nodeId).join(", ")})`),
            ...usage.rules.map((rule) => `Stilregel: ${rule.name}`),
            ...usage.themePaths.map((path) => `Theme: ${path}`),
          ];
          result.replaceChildren(el("p", { text: summary }), ...(details.length ? [el("ul", {}, ...details.map((text) => el("li", { text })))] : []), el("p", { text: "Nicht gespeicherte und indirekte Verweise können fehlen." }));
        } catch (error) {
          result.textContent = error?.message ?? "Verwendung konnte nicht geladen werden.";
        } finally {
          button.disabled = false;
        }
      });
      row.append(button, result);
    };
    const appendRename = (row, group, name) => {
      const label = group === "color" ? "Farbe" : "Abstand";
      const button = el("button", { type: "button", text: "Umbenennen …", "aria-label": `${label} ${name} umbenennen` });
      const input = el("input", { type: "text", value: name, "aria-label": `Neuer Name für ${label} ${name}` });
      const confirm = el("button", { type: "button", text: "Umbenennen bestätigen", "aria-label": `${label} ${name} umbenennen bestätigen` });
      const cancel = el("button", { type: "button", text: "Abbrechen", "aria-label": `Umbenennen von ${label} ${name} abbrechen` });
      const panel = el("div", { class: "canvas-view__variable-delete", hidden: true },
        el("p", { text: "Erkannte Verweise in Seiten, Klassen und Theme werden geändert. Externe oder dynamische Verweise können fehlen. Die Editor-History bleibt erhalten; strukturierte Token-Verweise werden mitgeführt. Rückgängig und Wiederholen laufen über die gemeinsame History." }), input, confirm, cancel);
      let operation = null;
      button.addEventListener("click", () => { panel.hidden = false; button.hidden = true; });
      cancel.addEventListener("click", () => { operation = null; panel.hidden = true; button.hidden = false; });
      input.addEventListener("input", () => { if (!pendingVariableOperation) operation = null; });
      confirm.addEventListener("click", () => {
        if (variableDrafts.has(`${group}.${name}`)) { status.textContent = "Bitte den geänderten Wert vor dem Umbenennen speichern."; return; }
        const newName = input.value.trim();
        if (!/^[a-z][a-z0-9-]*$/.test(newName) || newName === name) { status.textContent = "Bitte einen anderen Namen mit Kleinbuchstaben, Zahlen und Bindestrichen eingeben."; return; }
        if (!canChangeVariable()) return;
        operation ??= newVariableOperation("rename", group, name, window.crypto.randomUUID());
        operation.body.newName = newName;
        void runVariableOperation(operation);
      });
      row.append(button, panel);
    };
    const appendDelete = (row, group, name) => {
      const panelKey = `${group}.${name}`;
      const label = group === "color" ? "Farbe" : "Abstand";
      const button = el("button", { type: "button", text: "Löschen …", "aria-label": `${label} ${name} löschen` });
      const confirm = el("button", { type: "button", text: "Variable löschen", "aria-label": `${label} ${name} löschen bestätigen` });
      const cancel = el("button", { type: "button", text: "Abbrechen", "aria-label": `Löschen von ${label} ${name} abbrechen` });
      const panel = el("div", { class: "canvas-view__variable-delete" },
        el("p", { text: "Nur ohne erkannte direkte Verweise. Externe oder dynamische Verweise können fehlen. Rückgängig ist möglich, solange Theme, Klassen und Seiten unverändert bleiben." }), confirm, cancel);
      panel.hidden = !openVariableDeletePanels.has(panelKey);
      button.hidden = !panel.hidden;
      let operation = null;
      button.addEventListener("click", () => { openVariableDeletePanels.add(panelKey); panel.hidden = false; button.hidden = true; });
      cancel.addEventListener("click", () => { openVariableDeletePanels.delete(panelKey); operation = null; panel.hidden = true; button.hidden = false; });
      confirm.addEventListener("click", () => {
        if (variableDrafts.has(`${group}.${name}`)) { status.textContent = "Bitte den geänderten Wert vor dem Löschen speichern."; return; }
        if (!canChangeVariable()) return;
        operation ??= newVariableOperation("delete", group, name, window.crypto.randomUUID());
        void runVariableOperation(operation);
      });
      row.append(button, panel);
    };
    const list = el("div", { class: "canvas-view__variable-list" });
    for (const [name, value] of Object.entries(colors)) {
      if (typeof value !== "string") continue;
      const draft = variableDrafts.get(`color.${name}`) ?? value;
      const input = el("input", { type: "text", value: draft, "aria-label": `Farbe ${name}`, spellcheck: "false" });
      const swatch = el("input", { type: "color", class: "canvas-view__variable-swatch", "aria-label": `Farbe ${name} auswählen`, value: /^#[0-9a-f]{6}$/i.test(draft) ? draft : "#000000" });
      swatch.addEventListener("input", () => { input.value = swatch.value; variableDrafts.set(`color.${name}`, input.value); });
      input.addEventListener("input", () => { variableDrafts.set(`color.${name}`, input.value); if (/^#[0-9a-f]{6}$/i.test(input.value)) swatch.value = input.value; });
      const button = el("button", { type: "button", text: "Speichern", "aria-label": `Farbe ${name} speichern` });
      button.addEventListener("click", () => void saveVariable("color", name, input.value.trim(), button));
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); button.click(); } });
      const row = el("div", { class: "canvas-view__variable-row" }, el("label", { text: name }), swatch, input, button);
      appendUsage(row, "color", name);
      appendRename(row, "color", name);
      appendDelete(row, "color", name);
      variableRows.push({ name, element: row });
      list.append(row);
    }
    const name = el("input", { type: "text", value: variableCreateDrafts.color.name, placeholder: "Name", "aria-label": "Name der neuen Farbe" });
    const value = el("input", { type: "text", value: variableCreateDrafts.color.value, placeholder: "#000000", "aria-label": "Wert der neuen Farbe" });
    name.addEventListener("input", () => { variableCreateDrafts.color.name = name.value; });
    value.addEventListener("input", () => { variableCreateDrafts.color.value = value.value; });
    const add = el("button", { type: "button", text: "Farbe hinzufügen" });
    add.addEventListener("click", () => {
      const key = name.value.trim();
      if (!/^[a-z][a-z0-9-]*$/.test(key)) { status.textContent = "Bitte einen Namen mit Kleinbuchstaben, Zahlen und Bindestrichen eingeben."; return; }
      if (Object.hasOwn(colors, key)) { status.textContent = "Diese Farbe existiert bereits."; return; }
      void saveVariable("color", key, value.value.trim(), add);
    });
    const spacingList = el("div", { class: "canvas-view__variable-list" });
    for (const [key, stored] of Object.entries(spacings)) {
      if (typeof stored !== "string") continue;
      const input = el("input", { type: "text", value: variableDrafts.get(`spacing.${key}`) ?? stored, "aria-label": `Abstand ${key}` });
      input.addEventListener("input", () => variableDrafts.set(`spacing.${key}`, input.value));
      const save = el("button", { type: "button", text: "Speichern", "aria-label": `Abstand ${key} speichern` });
      save.addEventListener("click", () => void saveVariable("spacing", key, input.value.trim(), save));
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); save.click(); } });
      const row = el("div", { class: "canvas-view__variable-row canvas-view__variable-row--spacing" }, el("label", { text: key }), input, save);
      appendUsage(row, "spacing", key);
      appendRename(row, "spacing", key);
      appendDelete(row, "spacing", key);
      variableRows.push({ name: key, element: row });
      spacingList.append(row);
    }
    const spacingName = el("input", { type: "text", value: variableCreateDrafts.spacing.name, placeholder: "Name", "aria-label": "Name des neuen Abstands" });
    const spacingValue = el("input", { type: "text", value: variableCreateDrafts.spacing.value, placeholder: "16px", "aria-label": "Wert des neuen Abstands" });
    spacingName.addEventListener("input", () => { variableCreateDrafts.spacing.name = spacingName.value; });
    spacingValue.addEventListener("input", () => { variableCreateDrafts.spacing.value = spacingValue.value; });
    const addSpacing = el("button", { type: "button", text: "Abstand hinzufügen" });
    addSpacing.addEventListener("click", () => {
      const key = spacingName.value.trim();
      if (!/^[a-z][a-z0-9-]*$/.test(key)) { status.textContent = "Bitte einen Namen mit Kleinbuchstaben, Zahlen und Bindestrichen eingeben."; return; }
      if (Object.hasOwn(spacings, key)) { status.textContent = "Dieser Abstand existiert bereits."; return; }
      void saveVariable("spacing", key, spacingValue.value.trim(), addSpacing);
    });
    variablesHost.append(el("h3", { text: "Farben" }), list, el("div", { class: "canvas-view__variable-create" }, name, value, add), el("h3", { text: "Abstände" }), spacingList, el("div", { class: "canvas-view__variable-create" }, spacingName, spacingValue, addSpacing));
    filterVariables();
    if (variableHistory.state().status === "running") for (const button of variablesHost.querySelectorAll("button")) button.disabled = true;
  }
  renderVariables();
  return {
    element: variablesHost,
    render: () => renderVariables(),
    setTheme: (theme, version) => {
      siteTheme = theme;
      siteThemeVersion = version;
      renderVariables();
    },
    dispose: () => { try { variableHistory?.dispose?.(); } catch { /* ignore */ } },
  };
}
