// Die Baustein-Bibliothek: Re-Attach, Aehnlichkeit und der Weg ueber mehrere
// Sites.
//
// Diese Datei ist die Regressionswaechterin fuer drei Befunde:
//
// 1. Ein Detach loest nur die Bindung. Vorher wurde die Instanz zur
//    Definition umgewandelt - eine Definition OHNE Instanz, die der Inliner
//    fallen laesst: der Baustein verschwand aus der gerenderten Seite. Der
//    Inhalt muss nach dem Detach im gerenderten Baum stehen.
// 2. Ein Detach ist eine Einbahnstrasse, wenn die Herkunft nicht gemerkt wird.
//    Das Detach merkt sie (`libraryDetachedFrom`), und Re-Attach haengt den
//    Baustein wieder an - ohne die lokalen Knoten zu kopieren, damit die
//    Ueberschreibungen erhalten bleiben.
// 3. Die Aehnlichkeit ist ein Hinweis, kein Urteil: sie meldet, sie merged
//    nichts.
//
// Der Lauf geht ueber die ECHTE Engine (echter Store, echtes HTTP), weil
// genau diese Kette betroffen ist: Detach -> Draft -> Inliner -> gerenderter
// Baum.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inlineComponents, type NodeTree } from "@senify/section-sdk";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
} from "./helpers.ts";

const definition: NodeTree = {
  rootNodeId: "lib-root",
  nodes: {
    "lib-root": {
      id: "lib-root",
      type: "__component",
      props: { name: "Bibliothekskarte", version: 1 },
      children: ["lib-body"],
    },
    "lib-body": {
      id: "lib-body",
      type: "block",
      props: { headline: "Aus der Bibliothek" },
    },
  },
};

let env: BootEnv;
let siteId: string;
let pageId: string;
let componentId: string;

beforeAll(async () => {
  env = await bootEngine();
  siteId = (await createTestSite(env.api, "Bibliothek")).id;
  pageId = (await createTestPage(env.api, siteId, { title: "A", path: "/a" })).id;
});

afterAll(async () => {
  await env.close();
});

async function anlegen(): Promise<string> {
  const angelegt = await env.api.request<{ id: string }>({
    method: "POST",
    path: "/api/library-components",
    body: {
      name: "Bibliothekskarte",
      kind: "component",
      definition,
      fingerprint: `struct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: TEST_AUTHOR,
    },
  });
  expect(angelegt.status).toBe(201);
  return angelegt.body.id;
}

async function installieren(component: string): Promise<string> {
  const installiert = await env.api.request<{ id: string }>({
    method: "POST",
    path: `/api/sites/${siteId}/library-installs`,
    body: {
      componentId: component,
      pageId,
      parentNodeId: (await env.engine.store.getPage(pageId)).draft.rootNodeId,
      author: TEST_AUTHOR,
    },
  });
  expect(installiert.status).toBe(201);
  return installiert.body.id;
}

// Der gerenderte Baum - die Ableitung, die Canvas und Release gemeinsam
// benutzen (`inlineComponents`).
async function gerenderterBaum(): Promise<string> {
  const seite = await env.engine.store.getPage(pageId);
  return JSON.stringify(inlineComponents(seite.draft).tree.nodes);
}

describe("Bibliothek: das Detach verliert keinen Inhalt", () => {
  it("laesst den Baustein nach dem Detach im gerenderten Baum stehen", async () => {
    componentId = await anlegen();
    const installId = await installieren(componentId);

    // Vorher: der Inhalt ist da.
    expect(await gerenderterBaum()).toContain("Aus der Bibliothek");

    const geloest = await env.api.request<{ id: string }>({
      method: "DELETE",
      path: `/api/sites/${siteId}/library-installs/${installId}`,
      body: { author: TEST_AUTHOR },
    });
    expect(geloest.status).toBe(200);

    // Nachher: der Inhalt ist immer noch da. Ein Detach ist ein Losloesen von
    // der Bibliothek, kein Wegwerf.
    expect(await gerenderterBaum()).toContain("Aus der Bibliothek");

    // Und die Seite merkt sich die Herkunft - ohne sie waere die Rueckrichtung
    // nicht moeglich.
    const seite = await env.engine.store.getPage(pageId);
    expect(
      Object.values(seite.draft.nodes).some((node) => node.props["libraryDetachedFrom"] === componentId),
    ).toBe(true);
  }, 60_000);
});

describe("Bibliothek: Re-Attach", () => {
  it("haengt den geloesten Baustein wieder an, ohne den Inhalt zu verlieren", async () => {
    const component = await anlegen();
    const installId = await installieren(component);
    await env.api.request({
      method: "DELETE",
      path: `/api/sites/${siteId}/library-installs/${installId}`,
      body: { author: TEST_AUTHOR },
    });
    expect(await env.engine.store.listLibraryInstalls(siteId)).toHaveLength(0);

    const wieder = await env.api.request<{ installedVersion: number }>({
      method: "POST",
      path: `/api/sites/${siteId}/library-installs/reattach`,
      body: { componentId: component, author: TEST_AUTHOR },
    });
    expect(wieder.status).toBe(200);
    expect(wieder.body.installedVersion).toBe(1);

    // Der Inhalt ist noch derselbe - er wurde nicht neu kopiert.
    expect(await gerenderterBaum()).toContain("Aus der Bibliothek");
    // Die Bindung ist zurueck.
    const seite = await env.engine.store.getPage(pageId);
    expect(
      Object.values(seite.draft.nodes).some(
        (node) => node.type === "__component_instance" && node.props["libraryComponentId"] === component,
      ),
    ).toBe(true);
    // Und die Installationszeile steht wieder.
    expect(await env.engine.store.listLibraryInstalls(siteId)).toHaveLength(1);
    // Das Protokoll erzaehlt den Schritt.
    const audit = await env.api.request<{ entries: { action: string }[] }>({
      method: "GET",
      path: "/api/library-components/audit",
    });
    expect(audit.body.entries.map((entry) => entry.action)).toContain("reattached");
  }, 60_000);
});

describe("Bibliothek: Aehnlichkeit ist ein Hinweis, kein Urteil", () => {
  it("meldet strukturell gleiche Bausteine und merged nichts", async () => {
    const erst = await anlegen();
    const zweit = await anlegen();

    const similar = await env.api.request<{ count: number; similar: { similarity: number; component: { id: string }; similarTo: { id: string } }[] }>({
      method: "GET",
      path: "/api/library-components/similar",
    });
    expect(similar.status).toBe(200);
    expect(similar.body.count).toBeGreaterThanOrEqual(1);
    const paar = similar.body.similar.find(
      (eintrag) =>
        (eintrag.component.id === erst && eintrag.similarTo.id === zweit) ||
        (eintrag.component.id === zweit && eintrag.similarTo.id === erst),
    );
    expect(paar).toBeDefined();
    expect(paar!.similarity).toBe(100);

    // Beide Bausteine stehen noch da - es wurde nichts zusammengelegt.
    const alle = await env.api.request<{ components: { id: string }[] }>({
      method: "GET",
      path: "/api/library-components",
    });
    expect(alle.body.components.map((entry) => entry.id)).toEqual(expect.arrayContaining([erst, zweit]));
  }, 60_000);
});
