import { describe, expect, it, vi } from "vitest";
import { bakeStatusText, createBakeStatus } from "../public/app-editor-bake-status.js";

// Der Re-Bake-Badge aus `app-editor.js` (E12, R12-Schnitt).
//
// Die Regel, die er tragen muss: der Badge meldet den JUENGSTEN Job. Die
// Route sortiert absteigend - der erste Eintrag entscheidet. Ein alter
// "done"-Job darf einen laufenden nicht verdecken, und ein Status, den diese
// Fassung nicht kennt, ist weder Fehler noch Fertigmeldung.

function fakes() {
  const badge = {
    hidden: true,
    textContent: "",
    dataset: {} as Record<string, string | undefined>,
  };
  const el = (tag: string, spec: Record<string, unknown>) => {
    expect(tag).toBe("span");
    badge.hidden = spec["hidden"] === true;
    return badge;
  };
  return { badge, el };
}

describe("bakeStatusText", () => {
  it("meldet einen laufenden Job als Hinweis, nicht als Fehler", () => {
    expect(bakeStatusText({ status: "queued" })).toEqual({
      text: "Inhalt wird neu gebaut …",
      error: false,
    });
    expect(bakeStatusText({ status: "running" })).toEqual({
      text: "Inhalt wird neu gebaut …",
      error: false,
    });
  });

  it("nennt beim Fehlschlag den Grund", () => {
    expect(bakeStatusText({ status: "failed", lastError: "Speicher voll" })).toEqual({
      text: "Re-Bake fehlgeschlagen: Speicher voll",
      error: true,
    });
  });

  it("sagt 'unbekannt', wenn der Fehlschlag keinen Grund nennt", () => {
    // Ohne diesen Fall stuende dort "fehlgeschlagen: undefined".
    expect(bakeStatusText({ status: "failed" })).toEqual({
      text: "Re-Bake fehlgeschlagen: unbekannt",
      error: true,
    });
    expect(bakeStatusText({ status: "failed", lastError: null })).toEqual({
      text: "Re-Bake fehlgeschlagen: unbekannt",
      error: true,
    });
  });

  it("meldet den fertigen Job", () => {
    expect(bakeStatusText({ status: "done" })).toEqual({
      text: "Inhalt neu gebaut",
      error: false,
    });
  });

  it("schweigt bei unbekanntem Status und ohne Job", () => {
    // Ein neuer Status in der Engine darf keinen falschen Badge erzeugen.
    expect(bakeStatusText({ status: "cancelled" })).toBeNull();
    expect(bakeStatusText(null)).toBeNull();
    expect(bakeStatusText(undefined)).toBeNull();
  });
});

describe("createBakeStatus", () => {
  it("ist am Anfang versteckt", () => {
    const f = fakes();
    const status = createBakeStatus({ el: f.el, fetchJobs: async () => ({ jobs: [] }) });
    expect(status.element.hidden).toBe(true);
  });

  it("zeigt den neuesten Job, nicht einen aelteren", async () => {
    const f = fakes();
    const status = createBakeStatus({
      el: f.el,
      fetchJobs: async () => ({
        jobs: [{ status: "running" }, { status: "done" }],
      }),
    });

    await status.refresh();
    expect(status.element.hidden).toBe(false);
    expect(status.element.textContent).toBe("Inhalt wird neu gebaut …");
  });

  it("markiert den Fehlschlag am Element", async () => {
    const f = fakes();
    const status = createBakeStatus({
      el: f.el,
      fetchJobs: async () => ({ jobs: [{ status: "failed", lastError: "Platte voll" }] }),
    });

    await status.refresh();
    expect(status.element.dataset["state"]).toBe("error");
  });

  it("nimmt die Fehlermarkierung bei einem spaeteren Erfolg wieder weg", async () => {
    const f = fakes();
    let antwort: { jobs: { status: string; lastError?: string }[] } = {
      jobs: [{ status: "failed", lastError: "Platte voll" }],
    };
    const status = createBakeStatus({ el: f.el, fetchJobs: async () => antwort });

    await status.refresh();
    expect(status.element.dataset["state"]).toBe("error");

    antwort = { jobs: [{ status: "done" }] };
    await status.refresh();
    // Sonst bliebe ein roter Badge an einer erfolgreichen Meldung stehen.
    expect(status.element.dataset["state"]).toBeUndefined();
    expect(status.element.textContent).toBe("Inhalt neu gebaut");
  });

  it("bleibt still, wenn die Route nicht antwortet", async () => {
    const f = fakes();
    const status = createBakeStatus({
      el: f.el,
      fetchJobs: async () => {
        throw new Error("Route weg");
      },
    });

    await expect(status.refresh()).resolves.toBeNull();
    expect(status.element.hidden).toBe(true);
  });

  it("bleibt still, wenn es keinen Job gibt", async () => {
    const f = fakes();
    const fetchJobs = vi.fn(async () => ({ jobs: [] }));
    const status = createBakeStatus({ el: f.el, fetchJobs });

    await status.refresh();
    expect(fetchJobs).toHaveBeenCalledTimes(1);
    expect(status.element.hidden).toBe(true);
  });

  it("meldet ein Live-Ereignis direkt, ohne die Route zu fragen", async () => {
    // `bake.done` / `bake.failed` kommen ueber den Kanal; sie sollen nicht
    // erst auf den naechsten Abruf warten.
    const f = fakes();
    const fetchJobs = vi.fn(async () => ({ jobs: [] }));
    const status = createBakeStatus({ el: f.el, fetchJobs });

    status.show("Inhalt neu gebaut");
    expect(status.element.textContent).toBe("Inhalt neu gebaut");
    expect(status.element.hidden).toBe(false);
    expect(fetchJobs).not.toHaveBeenCalled();

    status.show("Re-Bake fehlgeschlagen", true);
    expect(status.element.dataset["state"]).toBe("error");
  });

  it("vertraegt eine Antwort ohne jobs-Feld", async () => {
    const f = fakes();
    const status = createBakeStatus({ el: f.el, fetchJobs: async () => ({}) });
    await expect(status.refresh()).resolves.toBeNull();

    const kaputt = createBakeStatus({ el: f.el, fetchJobs: async () => "Unsinn" });
    await expect(kaputt.refresh()).resolves.toBeNull();
  });
});
