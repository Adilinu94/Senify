// Nicht Teil der Anwendung oder regulären Suite: reproduzierbare Review-Proben.
import assert from "node:assert/strict";
import { createSavePipeline } from "../../packages/editor/src/state/persist.ts";
import { baseStore } from "../../packages/editor/test/state/fixtures.ts";

const author = { kind: "human" as const, id: "audit", label: "Analyse" };
const change = (store: ReturnType<typeof baseStore>, value: number) =>
  store.apply({ op: "setNodeProp", id: "head000001", key: "fontSize", value });
const results: Record<string, unknown>[] = [];

// A: Ein abgelehnter Transport verlässt flush vor running=false.
{
  const store = baseStore();
  let requests = 0;
  const p = createSavePipeline({ store, pageId: "page", siteId: "site", author,
    debounceMs: 1_000_000, request: async () => { requests++; throw new Error("offline"); } });
  change(store, 30);
  await assert.rejects(p.flush(), /offline/);
  change(store, 31);
  await p.retry();
  assert.equal(requests, 1);
  assert.equal(p.state().status, "saving");
  results.push({ probe: "Transport-Rejection blockiert weitere Saves", requests, state: p.state() });
  p.dispose();
}

// B: Eine neue Änderung während eines fehlgeschlagenen Requests wird überschrieben.
for (const status of [409, 500]) {
  const store = baseStore();
  let reply!: (value: { status: number; body?: unknown }) => void;
  const p = createSavePipeline({ store, pageId: "page", siteId: "site", author,
    debounceMs: 1_000_000, request: () => new Promise(resolve => { reply = resolve; }) });
  change(store, 30);
  const saving = p.flush();
  change(store, 31);
  assert.equal(p.state().pending, 1);
  reply({ status, body: { error: { message: "Draft has changed (expected v1, current v2)" } } });
  await saving;
  assert.equal(p.state().pending, 1); // Erwartet wären zwei Writes; nur alter Batch steht noch an.
  assert.equal(store.document.nodes["head000001"]?.props.fontSize, 31);
  results.push({ probe: `Neue Änderung bei HTTP ${status} verloren`, state: p.state(), localValue: 31 });
  p.dispose();
}

// C: Der Debounce der zweiten Änderung läuft ab, solange flush noch läuft.
{
  const store = baseStore();
  let reply!: (value: { status: number; body?: unknown }) => void;
  let requests = 0;
  const p = createSavePipeline({ store, pageId: "page", siteId: "site", author,
    debounceMs: 5, request: () => { requests++; return new Promise(resolve => { reply = resolve; }); } });
  change(store, 30);
  const saving = p.flush();
  change(store, 31);
  await new Promise(resolve => setTimeout(resolve, 30));
  reply({ status: 200, body: { newDraftVersion: 2 } });
  await saving;
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(requests, 1);
  assert.equal(p.state().pending, 1);
  results.push({ probe: "Folge-Batch ohne neuen Timer", requests, state: p.state() });
  p.dispose();
}

// D: Direkte Sichtbarkeitsmutation wird vom PAGE_OPS-Filter verworfen.
{
  const store = baseStore();
  let requests = 0;
  const p = createSavePipeline({ store, pageId: "page", siteId: "site", author,
    debounceMs: 1_000_000, request: async () => { requests++; return { status: 200 }; } });
  store.apply({ op: "setNodeHiddenDevices", id: "head000001", devices: ["mobile"] });
  await p.flush();
  assert.equal(requests, 0);
  assert.deepEqual(p.state().unsupported, ["setNodeHiddenDevices"]);
  results.push({ probe: "setNodeHiddenDevices nicht gespeichert", requests, state: p.state() });
  p.dispose();
}

// E: Ein Registry-Konflikt aktualisiert weder Registry-Version noch Retry-Ziel.
{
  const store = baseStore();
  const sent: unknown[] = [];
  const p = createSavePipeline({ store, pageId: "page", siteId: "site", author,
    debounceMs: 1_000_000, request: async request => {
      sent.push(request.body); return { status: 409, body: { error: { message: "Style registry changed" } } };
    } });
  store.apply({ op: "upsertStyleRule", rule: {
    id: "r-test", name: "test", kind: "class", selector: ".test", order: 0,
    styles: { color: "#123456" }, contextStyles: {},
  } });
  await p.flush();
  await p.retry();
  assert.equal(sent.length, 1);
  assert.equal(p.state().conflict?.serverVersion, null);
  await p.retry(2);
  assert.equal((sent[1] as { baseVersion: number }).baseVersion, 0);
  results.push({ probe: "Registry-Retry nutzt alte Registry-Version", sent, state: p.state() });
  p.dispose();
}

console.log(JSON.stringify(results, null, 2));
