import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { inlineComponents } from "@senify/section-sdk";
import { LibraryRepository, type LibraryHost } from "../src/store-library.ts";
import { createTestDatabase, TEST_AUTHOR } from "./helpers.ts";

// Der Widget-Baustein in der Bibliothek (Spec 2026-11-12, Task 10): der
// bestehende Mechanismus traegt beliebige NodeTrees. Ein Widget-Knoten ist ein
// gueltiger Katalog-Knoten; die Controls kommen aus dem Katalog, nicht aus der
// Bibliothek. Diese Datei pinnt den Weg fuer genau diesen Knotentyp:
// speichern -> installieren -> Instanz-Override auf einer Widget-Prop.
//
// Die Lizenz ist ein Fixture-Nachweis, kein Produktionsdatensatz. Der Guard
// `assertLicensedForLibrary` bleibt scharf: ein Framer-Import ohne gepruefte
// Lizenz wird abgewiesen (Spec §9).

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  const store = new Store(database.db);
  const host: LibraryHost = {
    getSite: (siteId) => store.getSite(siteId),
    getPage: (pageId) => store.getPage(pageId),
    listPages: (siteId) => store.listPages(siteId),
    persistBatch: (input) => store.persistBatch(input),
    appendAudit: (entries) => store.appendAudit(entries),
  };
  return { store, repo: new LibraryRepository(database.db, host) };
}

const widgetDefinition = {
  rootNodeId: "root00001",
  nodes: {
    root00001: {
      id: "root00001",
      type: "section",
      props: {},
      children: ["rib00001"],
    },
    rib00001: {
      id: "rib00001",
      type: "ribbon-gallery",
      props: {
        speed: 8.28,
        images: [{ image: "/media/a.png" }, { image: "/media/b.png" }],
      },
    },
  },
};

async function widgetComponent(repo: LibraryRepository) {
  return repo.createLibraryComponent({
    id: "lib-ribbon",
    name: "Ribbon Gallery",
    kind: "component",
    definition: widgetDefinition as never,
    fingerprint: "struct-ribbon-widget",
    tags: ["widget", "framer"],
    provenance: {
      kind: "framer-import",
      sourceUrl: "https://framer.com/m/Ribbon-Gallery-abc123",
      pagePath: null,
      irHash: null,
    },
    license: {
      id: "LicenseRef-Fixture-Only",
      note: "Testnachweis; die echte Framer-University-Lizenz klaert Task 11.",
      status: "verified",
    },
    notes: "Pilot: Media/Ribbon_Gallery.tsx",
    author: TEST_AUTHOR,
  });
}

const rejected = (promise: Promise<unknown>) =>
  promise.catch((caught: unknown) => caught);

describe("widget library", () => {
  it("saves and installs a widget baustein as a component with its widget node", async () => {
    const { repo, store } = await fixture();
    const baustein = await widgetComponent(repo);

    const site = await store.createSite({ name: "Widget-Site" });
    const page = await store.createPage(site.id, { title: "Start", path: "/" });
    await repo.installLibraryComponent({
      id: "install-widget",
      siteId: site.id,
      componentId: baustein.id,
      mode: "linked",
      pageId: page.id,
      author: TEST_AUTHOR,
    });

    const draft = (await store.getPage(page.id)).draft;
    const component = Object.values(draft.nodes).find(
      (node) => node.type === "__component",
    );
    expect(component).toBeDefined();
    const widget = Object.values(draft.nodes).find(
      (node) => node.type === "ribbon-gallery",
    );
    expect(widget).toBeDefined();
    expect(widget?.props["speed"]).toBe(8.28);
    expect(component?.children).toContain(widget?.id);

    const instance = Object.values(draft.nodes).find(
      (node) => node.type === "__component_instance",
    );
    expect(instance?.props["libraryComponentId"]).toBe(baustein.id);
    expect(instance?.props["componentVersion"]).toBe(baustein.version);
  });

  it("applies an instance override to a widget prop", async () => {
    const { repo, store } = await fixture();
    const baustein = await widgetComponent(repo);

    const site = await store.createSite({ name: "Override-Site" });
    const page = await store.createPage(site.id, { title: "Start", path: "/" });
    await repo.installLibraryComponent({
      id: "install-override",
      siteId: site.id,
      componentId: baustein.id,
      mode: "linked",
      pageId: page.id,
      author: TEST_AUTHOR,
    });

    const pageState = await store.getPage(page.id);
    const draft = pageState.draft;
    const instance = Object.values(draft.nodes).find(
      (node) => node.type === "__component_instance",
    );
    const widget = Object.values(draft.nodes).find(
      (node) => node.type === "ribbon-gallery",
    );
    expect(instance).toBeDefined();
    expect(widget).toBeDefined();
    if (instance === undefined || widget === undefined) return;

    instance.props["overrides"] = {
      [widget.id]: { speed: 30, dispersion: 2 },
    };

    const expanded = inlineComponents(draft);
    const copies = Object.values(expanded.tree.nodes).filter(
      (node) => node.type === "ribbon-gallery",
    );
    expect(copies.length).toBeGreaterThan(0);
    expect(copies.some((copy) => copy.props["speed"] === 30)).toBe(true);
    expect(copies.some((copy) => copy.props["dispersion"] === 2)).toBe(true);
  });

  it("refuses a framer import whose license is not verified", async () => {
    const { repo } = await fixture();
    const error = await rejected(
      repo.createLibraryComponent({
        id: "lib-ribbon-unknown",
        name: "Ribbon ohne Lizenz",
        kind: "component",
        definition: widgetDefinition as never,
        fingerprint: "struct-ribbon-unknown",
        tags: [],
        provenance: {
          kind: "framer-import",
          sourceUrl: "https://framer.com/m/Ribbon-Gallery-abc123",
          pagePath: null,
          irHash: null,
        },
        license: { id: "unknown", note: null, status: "unknown" },
        notes: "",
        author: TEST_AUTHOR,
      }),
    );
    expect(error).toBeInstanceOf(SenifyError);
    expect((error as SenifyError).message).toContain("Lizenz");
  });
});
