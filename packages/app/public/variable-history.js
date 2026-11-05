// App-owned receipts and requests. The session owns the document and cursor;
// storage is only a checked reload checkpoint, never a second live history.
const sorted = (value) => Array.isArray(value) ? value.map(sorted) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)])) : value;
const equal = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const validReceipt = (receipt) => record(receipt) && ["delete", "restore"].includes(receipt.kind) && ["color", "spacing"].includes(receipt.group) &&
  typeof receipt.name === "string" && /^[a-z][a-z0-9-]*$/.test(receipt.name) && !["constructor", "prototype"].includes(receipt.name) &&
  typeof receipt.receiptId === "string" && /^[a-zA-Z0-9_-]+$/.test(receipt.receiptId) && typeof receipt.entryId === "string";

export function createVariableHistory({ session, api, storage, editor, getTheme, setTheme, onChange, isActive, hasPendingLegacyRename }) {
  const { siteId, pageId } = session;
  const key = `senify:editor-history:${siteId}:${pageId}`;
  const pendingKey = `senify:pending-variable:${siteId}:${pageId}`;
  let receipts = new Map();
  let operation = null;
  let checkpointRecovery = null;
  let candidate = null;
  let reloaded = false;
  let disposed = false;
  let syncing = false;
  let state = { status: "idle", message: "" };
  let uiKey = "";
  let persisted = "";
  let pendingCleanup = false;
  let originalDocument;
  let originalVersions;
  const active = () => !disposed && isActive();
  const read = (name) => { try { const value = storage.getItem(name); return value === null ? null : JSON.parse(value) ?? { invalid: true }; } catch { return { invalid: true }; } };
  const validEnvelope = (envelope) => {
    try {
      const checkpoint = envelope?.checkpoint;
      const versions = checkpoint?.versions;
      const entries = checkpoint?.history?.entries;
      if (envelope?.format !== 1 || checkpoint?.format !== 1 || checkpoint.siteId !== siteId || checkpoint.pageId !== pageId ||
          !Number.isSafeInteger(versions?.pageVersion) || versions.pageVersion < 1 || !Number.isSafeInteger(versions.themeVersion) || versions.themeVersion < 1 ||
          !Number.isSafeInteger(versions.registryVersion) || versions.registryVersion < 0 || !Array.isArray(envelope.receipts) || !Array.isArray(entries) ||
          !envelope.receipts.every(validReceipt) || !entries.every(record)) return false;
      const history = editor.checkedEditorHistory(checkpoint.history, checkpoint.document);
      editor.checkedClassDeletionReceipts(checkpoint.classDeletionReceipts, history);
      return new Set(envelope.receipts.map((item) => item.entryId)).size === envelope.receipts.length &&
        entries.filter((entry) => entry.external).every((entry) => envelope.receipts.some((item) => item.entryId === entry.id)) &&
        envelope.receipts.every((item) => entries.some((entry) => entry.id === item.entryId && entry.external));
    } catch { return false; }
  };
  const envelope = (checkpoint) => ({ format: 1, checkpoint, receipts: [...receipts.values()].filter((item) => checkpoint.history.entries.some((entry) => entry.id === item.entryId)) });
  const navigation = () => {
    for (const direction of ["undo", "redo"]) {
      const entry = session.store.history.navigationEntry(direction);
      const receipt = entry && receipts.get(entry.id);
      if (receipt) {
        const action = (receipt.kind === "delete") === (direction === "redo") ? "delete" : "restore";
        return { ...receipt, direction, action, available: direction === "undo" ? session.canUndoAsync : session.canRedoAsync };
      }
    }
    return null;
  };
  const notify = () => {
    if (!active()) return;
    const next = JSON.stringify([state, operation !== null, navigation()]);
    if (next !== uiKey) { uiKey = next; onChange(); }
  };
  const persist = () => {
    // Legacy Rename owns a separate lease. Its startup checkpoint must survive
    // the window before that lease is attached, and every unresolved retry.
    if (!active() || operation || checkpointRecovery || hasPendingLegacyRename()) return;
    const checkpoint = session.historyCheckpoint();
    if (!checkpoint) return;
    const value = JSON.stringify(envelope(checkpoint));
    try {
      if (value !== persisted) { storage.setItem(key, value); persisted = value; }
      // Keep the secured request until its confirmed successor is durable.
      if (pendingCleanup) pendingCleanup = !clearPending();
    } catch { state.message = "Der Verlauf bleibt in dieser Sitzung verfügbar, kann aber nicht für das Neuladen gespeichert werden."; }
  };
  const rememberPending = () => {
    try { storage.setItem(pendingKey, JSON.stringify(operation)); }
    catch { throw new Error("Der Vorgang kann nicht sicher vorgemerkt werden. Bitte Browser-Speicher freigeben."); }
  };
  const clearPending = () => { try { storage.removeItem(pendingKey); return true; } catch { return false; } };
  const unresolved = (message) => {
    operation.uncertain = true;
    state = { status: "unresolved", message };
    try { rememberPending(); } catch { /* The originally secured request is still in storage. */ }
    notify();
    return false;
  };
  const finish = () => {
    receipts.set(candidate.receipt.entryId, candidate.receipt);
    const latest = candidate.theme;
    const action = operation.action;
    operation = null;
    candidate = null;
    reloaded = false;
    state = { status: "idle", message: action === "delete" ? "Variable gelöscht." : "Variable wiederhergestellt." };
    pendingCleanup = true;
    setTheme(latest);
    register();
    persist();
    notify();
  };
  const preflight = () => active() && session.document === originalDocument && equal(session.pipeline.externalVersions(), originalVersions) &&
    session.saveState().pending === 0 && session.saveState().unsupported.length === 0 && !["saving", "conflict", "error"].includes(session.saveState().status);
  const verifyPending = () => {
    const before = operation?.before;
    const body = operation?.body;
    if (!validEnvelope(before) || !record(before.theme) || !validReceipt(operation.record) || !["first", "navigation", "legacy"].includes(operation.mode) ||
        !["delete", "restore"].includes(operation.action) || operation.group !== operation.record.group || operation.name !== operation.record.name ||
        typeof body?.receiptId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(body.receiptId) || body.pageContext?.pageId !== pageId ||
        before.checkpoint.siteId !== siteId || before.checkpoint.pageId !== pageId) return false;
    const loadedIncrement = before.checkpoint.versions.themeVersion - body.baseThemeVersion;
    if (operation.mode === "legacy") {
      if (before.checkpoint.history.entries.length !== 0 || !Number.isSafeInteger(body.baseThemeVersion) || body.baseThemeVersion < 1 ||
          !Number.isSafeInteger(body.pageContext.baseDraftVersion) || body.pageContext.baseDraftVersion < 1 ||
          ![0, 1].includes(loadedIncrement) || before.checkpoint.versions.pageVersion - body.pageContext.baseDraftVersion !== loadedIncrement) return false;
    } else if (loadedIncrement !== 0 || body.pageContext.baseDraftVersion !== before.checkpoint.versions.pageVersion) return false;
    const history = before.checkpoint.history;
    if (operation.mode === "navigation") {
      if (!["undo", "redo"].includes(operation.direction)) return false;
      const entry = history.entries[operation.direction === "undo" ? history.cursor - 1 : history.cursor];
      const action = (operation.record.kind === "delete") === (operation.direction === "redo") ? "delete" : "restore";
      if (entry?.id !== operation.record.entryId || !entry.external || action !== operation.action ||
          !equal(before.receipts.find((item) => item.entryId === entry.id), operation.record)) return false;
    } else {
      if (operation.entry?.id !== operation.record.entryId || !operation.entry.external || operation.entry.status !== "pending" ||
          operation.record.kind !== operation.action || history.entries.some((entry) => entry.id === operation.entry.id)) return false;
      try { editor.checkpointAfterExternalCommit(before.checkpoint, operation.entry); }
      catch { return false; }
    }
    return operation.action !== "restore" || body.receiptId === operation.record.receiptId;
  };
  const execute = async () => {
    try {
      if (!verifyPending()) throw new Error("Der gespeicherte Verlaufsvorgang ist ungültig. Bitte die Prüfung ausdrücklich beenden.");
      if (!active() || (!operation.uncertain && !preflight())) throw new Error("Der Editorstand hat sich inzwischen geändert. Bitte offene Änderungen prüfen.");
      // Retry never changes this body, including after a reload or a conflict.
      rememberPending();
    } catch (error) { throw Object.assign(error, { notSent: true }); }
    const result = await api(`/api/sites/${siteId}/theme/variables/${operation.group}/${encodeURIComponent(operation.name)}/${operation.action}`, { method: "POST", body: operation.body });
    operation.uncertain = true;
    if (!Number.isSafeInteger(result.version) || !Number.isSafeInteger(result.pageDraftVersion) ||
        result.version !== operation.body.baseThemeVersion + 1 || result.pageDraftVersion !== operation.body.pageContext.baseDraftVersion + 1 ||
        (operation.action === "delete" && result.receiptId !== operation.body.receiptId)) throw new Error("Der Server hat die Änderung nicht vollständig bestätigt. Bitte erneut versuchen.");
    const [theme, page, registry] = await Promise.all([api(`/api/sites/${siteId}/theme`), api(`/api/pages/${pageId}`), api(`/api/sites/${siteId}/style-rules`)]);
    if (!active()) throw new Error("Die Editoransicht wurde verlassen. Bitte den Vorgang beim erneuten Öffnen prüfen.");
    const before = operation.before.checkpoint;
    if (!theme.theme || theme.version !== result.version || !page.draft || page.draftVersion !== result.pageDraftVersion ||
        !Array.isArray(registry.rules) || registry.version !== before.versions.registryVersion) throw new Error("Der aktuelle Editorstand bestätigt den Vorgang nicht. Bitte erneut prüfen.");
    const document = editor.loadDocument(page.draft, { styleRules: registry.rules }).document;
    if (!editor.historyDocumentsEqual(before.document, document) || !editor.historyDocumentsEqual(before.document, session.document)) throw new Error("Der Editorinhalt hat sich inzwischen geändert. Bitte offene Änderungen prüfen.");
    const oldTheme = globalThis.structuredClone(operation.before.theme);
    const newTheme = globalThis.structuredClone(theme.theme);
    const oldBag = oldTheme.tokens?.primitive?.[operation.group];
    const newBag = newTheme.tokens?.primitive?.[operation.group];
    const alreadyLoadedLegacy = operation.mode === "legacy" && before.versions.themeVersion === result.version;
    if (alreadyLoadedLegacy) {
      // Only the replayed result and the currently loaded contents are checked.
      // No earlier history or missing pre-write theme is reconstructed.
      if (!newBag || (operation.action === "delete" ? Object.hasOwn(newBag, operation.name) : typeof newBag[operation.name] !== "string")) throw new Error("Der Variableninhalt wurde nicht bestätigt.");
    } else {
      const value = operation.action === "delete" ? oldBag?.[operation.name] : newBag?.[operation.name];
      if (typeof value !== "string" || !oldBag || !newBag) throw new Error("Der Variableninhalt wurde nicht bestätigt.");
      if (operation.action === "delete") { delete oldBag[operation.name]; if (Object.hasOwn(newBag, operation.name)) throw new Error("Die Variable wurde nicht gelöscht."); }
      else { delete newBag[operation.name]; if (Object.hasOwn(oldBag, operation.name)) throw new Error("Die Variable war bereits vorhanden."); }
    }
    if (!equal(oldTheme, newTheme)) throw new Error("Weitere Variableninhalte haben sich inzwischen geändert. Bitte erneut prüfen.");
    candidate = { theme, receipt: { ...operation.record, receiptId: operation.body.receiptId }, versions: { pageVersion: result.pageDraftVersion, themeVersion: result.version, registryVersion: registry.version } };
    return { status: "committed", ...candidate.versions };
  };
  const run = async () => {
    state = { status: "running", message: operation.action === "delete" ? "Variable wird gelöscht …" : "Variable wird wiederhergestellt …" };
    notify();
    try {
      await execute();
      if (!preflight()) return unresolved("Änderung ausgeführt. Der Editorstand hat sich inzwischen geändert; bitte offene Änderungen prüfen.");
      if (reloaded) {
        const checkpoint = operation.mode !== "navigation" ? editor.checkpointAfterExternalCommit(operation.before.checkpoint, operation.entry, candidate.versions)
          : globalThis.structuredClone(operation.before.checkpoint);
        checkpoint.versions = candidate.versions;
        checkpoint.document = session.document;
        if (operation.mode === "navigation") checkpoint.history.cursor += operation.direction === "undo" ? -1 : 1;
        if (!session.confirmExternalHistoryRecovery(operation.externalHistoryId, checkpoint, originalVersions)) return unresolved("Der gespeicherte Verlauf kann nicht übernommen werden. Bitte erneut prüfen oder die Prüfung beenden.");
        receipts = new Map(operation.before.receipts.map((item) => [item.entryId, item]));
      } else if (!session.confirmExternalAction(operation.externalHistoryId, originalDocument, originalVersions, candidate.versions)) {
        return unresolved("Der Editorstand kann nicht übernommen werden. Bitte offene Änderungen prüfen.");
      }
      finish();
      return true;
    } catch (error) {
      if (!active()) return false;
      if (operation.uncertain || (!error.notSent && (!Number.isInteger(error?.status) || error.status >= 500))) return unresolved(error?.message ?? "Der Serverstand ist unklar.");
      session.failExternalAction(operation.externalHistoryId);
      operation = null;
      candidate = null;
      state = { status: "rejected", message: error.message };
      clearPending();
      persist();
      notify();
      return false;
    }
  };
  const register = () => {
    const entries = session.store.history.entries();
    for (const [id, receipt] of receipts) {
      if (!entries.some((entry) => entry.id === id)) { receipts.delete(id); continue; }
      session.registerExternalHistory(id, async (request) => {
        if (!active()) return { status: "rejected", message: "Die Editoransicht wurde verlassen." };
        if (!operation) {
          // The lease already exists. Its original clean checkpoint was
          // captured by sync() before navigation started.
          const before = read(key);
          if (!validEnvelope(before) || !equal(before.checkpoint.versions, request.versions) || !editor.historyDocumentsEqual(before.checkpoint.document, session.document)) {
            return { status: "rejected", message: "Der Verlauf kann nicht sicher vorgemerkt werden. Bitte Browser-Speicher freigeben." };
          }
          const action = (receipt.kind === "delete") === (request.direction === "redo") ? "delete" : "restore";
          operation = { format: 2, mode: "navigation", direction: request.direction, action, group: receipt.group, name: receipt.name, record: { ...receipt }, before: { ...before, theme: globalThis.structuredClone(getTheme()) },
            body: { receiptId: action === "delete" ? globalThis.crypto.randomUUID() : receipt.receiptId, baseThemeVersion: request.versions.themeVersion, pageContext: { pageId, baseDraftVersion: request.versions.pageVersion } }, externalHistoryId: session.pendingExternalId };
          originalDocument = session.document;
          originalVersions = request.versions;
        }
        state = { status: "running", message: "Verlaufsvorgang wird geprüft …" };
        notify();
        try { return await execute(); }
        catch (error) {
          const unknown = operation.uncertain || request.uncertain || (!error.notSent && (!Number.isInteger(error?.status) || error.status >= 500));
          if (unknown) operation.uncertain = true;
          return { status: unknown ? "unknown" : "rejected", message: error.message ?? "Der Serverstand ist unklar." };
        }
      });
    }
  };
  const sync = () => {
    if (!active() || syncing) return;
    syncing = true;
    try {
      if (operation?.mode === "navigation" && !reloaded) {
        const external = session.externalHistoryState();
        if (external.status === "idle" && !session.pendingExternalId && candidate) finish();
        else if (external.status === "unresolved") unresolved(external.message ?? "Der Serverstand ist unklar.");
        else if (external.status === "rejected" && !session.pendingExternalId) {
          operation = null; candidate = null; clearPending(); state = external;
        }
      }
      persist();
      notify();
    } finally { syncing = false; }
  };
  const savedPending = read(pendingKey);
  const legacyPending = record(savedPending) && savedPending.format !== 2 && ["rename", "delete", "restore"].includes(savedPending.action) &&
    ["color", "spacing"].includes(savedPending.group) && typeof savedPending.name === "string" && typeof savedPending.body?.receiptId === "string" &&
    (savedPending.action !== "rename" || typeof savedPending.body?.newName === "string") && Number.isInteger(savedPending.body?.baseThemeVersion) &&
    savedPending.body?.pageContext?.pageId === pageId && Number.isInteger(savedPending.body.pageContext.baseDraftVersion);
  if (savedPending !== null && (!legacyPending || savedPending.action !== "rename")) {
    const checkpoint = session.historyCheckpoint();
    operation = record(savedPending) ? savedPending : { invalid: true };
    operation.uncertain = true;
    reloaded = true;
    originalDocument = session.document;
    originalVersions = session.pipeline.externalVersions();
    const entry = session.beginExternalAction({ label: legacyPending ? `Variable ${operation.group}.${operation.name} ${operation.action === "delete" ? "gelöscht" : "wiederhergestellt"}` : "Ausstehenden Variablenvorgang prüfen", versionBefore: session.version, versionAfter: session.version });
    operation.externalHistoryId = entry.id;
    if (legacyPending) operation = { ...operation, format: 2, mode: "legacy", entry: globalThis.structuredClone(entry),
      record: { kind: operation.action, group: operation.group, name: operation.name, receiptId: operation.body.receiptId, entryId: entry.id },
      before: checkpoint ? { ...envelope(checkpoint), theme: globalThis.structuredClone(getTheme()) } : null };
    state = { status: "unresolved", message: "Ein Variablenvorgang wurde noch nicht bestätigt. Bitte prüfe ihn." };
  } else if (savedPending === null) {
    const saved = read(key);
    if (validEnvelope(saved) && session.restoreHistoryCheckpoint(saved.checkpoint)) {
      receipts = new Map(saved.receipts.map((item) => [item.entryId, item]));
      register();
    } else if (saved !== null) {
      // A rejected checkpoint is evidence to retain, not a pending request to
      // replay. Reserve navigation until the explicit recovery choice.
      const entry = session.beginExternalAction({ label: "Gespeicherten Verlauf prüfen", versionBefore: session.version, versionAfter: session.version });
      checkpointRecovery = { externalHistoryId: entry.id };
      state = { status: "unresolved", message: "Der gespeicherte Verlauf passt nicht zum aktuellen Editorstand oder ist beschädigt. Bitte die Prüfung ausdrücklich beenden, um den aktuellen Stand zu übernehmen." };
    }
  }
  const unsubscribe = session.subscribe(sync);
  persist();
  notify();
  return {
    pending: () => operation ?? checkpointRecovery,
    recoveryOnly: () => checkpointRecovery !== null,
    state: () => ({ ...state }),
    navigation,
    hasEntries: () => receipts.size > 0,
    async start(input) {
      if (!active() || operation || checkpointRecovery || hasPendingLegacyRename()) return false;
      input = globalThis.structuredClone(input);
      const checkpoint = session.historyCheckpoint();
      if (!checkpoint) { state = { status: "rejected", message: "Bitte zuerst offene Editoränderungen speichern oder ihren Konflikt klären." }; notify(); return false; }
      originalDocument = session.document;
      originalVersions = checkpoint.versions;
      const entry = session.beginExternalAction({ label: `Variable ${input.group}.${input.name} ${input.action === "delete" ? "gelöscht" : "wiederhergestellt"}`, versionBefore: session.version, versionAfter: session.version });
      operation = { ...input, format: 2, mode: "first", entry: globalThis.structuredClone(entry), externalHistoryId: entry.id,
        record: { kind: input.action, group: input.group, name: input.name, receiptId: input.body.receiptId, entryId: entry.id }, before: { ...envelope(checkpoint), theme: globalThis.structuredClone(getTheme()) } };
      try { rememberPending(); }
      catch {
        session.failExternalAction(entry.id); operation = null;
        state = { status: "rejected", message: "Der Vorgang kann nicht sicher vorgemerkt werden. Bitte Browser-Speicher freigeben." }; notify(); return false;
      }
      return run();
    },
    async retry() {
      if (!operation || state.status === "running") return false;
      return operation.mode === "navigation" && !reloaded ? session.retryExternalHistory() : run();
    },
    abandon(replacement) {
      if (state.status === "running") return false;
      // Lease resolution emits synchronously. Do not let sync() publish a
      // rejected candidate or recreate the checkpoint being abandoned.
      syncing = true;
      try {
        const pendingId = operation?.externalHistoryId ?? checkpointRecovery?.externalHistoryId ?? replacement?.pendingId;
        const clear = () => {
          storage.removeItem(key);
          storage.removeItem(pendingKey);
          replacement?.beforeCommit();
          operation = null; checkpointRecovery = null; candidate = null; receipts.clear(); reloaded = false;
          state = { status: "idle", message: "" };
          persisted = "";
          pendingCleanup = false;
        };
        if (replacement) {
          if (!active() || !pendingId || !session.resetExternalHistory(pendingId, replacement.original, replacement.base, replacement.document, replacement.next, clear)) return false;
        } else {
          clear();
          if (pendingId) session.failExternalAction(pendingId);
        }
      } finally { syncing = false; }
      if (replacement) persist();
      return true;
    },
    dispose() { disposed = true; unsubscribe(); },
  };
}
