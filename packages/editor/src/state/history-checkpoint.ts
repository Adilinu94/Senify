import { HistoryStack, isHistoryData, type HistoryEntry, type HistorySnapshot } from "../history.ts";
import { parseEditorMutation } from "@senify/engine/browser";
import { STATE_ORDER, type StyleRule } from "@senify/widget-engine";
import { validateDocument } from "./consistency.ts";
import { cloneDocument, type EditorDocument } from "./document.ts";
import { applyDocumentPatch, applyDocumentPatches, type DocumentPatch } from "./patches.ts";
import type { ExternalVersions } from "./persist.ts";

export type ClassDeletionHistoryReceipt = { entryId: string; receiptId: string };

export type SessionHistoryCheckpoint = {
  format: 1;
  pageId: string;
  siteId: string;
  versions: ExternalVersions;
  document: EditorDocument;
  history: HistorySnapshot;
  classDeletionReceipts?: ClassDeletionHistoryReceipt[];
};

export function globalDeletionRule(entry: HistoryEntry): StyleRule | undefined {
  const patch = entry.op === "deleteStyleRule" ? (entry.undoPatch as unknown as DocumentPatch[]).find((item) => item.patch === "upsertStyleRule") : undefined;
  return patch?.patch === "upsertStyleRule" && patch.rule.kind === "class" && patch.rule.scope === undefined ? patch.rule : undefined;
}

// A locally replayable global deletion still needs its server-side receipt.
// Reject older incomplete checkpoints rather than exposing unsaveable Undo.
export function checkedClassDeletionReceipts(input: unknown, history: HistorySnapshot): Map<string, string> {
  const entries = history.entries.filter((entry) => globalDeletionRule(entry) !== undefined);
  const receipts = input ?? [];
  if (!Array.isArray(receipts) || receipts.length !== entries.length) throw new Error("Unvollständige Klassenlöschbelege im History-Checkpoint");
  const result = new Map<string, string>();
  for (const receipt of receipts) {
    if (!record(receipt) || typeof receipt["entryId"] !== "string" || typeof receipt["receiptId"] !== "string" ||
        !/^[a-zA-Z0-9_-]+$/.test(receipt["receiptId"]) || result.has(receipt["entryId"]) || !entries.some((entry) => entry.id === receipt["entryId"])) {
      throw new Error("Ungültiger Klassenlöschbeleg im History-Checkpoint");
    }
    result.set(receipt["entryId"], receipt["receiptId"]);
  }
  return result;
}

function sortedData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedData);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortedData(item)]));
}

// Rule timestamps are server bookkeeping; every other field and array order
// remains part of the content identity. Version equality is checked separately.
export function historyDocumentsEqual(left: EditorDocument, right: EditorDocument): boolean {
  const content = (document: EditorDocument): unknown => ({
    ...document,
    styleRules: document.styleRules.map(({ updatedAt: _updatedAt, ...rule }) => rule),
  });
  return JSON.stringify(sortedData(content(left))) === JSON.stringify(sortedData(content(right)));
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const safeId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && !["__proto__", "constructor", "prototype"].includes(value);
const index = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) >= 0;
const parent = (value: unknown): boolean => record(value) && safeId(value["nodeId"]) && (value["slot"] === undefined || safeId(value["slot"]));
const strings = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === "string");
const devices = (value: unknown): boolean => strings(value) && (value as string[]).every((item) => item === "tablet" || item === "mobile");

function validNode(value: unknown): boolean {
  if (!record(value) || !safeId(value["id"]) || typeof value["primitive"] !== "string" || value["primitive"].length === 0 || !record(value["props"])) return false;
  if ((value["variant"] !== undefined && (typeof value["variant"] !== "string" || value["variant"].length === 0)) ||
      ["hidden", "locked"].some((key) => value[key] !== undefined && typeof value[key] !== "boolean") ||
      (value["children"] !== undefined && (!strings(value["children"]) || !(value["children"] as string[]).every(safeId))) ||
      (value["slots"] !== undefined && (!record(value["slots"]) || !Object.entries(value["slots"]).every(([slot, list]) => safeId(slot) && strings(list) && (list as string[]).every(safeId)))) ||
      (value["classes"] !== undefined && !strings(value["classes"])) ||
      ["hiddenDevices", "shownDevices"].some((key) => value[key] !== undefined && !devices(value[key])) ||
      (value["states"] !== undefined && (!record(value["states"]) || !Object.entries(value["states"]).every(([state, props]) => (STATE_ORDER as readonly string[]).includes(state) && record(props))))) return false;
  if (value["motion"] !== undefined) parseEditorMutation({ op: "setMotion", id: value["id"], spec: value["motion"] });
  return true;
}

function checkDocumentStructure(document: EditorDocument): void {
  if (!isHistoryData(document) || !safeId(document.rootNodeId) || !Object.hasOwn(document.nodes, document.rootNodeId)) throw new Error("Ungültiger History-Dokumentbaum");
  for (const [id, node] of Object.entries(document.nodes)) {
    if (id !== node.id || !validNode(node) || [...(node.children ?? []), ...Object.values(node.slots ?? {}).flat()].some((child) => !Object.hasOwn(document.nodes, child))) {
      throw new Error("Ungültige History-Node-Daten oder Referenzen");
    }
  }
}

function validPatch(input: unknown): input is DocumentPatch {
  if (!record(input)) return false;
  const value = input as unknown as DocumentPatch;
  if (value.patch !== "insertNodes" && value.patch !== "upsertStyleRule" && !safeId(input["id"])) return false;
  switch (value.patch) {
    case "setNodeProps": return record(value.props) && Object.keys(value.props).every((key) => key.length > 0);
    case "setNodeFields": return record(value.fields) && Object.entries(value.fields).every(([key, item]) =>
      (["hidden", "locked"].includes(key) && (item === undefined || item === null || typeof item === "boolean")) ||
      (key === "classes" && (item === undefined || item === null || strings(item))) ||
      (["hiddenDevices", "shownDevices"].includes(key) && (item === undefined || item === null || devices(item))));
    case "setNodeMotion":
      parseEditorMutation(value.spec === null ? { op: "clearMotion", id: value.id } : { op: "setMotion", id: value.id, spec: value.spec });
      return true;
    case "insertNodes": return parent(value.parent) && index(value.index) && Array.isArray(value.nodes) && value.nodes.length > 0 &&
      new Set(value.nodes.map((node) => node?.id)).size === value.nodes.length && value.nodes.every(validNode);
    case "deleteNode": return true;
    case "moveNode": return parent(value.target) && index(value.index);
    case "upsertStyleRule":
      if (!record(value.rule) || !safeId(value.rule.id)) return false;
      parseEditorMutation({ op: "upsertStyleRule", rule: value.rule });
      return true;
    case "deleteStyleRule": return true;
    case "reorderStyleRule": return index(value.index);
    case "renameStyleRule":
      parseEditorMutation({ op: "renameStyleRule", id: value.id, name: value.name });
      return true;
    default: return false;
  }
}

function replay(document: EditorDocument, patches: DocumentPatch[]): EditorDocument {
  const working = cloneDocument(document);
  const requireNode = (id: string): void => {
    if (!Object.hasOwn(working.nodes, id)) throw new Error("History-Ziel ist kein eigener Node");
  };
  for (const patch of patches) {
    if (["setNodeProps", "setNodeFields", "setNodeMotion", "deleteNode", "moveNode"].includes(patch.patch)) requireNode((patch as { id: string }).id);
    if (patch.patch === "insertNodes") {
      requireNode(patch.parent.nodeId);
      if (patch.nodes.some((node) => Object.hasOwn(working.nodes, node.id))) throw new Error("History würde einen vorhandenen Node ersetzen");
    }
    if (patch.patch === "moveNode") requireNode(patch.target.nodeId);
    applyDocumentPatch(working, patch);
    if (patch.patch === "insertNodes") checkDocumentStructure(working);
  }
  return applyDocumentPatches(working, []);
}

export function checkedEditorHistory(input: unknown, document: EditorDocument): HistorySnapshot {
  checkDocumentStructure(document);
  if (validateDocument(document).length > 0) throw new Error("Ungültiger History-Ausgangsstand");
  const stack = new HistoryStack();
  stack.restore(input);
  const snapshot = stack.snapshot();
  for (const entry of snapshot.entries) {
    for (const patch of [...entry.mutations, ...entry.undoPatch] as unknown as DocumentPatch[]) {
      if (!validPatch(patch)) throw new Error("Ungültige History-Patch-Art oder Patch-Struktur");
    }
  }
  const step = (before: EditorDocument, patches: DocumentPatch[], reverse: DocumentPatch[]): EditorDocument => {
    const after = replay(before, patches);
    if (validateDocument(after).length > 0 || !historyDocumentsEqual(replay(after, reverse), before)) {
      throw new Error("History-Schritt ist nicht umkehrbar");
    }
    return after;
  };
  let previous = document;
  for (const entry of snapshot.entries.slice(0, snapshot.cursor).reverse()) {
    if (!entry.external) previous = step(previous, entry.undoPatch as unknown as DocumentPatch[], entry.mutations as unknown as DocumentPatch[]);
  }
  let future = document;
  for (const entry of snapshot.entries.slice(snapshot.cursor)) {
    if (!entry.external) future = step(future, entry.mutations as unknown as DocumentPatch[], entry.undoPatch as unknown as DocumentPatch[]);
  }
  return snapshot;
}

// Use the live stack's branch/limit rules for both preflight and reload recovery.
// Receipt ownership follows the retained entries, never the discarded future.
export function checkpointAfterExternalCommit(checkpoint: SessionHistoryCheckpoint, entry: HistoryEntry, versions = checkpoint.versions): SessionHistoryCheckpoint {
  if (entry.status !== "pending" || !entry.external || entry.op !== "external" || checkpoint.history.entries.some((item) => item.id === entry.id)) throw new Error("Ungültiger neuer Verlaufsschritt");
  checkedEditorHistory({ format: 1, entries: [{ ...entry, status: "committed" }], cursor: 1 }, checkpoint.document);
  const history = checkedEditorHistory(checkpoint.history, checkpoint.document);
  const receipts = checkedClassDeletionReceipts(checkpoint.classDeletionReceipts, history);
  const stack = new HistoryStack({ idFactory: () => entry.id, now: () => entry.at });
  stack.restore(history);
  stack.beginExternal({ ...entry, op: entry.op });
  stack.commitExternal(entry.id, { versionAfter: versions.pageVersion });
  const next = stack.snapshot();
  return { ...structuredClone(checkpoint), versions: structuredClone(versions), history: next,
    classDeletionReceipts: [...receipts].filter(([id]) => next.entries.some((item) => item.id === id)).map(([entryId, receiptId]) => ({ entryId, receiptId })) };
}

export function matchingHistoryCheckpoint(input: unknown, pageId: string, siteId: string, versions: ExternalVersions, document: EditorDocument): SessionHistoryCheckpoint | null {
  if (!isHistoryData(input) || input === null || typeof input !== "object") return null;
  const value = input as SessionHistoryCheckpoint;
  if (value.format !== 1 || value.pageId !== pageId || value.siteId !== siteId ||
      !value.versions || value.versions.pageVersion !== versions.pageVersion || value.versions.themeVersion !== versions.themeVersion ||
      value.versions.registryVersion !== versions.registryVersion || !value.document || !Array.isArray(value.document.styleRules) ||
      !historyDocumentsEqual(value.document, document)) return null;
  return value;
}
