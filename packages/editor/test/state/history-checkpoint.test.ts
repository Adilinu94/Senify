import { describe, expect, it } from "vitest";
import { HistoryStack } from "@senify/editor";
import { createEditorSession, EditorStore, type DocumentPatch, type EditorDocument } from "@senify/editor/state";
import { baseStore, classRule } from "./fixtures.ts";

function session(document = baseStore().document, versions = { page: 1, theme: 1, registry: 1 }) {
  let version = versions.page;
  return createEditorSession({
    document, pageId: "page1", siteId: "site1", initialVersion: version,
    themeVersion: versions.theme, styleRegistryVersion: versions.registry,
    author: { kind: "human", id: "tester", label: "Tester" }, debounceMs: 100000,
    request: async () => ({ status: 200, body: { newDraftVersion: ++version } }),
  });
}

describe("geprüfte History-Checkpoints", () => {
  it.each(["session", "store", "pipeline"])("zeigt %s-Observern die ausdrückliche Recovery atomar und erhält deren neue Eingaben", async (observer) => {
    const target = session();
    try {
      const original = target.document;
      const base = target.pipeline.externalVersions();
      const replacement = structuredClone(original);
      replacement.nodes.head000001!.props.text = "Serverstand";
      const pending = target.beginExternalAction({ label: "Prüfen", versionBefore: 1, versionAfter: 1 });
      const next = { pageVersion: 2, themeVersion: 1, registryVersion: 2 };
      const seen: unknown[] = [];
      let cleaned = false;
      const observe = () => {
        if (target.pendingExternalId !== null || seen.length > 0) return;
        seen.push([target.pipeline.externalVersions(), target.document.nodes.head000001?.props.text, target.store.history.size, cleaned]);
        target.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neue Eingabe" });
      };
      if (observer === "session") target.subscribe(observe);
      else target[observer as "store" | "pipeline"].subscribe(observe);
      expect(target.resetExternalHistory(pending.id, original, base, replacement, next, () => { cleaned = true; })).toBe(true);
      expect(seen).toEqual([[next, "Serverstand", 0, true]]);
      expect(target.document.nodes.head000001?.props.text).toBe("Neue Eingabe");
      expect(target.store.history.size).toBe(1);
      expect(target.saveState().pending).toBe(1);
      await target.flush();
      expect(target.historyCheckpoint()?.versions).toEqual(next);
      expect(target.undo()).toBe(true);
      expect(target.document.nodes.head000001?.props.text).toBe("Serverstand");
    } finally { target.dispose(); }
  });

  it.each(["lease", "document", "base", "pending", "invalid", "disposed", "storage"])("erhält Recovery-Evidenz und Zustand bei abgewiesenem Reset (%s)", (fault) => {
    const target = session();
    try {
      const original = target.document;
      const base = target.pipeline.externalVersions();
      const replacement = structuredClone(original);
      const pending = target.beginExternalAction({ label: "Prüfen", versionBefore: 1, versionAfter: 1 });
      if (fault === "pending") target.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Offen" });
      if (fault === "invalid") delete replacement.nodes[replacement.rootNodeId];
      if (fault === "disposed") target.dispose();
      const document = target.document;
      const history = structuredClone(target.store.history.entries());
      const cursor = target.store.history.applied().length;
      const save = target.saveState();
      let cleaned = false;
      const reset = () => target.resetExternalHistory(fault === "lease" ? "fremd" : pending.id, fault === "document" ? structuredClone(original) : original,
        fault === "base" ? { ...base, registryVersion: 9 } : base, replacement, { pageVersion: 2, themeVersion: 2, registryVersion: 2 }, () => {
          if (fault === "storage") throw new Error("Storage gesperrt");
          cleaned = true;
        });
      if (fault === "storage") expect(reset).toThrow("Storage gesperrt");
      else expect(reset()).toBe(false);
      expect(cleaned).toBe(false);
      expect(target.document).toBe(document);
      expect(target.store.history.entries()).toEqual(history);
      expect(target.store.history.applied()).toHaveLength(cursor);
      expect(target.store.history.future()).toHaveLength(history.length - cursor);
      expect(target.saveState()).toEqual(save);
      expect(target.pipeline.externalVersions()).toEqual(base);
      expect(target.pendingExternalId).toBe(pending.id);
    } finally { target.dispose(); }
  });

  it("erhält globale Klassenlöschbelege beim Reload vor der ersten Undo-Projektion", async () => {
    const document = baseStore().document;
    document.styleRules.push(classRule("rule000001", "accent", { color: "red" }));
    document.nodes.head000001!.classes = ["accent"];
    const requests: { path: string; body?: unknown }[] = [];
    const create = (doc: EditorDocument, pageVersion: number, registryVersion: number) => createEditorSession({
      document: doc, pageId: "page1", siteId: "site1", initialVersion: pageVersion,
      themeVersion: 1, styleRegistryVersion: registryVersion,
      author: { kind: "human", id: "tester", label: "Tester" }, debounceMs: 100000,
      request: async (request) => {
        requests.push(request);
        return { status: 200, body: { version: ++registryVersion, pageDraftVersion: ++pageVersion, receiptId: (request.body as { receiptId: string }).receiptId } };
      },
    });
    const source = create(document, 1, 1);
    let target: ReturnType<typeof create> | undefined;
    try {
      source.apply({ op: "deleteStyleRule", id: "rule000001" });
      await source.flush();
      const receiptId = (requests[0]!.body as { receiptId: string }).receiptId;
      const checkpoint = JSON.parse(JSON.stringify(source.historyCheckpoint()));
      target = create(structuredClone(source.document), 2, 2);
      target.subscribe(() => {
        if (target!.store.history.size > 0 && target!.canUndo) target!.undo();
      });
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(true);
      await target.flush();
      expect(target.saveState()).toMatchObject({ status: "saved", pending: 0 });
      expect(requests[1]).toMatchObject({ path: "/api/sites/site1/style-rules/rule000001/restore-globally", body: { receiptId } });
      expect(target.document.nodes.head000001?.classes).toEqual(["accent"]);
    } finally { source.dispose(); target?.dispose(); }
  });

  it("bestätigt eine dokumenterhaltende Aktion atomar, ohne Save oder Zwischenprojektion", () => {
    const target = session();
    try {
      const document = target.document;
      const base = target.pipeline.externalVersions();
      const entry = target.beginExternalAction({ label: "Token löschen", versionBefore: 1, versionAfter: 1 });
      const seen: unknown[] = [];
      target.subscribe(() => seen.push([target.pipeline.externalVersions(), target.pendingExternalId, target.store.history.top()?.status]));
      expect(target.confirmExternalAction(entry.id, document, base, { ...base, pageVersion: 2, themeVersion: 2 })).toBe(true);
      expect(seen).toEqual([[{ pageVersion: 2, themeVersion: 2, registryVersion: 1 }, null, "committed"]]);
      expect(target.document).toBe(document);
      expect(target.saveState().pending).toBe(0);
    } finally { target.dispose(); }
  });

  it("bestätigt einen Dokumentwechsel atomar mit Eintrag und allen Versionen", () => {
    const target = session();
    try {
      const original = target.document;
      const base = target.pipeline.externalVersions();
      const entry = target.beginExternalAction({ label: "Variable umbenannt", versionBefore: 1, versionAfter: 1 });
      const replacement = structuredClone(original);
      replacement.nodes.head000001!.props.text = "color.marke";
      const next = { pageVersion: 2, themeVersion: 2, registryVersion: 2 };
      const seen: unknown[] = [];
      target.subscribe(() => seen.push([target.document === replacement, target.pipeline.externalVersions(), target.pendingExternalId, target.store.history.top()?.status]));
      expect(target.confirmExternalReplacement(entry.id, original, base, next, replacement)).toBe(true);
      expect(seen).toEqual([[true, next, null, "committed"]]);
      expect(target.document.nodes.head000001?.props.text).toBe("color.marke");
      expect(target.saveState().pending).toBe(0);
    } finally { target.dispose(); }
  });

  it("verweigert einen Dokumentwechsel ohne passende Basis oder Versionssprung", () => {
    const target = session();
    try {
      const original = target.document;
      const base = target.pipeline.externalVersions();
      const entry = target.beginExternalAction({ label: "Variable umbenannt", versionBefore: 1, versionAfter: 1 });
      const replacement = structuredClone(original);
      expect(target.confirmExternalReplacement(entry.id, replacement, base, { pageVersion: 2, themeVersion: 2, registryVersion: 2 }, replacement)).toBe(false);
      expect(target.confirmExternalReplacement(entry.id, original, base, { pageVersion: 2, themeVersion: 2, registryVersion: 4 }, replacement)).toBe(false);
      expect(target.confirmExternalReplacement(entry.id, original, base, { pageVersion: 3, themeVersion: 3, registryVersion: 2 }, replacement)).toBe(false);
      expect(target.pendingExternalId).toBe(entry.id);
    } finally { target.dispose(); }
  });

  it.each(["missing", "null", "malformed", "duplicate", "foreign", "invalid-id"])("verweigert unvollständige Klassenlöschbelege ohne History- oder Versionswrite (%s)", (fault) => {
    const source = baseStore();
    source.document.styleRules.push(classRule("rule000001", "accent"));
    source.history.clear();
    source.apply({ op: "deleteStyleRule", id: "rule000001" });
    const target = session(source.document);
    try {
      const checkpoint = JSON.parse(JSON.stringify(target.historyCheckpoint()));
      checkpoint.history = source.history.snapshot();
      checkpoint.classDeletionReceipts = [{ entryId: source.history.top()!.id, receiptId: "gesicherter-beleg" }];
      if (fault === "missing") delete checkpoint.classDeletionReceipts;
      if (fault === "null") checkpoint.classDeletionReceipts = null;
      if (fault === "malformed") checkpoint.classDeletionReceipts = {};
      if (fault === "duplicate") checkpoint.classDeletionReceipts.push(checkpoint.classDeletionReceipts[0]);
      if (fault === "foreign") checkpoint.classDeletionReceipts[0].entryId = "anderer-eintrag";
      if (fault === "invalid-id") checkpoint.classDeletionReceipts[0].receiptId = "../unsicher";
      const before = target.document;
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(false);
      expect(target.store.history.size).toBe(0);
      expect(target.document).toBe(before);
      const pending = target.beginExternalAction({ label: "Prüfen", versionBefore: 1, versionAfter: 1 });
      const versions = target.pipeline.externalVersions();
      checkpoint.versions = { ...versions, pageVersion: 2, themeVersion: 2 };
      expect(target.confirmExternalHistoryRecovery(pending.id, checkpoint, versions)).toBe(false);
      expect(target.pendingExternalId).toBe(pending.id);
      expect(target.pipeline.externalVersions()).toEqual(versions);
      expect(target.store.history.size).toBe(0);
    } finally { target.dispose(); }
  });

  it("verweigert die Initialbestätigung einer Navigationslease vor jedem Versionswrite", async () => {
    const target = session();
    let release!: () => void;
    try {
      const entry = target.beginExternalAction({ label: "Token löschen", versionBefore: 1, versionAfter: 1 });
      target.commitExternalAction(entry.id);
      target.registerExternalHistory(entry.id, async () => {
        await new Promise<void>((resolve) => { release = resolve; });
        return { status: "unknown", message: "Noch unklar" };
      });
      const navigating = target.undoAsync();
      const base = target.pipeline.externalVersions();
      expect(target.confirmExternalAction(target.pendingExternalId!, target.document, base, { ...base, pageVersion: 2, themeVersion: 2 })).toBe(false);
      expect(target.pipeline.externalVersions()).toEqual(base);
      release();
      expect(await navigating).toBe(false);
      expect(target.pendingExternalId).not.toBeNull();
    } finally { release?.(); target.dispose(); }
  });

  it.each(["first", "recovery"].flatMap((kind) => ["pipeline", "store"].map((observer) => ({ kind, observer }))))("zeigt direkten $observer-Beobachtern $kind erst mit bestätigter History", ({ kind, observer }) => {
    const target = session();
    try {
      const document = target.document;
      const checkpoint = target.historyCheckpoint()!;
      const base = target.pipeline.externalVersions();
      const next = { ...base, pageVersion: 2, themeVersion: 2 };
      const pending = target.beginExternalAction({ label: "Token löschen", versionBefore: 1, versionAfter: 1 });
      if (kind === "recovery") {
        checkpoint.versions = next;
        checkpoint.history.entries = [{ ...pending, status: "committed", versionAfter: 2 }];
        checkpoint.history.cursor = 1;
      }
      const seen: unknown[] = [];
      const observe = () => {
        if (target.version !== 2 || seen.length > 0) return;
        seen.push([target.pendingExternalId, target.store.history.top()?.status]);
        target.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Beobachter-Eingabe" });
      };
      if (observer === "pipeline") target.pipeline.subscribe(observe);
      else target.store.subscribe(observe);
      const confirmed = kind === "first" ? target.confirmExternalAction(pending.id, document, base, next)
        : target.confirmExternalHistoryRecovery(pending.id, checkpoint, base);
      expect(confirmed).toBe(true);
      expect(seen).toEqual([[null, "committed"]]);
      expect(target.document.nodes.head000001?.props.text).toBe("Beobachter-Eingabe");
      expect(target.store.history.applied()).toHaveLength(2);
      expect(target.saveState().pending).toBe(1);
    } finally { target.dispose(); }
  });

  it.each(["document", "base", "increment", "registry", "disposed"])("verweigert eine unpassende Initialbestätigung (%s)", (fault) => {
    const target = session();
    try {
      const document = target.document;
      const base = target.pipeline.externalVersions();
      const next = { ...base, pageVersion: 2, themeVersion: 2 };
      const entry = target.beginExternalAction({ label: "Token löschen", versionBefore: 1, versionAfter: 1 });
      if (fault === "document") target.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neu" });
      if (fault === "base") base.pageVersion = 5;
      if (fault === "increment") next.themeVersion = 3;
      if (fault === "registry") next.registryVersion = 2;
      if (fault === "disposed") target.dispose();
      expect(target.confirmExternalAction(entry.id, document, base, next)).toBe(false);
      expect(target.version).toBe(1);
      expect(target.pendingExternalId).toBe(entry.id);
    } finally { target.dispose(); }
  });

  it.each([false, true])("bindet bestätigte Reload-History atomar an einen %s bereits geladenen Folgestand", async (alreadyLoaded) => {
    const source = session();
    let target: ReturnType<typeof session> | undefined;
    try {
      source.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Vor Token" });
      await source.flush();
      const entry = source.beginExternalAction({ label: "Token löschen", versionBefore: 2, versionAfter: 3 });
      source.commitExternalAction(entry.id);
      const checkpoint = source.historyCheckpoint()!;
      checkpoint.versions = { pageVersion: 3, themeVersion: 2, registryVersion: 1 };
      target = session(structuredClone(source.document), { page: alreadyLoaded ? 3 : 2, theme: alreadyLoaded ? 2 : 1, registry: 1 });
      const base = target.pipeline.externalVersions();
      const pending = target.beginExternalAction({ label: "Prüfen", versionBefore: target.version, versionAfter: target.version });
      const seen: unknown[] = [];
      target.subscribe(() => seen.push([target!.version, target!.pendingExternalId, target!.store.history.size]));
      expect(target.confirmExternalHistoryRecovery(pending.id, checkpoint, base)).toBe(true);
      expect(seen).toEqual([[3, null, 2]]);
      expect(target.store.history.snapshot()).toEqual(checkpoint.history);
      expect(target.saveState().pending).toBe(0);
    } finally { source.dispose(); target?.dispose(); }
  });

  it.each(["patch", "context", "document", "versions", "occupied", "disposed"])("löst Pending bei ungültiger Reload-Recovery nicht auf (%s)", async (fault) => {
    const source = session();
    let target: ReturnType<typeof session> | undefined;
    try {
      source.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Gespeichert" });
      await source.flush();
      const checkpoint = source.historyCheckpoint()!;
      checkpoint.versions = { pageVersion: 3, themeVersion: 2, registryVersion: 1 };
      target = session(structuredClone(source.document), { page: 2, theme: 1, registry: 1 });
      const base = target.pipeline.externalVersions();
      const pending = target.beginExternalAction({ label: "Prüfen", versionBefore: 2, versionAfter: 2 });
      if (fault === "patch") checkpoint.history.entries[0]!.undoPatch[0] = { patch: "deleteRaw", id: "fehlt" };
      if (fault === "context") checkpoint.siteId = "fremde-site";
      if (fault === "document" || fault === "occupied") {
        target.apply({ op: "setNodeProp", id: "head000001", key: "text", value: fault === "occupied" ? "Gespeichert" : "Neue Eingabe" });
        if (fault === "occupied") target.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 30 });
      }
      if (fault === "versions") checkpoint.versions.themeVersion = 7;
      if (fault === "disposed") target.dispose();
      const document = target.document;
      const entries = target.store.history.entries();
      expect(target.confirmExternalHistoryRecovery(pending.id, checkpoint, base)).toBe(false);
      expect(target.document).toBe(document);
      expect(target.store.history.entries()).toEqual(entries);
      expect(target.version).toBe(2);
      expect(target.pendingExternalId).toBe(pending.id);
    } finally { source.dispose(); target?.dispose(); }
  });

  it("übernimmt eine dokumentändernde Reload-Recovery nur mit höchstens einem Registry-Sprung", async () => {
    const source = session();
    let target: ReturnType<typeof session> | undefined;
    let other: ReturnType<typeof session> | undefined;
    try {
      source.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Vorher" });
      await source.flush();
      const checkpoint = source.historyCheckpoint()!;
      const replacement = structuredClone(source.document);
      checkpoint.document = replacement;
      checkpoint.versions = { pageVersion: 2, themeVersion: 2, registryVersion: 2 };
      target = session(structuredClone(replacement), { page: 1, theme: 1, registry: 1 });
      const base = target.pipeline.externalVersions();
      const pending = target.beginExternalAction({ label: "Umbenannt", versionBefore: 1, versionAfter: 1 });
      const seen: unknown[] = [];
      target.subscribe(() => seen.push([target!.document, target!.version, target!.pendingExternalId, target!.store.history.size]));
      expect(target.confirmExternalHistoryReplacement(pending.id, checkpoint, base, replacement)).toBe(true);
      expect(seen).toEqual([[replacement, 2, null, checkpoint.history.entries.length]]);
      expect(target.store.history.snapshot()).toEqual(checkpoint.history);
      expect(target.pipeline.externalVersions()).toEqual(checkpoint.versions);

      other = session(structuredClone(replacement), { page: 1, theme: 1, registry: 1 });
      const otherBase = other.pipeline.externalVersions();
      const otherPending = other.beginExternalAction({ label: "Umbenannt", versionBefore: 1, versionAfter: 1 });
      const jump = structuredClone(checkpoint);
      jump.versions.registryVersion = 3;
      expect(other.confirmExternalHistoryReplacement(otherPending.id, jump, otherBase, replacement)).toBe(false);
      expect(other.pendingExternalId).toBe(otherPending.id);
      expect(other.document).toEqual(replacement);
      expect(other.store.history.size).toBe(0);
    } finally { source.dispose(); target?.dispose(); other?.dispose(); }
  });

  it("erhält lokale und externe Schritte samt Cursor, ohne einen Runner zu serialisieren", async () => {
    const source = session();
    let target: ReturnType<typeof session> | undefined;
    try {
      source.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Vor dem Token" });
      await source.flush();
      const entry = source.beginExternalAction({ label: "Token löschen", versionBefore: 2, versionAfter: 3 });
      source.commitExternalAction(entry.id);
      source.registerExternalHistory(entry.id, async ({ versions }) => ({ status: "committed", pageVersion: versions.pageVersion + 1, themeVersion: versions.themeVersion! + 1 }));
      source.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Nach dem Token" });
      await source.flush();
      source.undo();
      await source.flush();
      const checkpoint = JSON.parse(JSON.stringify(source.historyCheckpoint()));
      target = session(structuredClone(source.document), { page: source.version, theme: 1, registry: 1 });
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(true);
      expect(target.store.history.entries()).toEqual(source.store.history.entries());
      expect(target.store.history.applied()).toHaveLength(2);
      expect(target.store.history.future()).toHaveLength(1);
      expect(target.canUndoAsync).toBe(false);
      expect(target.redo()).toBe(true);
      expect(target.document.nodes["head000001"]?.props["text"]).toBe("Nach dem Token");
      expect(target.undo()).toBe(true);
    } finally { source.dispose(); target?.dispose(); }
  });

  it("exportiert keine offenen Writes oder unklaren Vorgänge", async () => {
    const source = session();
    try {
      source.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Nicht gespeichert" });
      expect(source.historyCheckpoint()).toBeNull();
      await source.flush();
      expect(source.historyCheckpoint()).not.toBeNull();
      source.beginExternalAction({ label: "Unklar", versionBefore: 2, versionAfter: 3 });
      expect(source.historyCheckpoint()).toBeNull();
    } finally { source.dispose(); }
  });

  it.each(["pageId", "siteId", "pageVersion", "themeVersion", "registryVersion", "document"])(
    "verweigert einen abweichenden Checkpoint (%s) ohne Änderungen", async (field) => {
      const source = session();
      const target = session();
      try {
        const checkpoint = JSON.parse(JSON.stringify(source.historyCheckpoint()));
        if (field.endsWith("Version")) checkpoint.versions[field] += 1;
        else if (field === "document") checkpoint.document.nodes.head000001.props.text = "Fremder Stand";
        else checkpoint[field] = "anderer Kontext";
        const before = target.document;
        expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(false);
        expect(target.document).toBe(before);
        expect(target.store.history.entries()).toEqual([]);
      } finally { source.dispose(); target.dispose(); }
    },
  );

  it("verweigert Import in eine bearbeitete oder durch Unknown gesperrte Session", async () => {
    const source = session();
    const target = session();
    try {
      const checkpoint = source.historyCheckpoint();
      target.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neue Eingabe" });
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(false);
      await target.flush();
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(false);
      const entries = target.store.history.entries();
      target.beginExternalAction({ label: "Unklar", versionBefore: 2, versionAfter: 3 });
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(false);
      expect(target.store.history.entries()).toEqual(entries);
      expect(target.pendingExternalId).not.toBeNull();
      expect(target.document.nodes["head000001"]?.props["text"]).toBe("Neue Eingabe");
    } finally { source.dispose(); target.dispose(); }
  });

  it("ignoriert nur Rule-updatedAt und Objektschlüsselreihenfolge, nicht Registry-Inhalte", () => {
    const document = baseStore().document;
    document.styleRules.push(classRule("rule000001", "accent", { color: "red" }, { updatedAt: "vorher" }));
    const source = session(document);
    const reordered: EditorDocument = { styleRules: [{ ...document.styleRules[0]!, updatedAt: "nachher" }], nodes: document.nodes, rootNodeId: document.rootNodeId, version: 2 };
    const target = session(reordered);
    const changed = session({ ...reordered, styleRules: [{ ...reordered.styleRules[0]!, styles: { color: "blue" } }] });
    try {
      const checkpoint = source.historyCheckpoint();
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(true);
      expect(changed.restoreHistoryCheckpoint(checkpoint)).toBe(false);
    } finally { source.dispose(); target.dispose(); changed.dispose(); }
  });

  it.each(["unknown-patch", "dangling-node", "wrong-inverse", "duplicate-id", "cursor", "pending", "external-patches", "prototype", "malformed-patch"])(
    "verweigert kaputte History vollständig (%s)", async (fault) => {
      const source = session();
      let target: ReturnType<typeof session> | undefined;
      try {
        source.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Gespeichert" });
        await source.flush();
        const checkpoint = JSON.parse(JSON.stringify(source.historyCheckpoint()));
        const entry = checkpoint.history.entries[0];
        if (fault === "unknown-patch") entry.undoPatch[0].patch = "unbekannt";
        if (fault === "dangling-node") entry.undoPatch[0].id = "fehlender Knoten";
        if (fault === "wrong-inverse") entry.mutations[0].props.text = "Falscher Folgestand";
        if (fault === "duplicate-id") checkpoint.history.entries.push(structuredClone(entry));
        if (fault === "cursor") checkpoint.history.cursor = 10;
        if (fault === "pending") entry.status = "pending";
        if (fault === "external-patches") { entry.external = true; entry.op = "external"; }
        if (fault === "prototype") entry.undoPatch[0].props = JSON.parse('{"__proto__":{"polluted":true}}');
        if (fault === "malformed-patch") { entry.undoPatch[0].props = 1; entry.mutations[0].props = 1; }
        target = session(structuredClone(source.document), { page: source.version, theme: 1, registry: 1 });
        const before = target.document;
        expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(false);
        expect(target.document).toBe(before);
        expect(target.store.history.size).toBe(0);
        expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
      } finally { source.dispose(); target?.dispose(); }
    },
  );

  it("verweigert geerbte Patch-Ziele vor jedem Replay", async () => {
    const source = session();
    let target: ReturnType<typeof session> | undefined;
    const prototype = Object.prototype as { hidden?: boolean };
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "hidden");
    try {
      source.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Gespeichert" });
      await source.flush();
      const checkpoint = JSON.parse(JSON.stringify(source.historyCheckpoint()));
      checkpoint.history.entries[0].undoPatch = [{ patch: "setNodeFields", id: "__proto__", fields: { hidden: true } }];
      checkpoint.history.entries[0].mutations = [{ patch: "setNodeFields", id: "__proto__", fields: { hidden: null } }];
      target = session(structuredClone(source.document), { page: source.version, theme: 1, registry: 1 });
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(false);
      expect(Object.getOwnPropertyDescriptor(prototype, "hidden")).toEqual(descriptor);
      expect(target.store.history.size).toBe(0);
    } finally {
      if (descriptor) Object.defineProperty(prototype, "hidden", descriptor);
      else delete prototype.hidden;
      source.dispose(); target?.dispose();
    }
  });

  it.each(["hidden", "locked", "variant", "motion", "states", "inherited-child"])(
    "verweigert ungültige eingefügte Node-Daten (%s) ohne Teilimport", (fault) => {
      const target = session();
      try {
        const checkpoint = JSON.parse(JSON.stringify(target.historyCheckpoint()));
        const node: Record<string, unknown> = { id: "new0000001", primitive: "section", props: {} };
        if (fault === "hidden" || fault === "locked") node[fault] = "ja";
        if (fault === "variant") node.variant = 5;
        if (fault === "motion") node.motion = { preset: "scroll-reveal", enabled: "ja" };
        if (fault === "states") node.states = { hover: 5 };
        if (fault === "inherited-child") node.children = ["toString"];
        checkpoint.history.entries = [{ id: "entry1", label: "Einfügen", at: 1, op: "insertNode", batchId: null,
          versionBefore: 1, versionAfter: 2, status: "committed",
          mutations: [{ patch: "insertNodes", parent: { nodeId: target.document.rootNodeId }, index: 0, nodes: [node] }],
          undoPatch: [{ patch: "deleteNode", id: node.id }],
        }];
        const before = target.document;
        expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(false);
        expect(target.document).toBe(before);
        expect(target.store.history.size).toBe(0);
      } finally { target.dispose(); }
    },
  );

  it.each(["deleteStyleRule", "reorderStyleRule"])("verweigert auch No-op-Patches ohne Ziel (%s)", (patch) => {
    const target = session();
    try {
      const checkpoint = JSON.parse(JSON.stringify(target.historyCheckpoint()));
      checkpoint.history.entries = [{ id: "entry1", label: "Defekt", at: 1, op: patch, batchId: null,
        versionBefore: 1, versionAfter: 2, status: "committed",
        mutations: [{ patch, index: 0 }], undoPatch: [{ patch, index: 0 }],
      }];
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(false);
      expect(target.store.history.size).toBe(0);
    } finally { target.dispose(); }
  });

  it("prüft sämtliche Patch-Arten über echte Store-Schritte und beide Cursor-Richtungen", () => {
    const source = baseStore();
    source.history.clear();
    const root = source.document.rootNodeId;
    source.apply({ op: "upsertStyleRule", rule: classRule("rule000001", "accent", { color: "red" }) });
    source.apply({ op: "upsertStyleRule", rule: classRule("rule000002", "second", { color: "blue" }) });
    source.apply({ op: "setNodeMeta", id: "head000001", meta: { hidden: true, locked: true, classes: ["accent"] } });
    source.apply({ op: "setMotion", id: "head000001", spec: { preset: "scroll-reveal" } });
    source.apply({ op: "setNodeHiddenDevices", id: "head000001", devices: ["mobile"], shownDevices: ["tablet"] });
    source.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value: 32, device: "mobile" });
    source.apply({ op: "renameStyleRule", id: "rule000001", name: "renamed" });
    source.apply({ op: "reorderStyleRule", id: "rule000002", index: 0 });
    source.apply({ op: "moveNode", id: "btn0000001", target: { nodeId: "sec0000001" }, index: 0 });
    source.apply({ op: "insertNode", parent: { nodeId: root }, node: { id: "new0000001", primitive: "heading", props: { text: "Neu" } } });
    source.apply({ op: "deleteNode", id: "sec0000001" });
    source.apply({ op: "deleteStyleRule", id: "rule000001" });
    const kinds = source.history.entries().flatMap((entry) => [...entry.mutations, ...entry.undoPatch]) as unknown as DocumentPatch[];
    expect(new Set(kinds.map((patch) => patch.patch)).size).toBe(10);
    for (let cursor = source.history.size; cursor >= 0; cursor -= 1) {
      const target = new EditorStore({ document: structuredClone(source.document) });
      const checkpoint = JSON.parse(JSON.stringify(source.history.snapshot()));
      expect(() => target.restoreHistory(checkpoint)).not.toThrow();
      expect(target.history.applied()).toHaveLength(cursor);
      const before = structuredClone(target.document);
      if (cursor > 0) { expect(target.undo()).toBe(true); expect(target.redo()).toBe(true); }
      if (cursor < source.history.size) { expect(target.redo()).toBe(true); expect(target.undo()).toBe(true); }
      expect(target.document).toEqual(before);
      if (cursor > 0) source.undo();
    }
  });

  it.each([
    { patch: "setNodeFields", id: "head000001", fields: { hidden: "ja" } },
    { patch: "setNodeFields", id: "head000001", fields: { classes: 1 } },
    { patch: "setNodeFields", id: "head000001", fields: { hiddenDevices: ["desktop"] } },
    { patch: "setNodeMotion", id: "head000001", spec: { preset: "scroll-reveal", intensity: "stark" } },
    { patch: "moveNode", id: "head000001", target: { nodeId: "sec0000001" }, index: -1 },
    { patch: "upsertStyleRule", rule: { id: "rule000001", kind: "class", name: "bad name", styles: {} } },
    { patch: "renameStyleRule", id: "rule000001", name: "bad name" },
    { patch: "insertNodes", parent: { nodeId: "sec0000001" }, index: 0, nodes: [
      { id: "head000001", primitive: "heading", props: { text: "Ersetzt" } },
    ] },
  ])("verweigert defekte Patch-Struktur vor Änderungen ($patch)", (patch) => {
    const target = session();
    try {
      const checkpoint = JSON.parse(JSON.stringify(target.historyCheckpoint()));
      checkpoint.history.entries = [{ id: "entry1", label: "Defekt", at: 1, op: "setNodeProp", batchId: null,
        versionBefore: 1, versionAfter: 2, status: "committed", mutations: [patch], undoPatch: [patch],
      }];
      const before = target.document;
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(false);
      expect(target.document).toBe(before);
      expect(target.store.history.size).toBe(0);
    } finally { target.dispose(); }
  });

  it("exportiert und importiert unabhängige Kopien ohne Save oder Dokument-Write", async () => {
    const source = session();
    let target: ReturnType<typeof session> | undefined;
    try {
      source.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Gespeichert" });
      await source.flush();
      const checkpoint = source.historyCheckpoint()!;
      target = session(structuredClone(source.document), { page: source.version, theme: 1, registry: 1 });
      const actions: string[] = [];
      target.store.setActionListener((event) => actions.push(event.type));
      const before = target.document;
      expect(target.restoreHistoryCheckpoint(checkpoint)).toBe(true);
      checkpoint.history.entries[0]!.label = "Fremde Änderung";
      checkpoint.document.nodes["head000001"]!.props["text"] = "Fremdes Dokument";
      expect(source.store.history.top()?.label).not.toBe("Fremde Änderung");
      expect(target.store.history.top()?.label).not.toBe("Fremde Änderung");
      expect(source.document.nodes["head000001"]?.props["text"]).toBe("Gespeichert");
      expect(target.document).toBe(before);
      expect(target.saveState()).toMatchObject({ pending: 0, version: source.version });
      expect(actions).toEqual([]);
    } finally { source.dispose(); target?.dispose(); }
  });

  it("trennt die neue Eingabegruppe und hält IDs auch bei erneut gestarteter ID-Factory eindeutig", () => {
    const source = new HistoryStack({ idFactory: () => "gleiche-id" });
    source.record({ label: "Alt", op: "inline-text", mutations: [], undoPatch: [], batchId: null, versionBefore: 1, versionAfter: 2, coalesceKey: "text" });
    const checkpoint = source.snapshot();
    const restored = new HistoryStack({ idFactory: () => "gleiche-id" });
    restored.restore(checkpoint);
    checkpoint.entries[0]!.label = "Außen geändert";
    const entry = restored.record({ label: "Neu", op: "inline-text", mutations: [], undoPatch: [], batchId: null, versionBefore: 2, versionAfter: 3, coalesceKey: "text" });
    expect(restored.entries().map((item) => item.label)).toEqual(["Alt", "Neu"]);
    expect(entry.id).not.toBe(restored.entries()[0]?.id);
  });
});
