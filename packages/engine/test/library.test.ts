import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NodeTree } from "@senify/section-sdk";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
} from "./helpers.ts";

type LibraryView = {
  id: string;
  name: string;
  version: number;
  fingerprint: string;
  license: { id: string; status: "verified" | "unknown" };
};

type InstallView = {
  id: string;
  siteId: string;
  componentId: string;
  installedVersion: number;
};

const definition: NodeTree = {
  rootNodeId: "library-root",
  nodes: {
    "library-root": {
      id: "library-root",
      type: "__component",
      props: { name: "Bibliothekskarte", version: 1 },
      children: ["library-body"],
    },
    "library-body": {
      id: "library-body",
      type: "block",
      props: { headline: "Aus der Bibliothek" },
    },
  },
};

let env: BootEnv;
let firstSiteId: string;
let secondSiteId: string;
let firstPageId: string;
let secondPageId: string;

beforeAll(async () => {
  env = await bootEngine();
  firstSiteId = (await createTestSite(env.api, "Bibliothek A")).id;
  secondSiteId = (await createTestSite(env.api, "Bibliothek B")).id;
  firstPageId = (await createTestPage(env.api, firstSiteId, { title: "A", path: "/a" })).id;
  secondPageId = (await createTestPage(env.api, secondSiteId, { title: "B", path: "/b" })).id;
});

afterAll(async () => {
  await env.close();
});

async function createComponent() {
  return env.api.request<LibraryView>({
    method: "POST",
    path: "/api/library-components",
    body: {
      name: "Bibliothekskarte",
      kind: "component",
      definition,
      fingerprint: "struct-library-card",
      tags: ["card", "imported"],
      provenance: {
        kind: "framer-import",
        sourceUrl: "https://example.test/framer",
        pagePath: "/",
        irHash: "ir-1",
      },
      license: { id: "MIT", status: "verified" },
      notes: "Aus dem Framer-Import",
      author: TEST_AUTHOR,
    },
  });
}

async function install(siteId: string, pageId: string) {
  const component = await createComponent();
  expect(component.status).toBe(201);
  const result = await env.api.request<InstallView>({
    method: "POST",
    path: `/api/sites/${siteId}/library-installs`,
    body: {
      componentId: component.body.id,
      mode: "linked",
      pageId,
      parentNodeId: pageId === firstPageId
        ? (await env.engine.store.getPage(pageId)).draft.rootNodeId
        : (await env.engine.store.getPage(pageId)).draft.rootNodeId,
      author: TEST_AUTHOR,
    },
  });
  return { component: component.body, install: result };
}

describe("global library components", () => {
  it("deduplicates by fingerprint and installs a real component instance on two sites", async () => {
    const first = await install(firstSiteId, firstPageId);
    expect(first.install.status, JSON.stringify(first.install.body)).toBe(201);
    const second = await install(secondSiteId, secondPageId);
    expect(second.install.status, JSON.stringify(second.install.body)).toBe(201);
    expect(second.component.id).toBe(first.component.id);

    const firstPage = await env.engine.store.getPage(firstPageId);
    const secondPage = await env.engine.store.getPage(secondPageId);
    const instances = (page: typeof firstPage) => Object.values(page.draft.nodes).filter(
      (node) => node.type === "__component_instance" && node.props["libraryComponentId"] === first.component.id,
    );
    expect(instances(firstPage)).toHaveLength(1);
    expect(instances(secondPage)).toHaveLength(1);

    const list = await env.api.request<{ components: LibraryView[] }>({
      method: "GET",
      path: "/api/library-components",
    });
    expect(list.status).toBe(200);
    expect(list.body.components).toHaveLength(1);
  }, 60_000);

  it("updates pins and detaches without deleting the local definition", async () => {
    const created = await createComponent();
    const component = created.body;
    const installed = await env.api.request<InstallView>({
      method: "POST",
      path: `/api/sites/${firstSiteId}/library-installs`,
      body: {
        componentId: component.id,
        pageId: firstPageId,
        parentNodeId: (await env.engine.store.getPage(firstPageId)).draft.rootNodeId,
        author: TEST_AUTHOR,
      },
    });
    expect(installed.status).toBe(201);

    // Die Version zaehlt die Definitionen, nicht die Metadaten: eine Notiz
    // ist keine neue Definition. Erst eine geaenderte Definition erhoeht sie -
    // und damit entsteht ueberhaupt erst ein Drift, den die Seite nachziehen
    // kann.
    const notiz = await env.api.request<LibraryView>({
      method: "PATCH",
      path: `/api/library-components/${component.id}`,
      body: { notes: "Version 2", author: TEST_AUTHOR },
    });
    expect(notiz.status).toBe(200);
    expect(notiz.body.version).toBe(1);

    const updated = await env.api.request<LibraryView>({
      method: "PATCH",
      path: `/api/library-components/${component.id}`,
      body: {
        definition: {
          rootNodeId: "library-root",
          nodes: {
            "library-root": { id: "library-root", type: "__component", props: { name: "Bibliothekskarte", version: 2 }, children: ["library-body"] },
            "library-body": { id: "library-body", type: "block", props: { headline: "Aus der Bibliothek, Version 2" } },
          },
        },
        author: TEST_AUTHOR,
      },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(2);

    const pinned = await env.api.request<InstallView>({
      method: "POST",
      path: `/api/sites/${firstSiteId}/library-installs/${installed.body.id}/update`,
      body: { author: TEST_AUTHOR },
    });
    expect(pinned.status).toBe(200);
    expect(pinned.body.installedVersion).toBe(2);

    // Und die Seite zeigt den neuen Text.
    const seite = await env.engine.store.getPage(firstPageId);
    expect(JSON.stringify(seite.draft.nodes)).toContain("Aus der Bibliothek, Version 2");

    const detached = await env.api.request<InstallView>({
      method: "DELETE",
      path: `/api/sites/${firstSiteId}/library-installs/${installed.body.id}`,
      body: { author: TEST_AUTHOR },
    });
    expect(detached.status).toBe(200);
    const page = await env.engine.store.getPage(firstPageId);
    // Die Bindung an die Bibliothek ist geloest...
    expect(Object.values(page.draft.nodes).some((node) => node.type === "__component_instance" && node.props["libraryComponentId"] === component.id)).toBe(false);
    // ... aber der Inhalt ist noch da: ein Detach ist ein Losloesen, kein
    // Wegwerf. (Vorher wurde die Instanz zur Definition umgewandelt - eine
    // Definition ohne Instanz, die der Inliner fallen laesst: der Baustein
    // verschwand aus der gerenderten Seite.)
    expect(Object.values(page.draft.nodes).some((node) => node.props["libraryDetachedFrom"] === component.id)).toBe(true);
    expect(JSON.stringify(page.draft.nodes)).toContain("Aus der Bibliothek, Version 2");

    // Und er haengt wieder an der Bibliothek.
    const wieder = await env.api.request<InstallView>({
      method: "POST",
      path: `/api/sites/${firstSiteId}/library-installs/reattach`,
      body: { componentId: component.id, author: TEST_AUTHOR },
    });
    expect(wieder.status).toBe(200);
    expect(wieder.body.installedVersion).toBe(2);
    const seiteNachher = await env.engine.store.getPage(firstPageId);
    expect(Object.values(seiteNachher.draft.nodes).some((node) => node.type === "__component_instance" && node.props["libraryComponentId"] === component.id)).toBe(true);

    const audit = await env.api.request<{ entries: { action: string }[] }>({
      method: "GET",
      path: "/api/library-components/audit",
    });
    expect(audit.status).toBe(200);
    expect(audit.body.entries.map((entry) => entry.action)).toEqual(expect.arrayContaining(["created", "updated", "installed", "detached", "reattached"]));
  }, 60_000);

  // ADR-0010 §4: the licence is mandatory and may be `unknown` — but an
  // imported payload with an unknown licence must not enter the global
  // library, because that is how foreign code travels into every project.
  it("refuses an imported component whose licence is unknown", async () => {
    const rejected = await env.api.request<{ error: { field?: string; message: string } }>({
      method: "POST",
      path: "/api/library-components",
      body: {
        name: "Ungeprüfter Import",
        kind: "component",
        definition,
        fingerprint: "struct-unlicensed-import",
        provenance: { kind: "framer-import", sourceUrl: "https://example.test/framer" },
        license: { id: "unknown", status: "unknown" },
        author: TEST_AUTHOR,
      },
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.field).toBe("license");

    // The counter-proof: the same component with a stated licence is accepted.
    const accepted = await env.api.request<LibraryView>({
      method: "POST",
      path: "/api/library-components",
      body: {
        name: "Geprüfter Import",
        kind: "component",
        definition,
        fingerprint: "struct-licensed-import",
        provenance: { kind: "framer-import", sourceUrl: "https://example.test/framer" },
        license: { id: "MIT", status: "verified" },
        author: TEST_AUTHOR,
      },
    });
    expect(accepted.status).toBe(201);
  }, 60_000);

  it("still accepts a hand-built component without a licence", async () => {
    // The rule names the imported case: a hand-built component carries no
    // third-party code, so the default `unknown` stays allowed.
    const created = await env.api.request<LibraryView>({
      method: "POST",
      path: "/api/library-components",
      body: {
        name: "Handarbeit",
        kind: "component",
        definition,
        fingerprint: "struct-hand-built",
        provenance: { kind: "hand" },
        author: TEST_AUTHOR,
      },
    });
    expect(created.status).toBe(201);
  }, 60_000);
});
