import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { Store, createEngine } from "@senify/engine";
import { browserAvailable, memoryDb } from "./support.ts";

// P2-2 Gate: eine Seite, deren Plan zwei `generate`- und eine `select`-Rolle
// enthaelt, laeuft vollstaendig bis `submit_for_review` - im Browser, ueber die
// Oberflaeche, die ein Mensch benutzt.
//
// Der Lauf beweist drei Dinge, die kein Engine-Test beweisen kann:
//   1. Nach dem Confirm bleibt der Mensch im Dialog, weil noch etwas fehlt. Ein
//      Apply mit offenen Bedarfen ist kein fertiges Ergebnis, und der Dialog
//      springt nicht trotzdem zur Draft-Seite.
//   2. Die Bedarfe sind als Arbeitspakete sichtbar: Pfad, Grund, und beim
//      `generate` auch der Prompt - BEVOR jemand Geld fuer ein Bild ausgibt.
//   3. Nach dem Schliessen laeuft der Weg weiter bis zur Review-Einreichung.
//
// Der `generate`-Zweig laeuft mit einem eingebauten Provider (kein Schatten, ein
// lokaler Testanbieter), sonst waere der Lauf von einem Netzdienst abhaengig.
// Die Bildgenerierung ist ein Job; deshalb wartet der Lauf auf dessen Ende und
// nicht auf eine Datei.
const author = { kind: "human", id: "programm", label: "Programm" } as const;

// A reference's provenance, in the shape the store wants: a URL, a capture
// time, a content hash, the method and a free note. The hash is a placeholder -
// nothing in this run verifies it, and inventing a real one would be theatre.
const PROVENANCE = {
  url: "https://example.invalid/vorbild",
  capturedAt: "2026-09-28T00:00:00.000Z",
  hash: "sha256:vorbild",
  method: "manual" as const,
  note: null,
};

/** One profile token. `uses` and `where` are the evidence the plan's brief is
 *  built from, so they are filled in honestly rather than left at zero. */
function token(value: string, role: string) {
  return { value, role, uses: 2, where: ["body"], level: "inferred" as const };
}

// A 1x1 PNG. The browser run must not depend on a network image service: the
// point of the gate is the FLOW, and a test that reaches out to a provider is a
// test that fails on a bad network rather than on a bad product.
//
// The provider is reached through the REAL chain (`custom` -> HTTP), not through
// an injected stub. A stubbed provider would let the run pass while the actual
// chain is broken - and the chain is exactly what a `generate` need depends on.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** A minimal OpenAI-shaped image endpoint: one POST, one base64 PNG back.
 *  Enough for the custom provider's real request/response path, small enough to
 *  read in one sitting. */
async function startImageEndpoint(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    request.resume();
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ b64_json: PNG_1PX.toString("base64") }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A second store handle on the program's database.
 *
 *  The library writes references through the store, and there is no HTTP route
 *  for creating one - only for ASSIGNING an existing one. Rather than teaching
 *  the program a new route for a test, the run opens a second handle on the same
 *  data. No second engine, no second connection pool, no second worker to stop.
 *
 *  `new Store(db)` rather than `createEngine`: the program already ran
 *  `ensureSchema`, and running it a second time is what pg-mem trips over (it
 *  does not accept the additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
 *  form). The schema is there - this handle only writes rows.
 */
function createReferenceStore(db: Parameters<typeof createEngine>[0]["db"]): Store {
  return new Store(db);
}

describe.skipIf(!browserAvailable)("medienbedarf bis zur review (P2-2)", () => {
  it("baut die Seite, zeigt die drei Bedarfe und reicht am Ende zur Review ein", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-media-needs-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      // Der Lauf macht viele API-Aufrufe in kurzer Zeit (Seite, Referenz,
      // Vorschlag, drei Bedarfe, Review). Das Standard-Fass reicht fuer einen
      // Menschen, nicht fuer eine Maschine.
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const call = async (method: string, path: string, body?: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const post = (path: string, body?: unknown): Promise<Response> => call("POST", path, body);

    // The image endpoint comes up BEFORE the program, because the settings that
    // point at it are written through the program's own route.
    const imageEndpoint = await startImageEndpoint();

    const browser = await chromium.launch({ headless: true });
    const consoleErrors: string[] = [];
    const shotDir = resolve(process.cwd(), ".scratch/refs/nick/media-needs");
    mkdirSync(shotDir, { recursive: true });

    // The provider is configured the way a user would configure it: through the
    // settings route, with a URL. The run therefore exercises the settings
    // validation, the provider construction and the request path - not just the
    // part that happens to be under test.
    //
    // `customFormat` names the provider's WIRE FORMAT, not a file extension
    // (`minimax` / `openai`). Sending "png" there is what the schema refuses,
    // and the refusal is the point of putting the value through the real route.
    const settings = await call("PUT", "/api/settings", {
      image: {
        provider: "custom",
        customBaseUrl: imageEndpoint.origin,
        customModel: "test-bild",
        customApiKey: "test-schluessel",
        customFormat: "openai",
      },
    });
    // The message rides along: a settings rejection names the field, and that
    // is the difference between a fixable test and a guessing game.
    expect(
      settings.status,
      `settings: ${settings.status} ${await settings.clone().text()}`,
    ).toBe(200);

    try {
      // A source site with a page whose hero references an asset that no longer
      // exists: that is what makes the plan ask for a picture. A second
      // reference asset gives a second `generate`, and a third broken reference
      // gives the `select`.
      const source = (await (await post("/api/sites", { name: "Quelle Medienbedarf" })).json()) as {
        id: string;
      };
      const sourcePage = (await (
        await post(`/api/sites/${source.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };

      // Two media sections pointing at assets that are not in the library, and
      // one reference profile that carries a non-identity asset. The plan turns
      // the first two into `select`/`generate` needs and the reference asset into
      // a `generate` need of its own.
      const seeded = await post(`/api/pages/${sourcePage.id}/mutations`, {
        baseDraftVersion: sourcePage.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: sourcePage.draft.rootNodeId },
            node: {
              id: "media-a",
              type: "media",
              props: { asset: { assetId: "fehlt-1" }, caption: "Werkstatt" },
            },
          },
          {
            op: "insertNode",
            parent: { nodeId: sourcePage.draft.rootNodeId },
            node: {
              id: "media-b",
              type: "media",
              props: { asset: { assetId: "fehlt-2" }, caption: "Atelier" },
            },
          },
        ],
      });
      expect(seeded.status).toBe(200);

      // The reference carries a photo that is style evidence, not identity - so
      // the plan asks for its OWN picture instead of copying the reference's.
      // That is the second `generate` need the gate asks for.
      //
      // A reference is not created over HTTP: the routes under `/references`
      // ASSIGN an existing one from the library. The reference and its profile
      // are written through the store, which is where the library writes them
      // too - the run is a browser run, not a test of reference creation.
      //
      // A second store on the SAME database, not a second engine: the program
      // holds one connection pool, this handle writes through the same data,
      // and there is no second worker to shut down.
      const store = createReferenceStore(database.db);
      // The reference needs a REAL image, as a SNAPSHOT. The proposal refuses to
      // build a direction from a reference without a stored picture - a
      // direction card is a screenshot, and a screenshot of nothing is not a
      // direction. `previewPath` is what makes the snapshot "viewable" to the
      // card selector, so it is set, and the bytes behind `storageRef` exist.
      const referenceShotRef = join("references", "vorbild.png");
      const referenceShot = resolve(dataDir, referenceShotRef);
      mkdirSync(dirname(referenceShot), { recursive: true });
      writeFileSync(referenceShot, PNG_1PX);
      const referenceRow = await store.createReference({
        name: "Vorbild Fotografie",
        sourceUrl: "https://example.invalid/vorbild",
        method: "manual",
        provenance: PROVENANCE,
      });
      // The snapshot comes second, through the update: `createReference` writes
      // the row, the capture writes the picture. `previewPath` is what makes the
      // snapshot "viewable" to the card selector, and the bytes behind
      // `storageRef` have to exist for the card freeze to copy them.
      await store.updateReference(referenceRow.id, {
        snapshots: [
          {
            breakpoint: "desktop",
            width: 1,
            height: 1,
            // The card picks its image by slot order, hero first - so
            // `hero-desktop` is the one the proposal will freeze.
            kind: "hero-desktop",
            storageRef: referenceShotRef,
            hash: PROVENANCE.hash,
            previewPath: "/api/references/vorbild/preview",
          },
        ],
      });
      await store.createReferenceProfileRevision({
        referenceId: referenceRow.id,
        profile: {
          tokens: {
            color: [token("#123456", "primary"), token("#ffffff", "surface")],
            type: [
              {
                role: "body",
                size: "16px",
                lineHeight: "1.5",
                weight: 400,
                uses: 1,
                where: ["body"],
                level: "inferred",
              },
            ],
            families: [token("Inter", "body")],
            space: [token("8px", "base")],
            radius: [],
            shadow: [],
          },
          breakpoints: [640, 1024],
          customProperties: [],
          motion: [],
          surfaces: [],
          libraries: [],
          // The image that makes the plan ask for a picture of its own. The kind
          // is `image`, not `logo`: a logo carries an identity risk and the plan
          // would mark it `avoid`, which produces no need at all.
          assets: [
            {
              kind: "image",
              ref: "assets/vorbild-hero.png",
              where: ["hero"],
              identityRisk: false,
            },
          ],
          components: [],
          families: ["body"],
          vocabulary: [],
          rules: { constants: [], never: [] },
          styleBrief: "ruhige Fotografie, viel Weissraum",
          guardrails: [],
          reduced: false,
        },
        evidence: [],
        provenance: PROVENANCE,
        author: { kind: "human" as const, id: "programm", label: "Programm" },
        note: null,
      });
      const referenceId = referenceRow.id;

      // No `author` in the body: the author comes from the token, exactly like
      // in the product. A body that carries one is refused by the schema, which
      // is what makes a client-supplied author impossible.
      const created = await post(`/api/pages/${sourcePage.id}/redesign-proposals`, {
        referenceIds: [referenceId],
        // Every write route takes an idempotency key. A test that leaves it out
        // gets a validation error, which is the engine behaving correctly - the
        // key is what keeps a retried proposal from creating a second one.
        idempotencyKey: "media-needs-browser-1",
      });
      // The create route answers with the whole proposal, cards included, under
      // a `proposal` key. Reading the create body is enough - asking the read
      // route as well would only prove that the two agree, which is the read
      // route's own test's job.
      const createdText = await created.clone().text();
      const createdBody = JSON.parse(createdText) as {
        proposal?: { id: string; cards?: unknown[] };
        id?: string;
        cards?: unknown[];
      };
      const proposalRow = createdBody.proposal ?? {
        id: createdBody.id ?? "",
        cards: createdBody.cards,
      };
      const proposalId = proposalRow.id;
      const cards = (proposalRow.cards ?? []) as {
        id: string;
        sectionPlan: { media: { treatment: string }[] } | null;
      }[];
      expect(cards.length, `Karten: ${createdText}`).toBeGreaterThan(0);

      // The plan really does carry needs - otherwise the run would prove nothing
      // about a dialog that had nothing to show.
      //
      // Two needs, not three, and the reason is worth stating: the plan keys its
      // media by the PROP PATH, not by node. Both broken `media` sections carry
      // the same path (`media.asset`), so the second one is folded into the first
      // need. That is the plan doing its job - one missing picture, one slot to
      // fill - and a test that demanded three would be demanding a bug.
      const plan = cards[0]?.sectionPlan;
      const needs = plan?.media ?? [];
      expect(
        needs.length,
        `Medien im Plan: ${JSON.stringify(plan?.media ?? [])}`,
      ).toBeGreaterThanOrEqual(2);
      const treatments = new Set(needs.map((need) => need.treatment));
      // `select` for a source asset that is gone, `generate` for the
      // reference's own picture. Both are what the panel has to answer.
      expect(treatments.has("select")).toBe(true);
      expect(treatments.has("generate")).toBe(true);

      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(String(error)));
      // The console message for a failed request is just "Failed to load
      // resource" - the URL lives on the request. Collecting the response as
      // well turns four identical lines into four names, which is the
      // difference between "there is a 404" and "there is a 404 on /favicon.ico".
      const failedRequests: string[] = [];
      page.on("response", (response) => {
        if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
      });

      // The redesign inbox is a hint in the EDITOR's toolbar (ADR-0012): it only
      // appears while a proposal waits for a human, and it never opens by
      // itself. So the run goes to the source page, not to the project list -
      // the same place an agent's proposal lands for the operator to answer.
      await page.goto(`${running.dashboardUrl}/#/projects/${source.id}/pages/${sourcePage.id}`);
      await expect
        .poll(async () => page.locator('[data-action="redesign-inbox-open"]').count(), { timeout: 30000 })
        .toBeGreaterThan(0);
      await page.locator('[data-action="redesign-inbox-open"]').first().click();
      await expect
        .poll(async () => page.locator('[data-role="redesign-dialog"]').count(), { timeout: 15000 })
        .toBeGreaterThan(0);
      // The read-only preview of the needs is already on the direction card.
      // No `toBeVisible()`: the project has no DOM lib, so the other browser
      // tests read the DOM inside the page and assert on plain data here. The
      // same trick keeps this file free of casts that would only satisfy the
      // compiler.
      expect(
        await page.locator('[data-role="redesign-media-need"]').count(),
      ).toBeGreaterThan(0);

      // Pick the direction and confirm. This is the moment the apply runs.
      await page.locator('input[type="radio"][name="redesign-direction"]').first().check();
      await page.locator('[data-action="redesign-confirm"]').click();

      // The dialog must NOT have closed into the draft page: the apply left
      // needs open, and the operator still has work in front of them.
      //
      // The wait is on the ROWS, not on the dialog: `openMediaNeedPanel` awaits
      // the asset list before it renders anything, so the dialog appears a beat
      // before its content does. Waiting on the dialog would pass a fraction of
      // a second early and then count zero rows.
      //
      // If the rows never come, the engine's own answer is the useful thing to
      // print: a run where the apply reported no needs at all is a product
      // problem, and a run where it reported some but the panel is empty is a
      // different one. Neither should surface as a bare `expected 0`.
      await expect
        .poll(
          async () => {
            const rows = await page.locator('[data-role="media-need"]').count();
            if (rows > 0) return rows;
            // The panel can fail for a reason of its own, and the console knows
            // which. Surfacing it here turns "the panel is empty" into "the
            // panel threw", which is a completely different bug to chase.
            if (consoleErrors.length > 0) throw new Error(`Browser-Fehler: ${consoleErrors.join(" | ")}`);
            const body = (await (
              await call("GET", `/api/redesign-proposals/${proposalId}`)
            ).json()) as {
              applyResult?: { openMediaNeeds?: unknown[]; status?: string } | null;
              proposal?: { applyResult?: { openMediaNeeds?: unknown[]; status?: string } | null };
            };
            const applied = body.applyResult ?? body.proposal?.applyResult ?? null;
            const needs = applied?.openMediaNeeds ?? [];
            return needs.length > 0 ? -needs.length : -1;
          },
          { timeout: 30000 },
        )
        .toBeGreaterThan(0);
      const needRows = page.locator('[data-role="media-need"]');
      // The panel shows what the apply reported. `>= 2` rather than an exact
      // number: the panel's job is to show every open need, and the count itself
      // is the plan's business, already checked above.
      expect(await needRows.count()).toBeGreaterThanOrEqual(2);
      await page.screenshot({ path: join(shotDir, "01-medienbedarf.png") });

      // Every need names its slot, and every `generate` need shows its prompt -
      // the human decides about the cost BEFORE the image exists.
      // The attributes are read INSIDE the page and returned as plain strings,
      // because the project's tsconfig has no DOM lib.
      const needIds = (await page.locator('[data-role="media-need"]').evaluateAll(
        (rows) =>
          rows.map((row) =>
            (row as unknown as { getAttribute(name: string): string | null }).getAttribute("data-need") ?? "",
          ),
      )) as string[];
      expect(needIds.every((id) => id !== "")).toBe(true);
      expect(new Set(needIds).size).toBe(needIds.length);
      const promptCount = await page.locator('[data-role="media-need-prompt"]').count();
      expect(promptCount).toBeGreaterThan(0);
      for (const prompt of await page.locator('[data-role="media-need-prompt"]').allTextContents()) {
        expect(prompt.trim().length).toBeGreaterThan(8);
      }

      // Two different answers for two different needs, and the order is fixed
      // by the treatment rather than by position: the `select` need is decided
      // as `manual` (the human leaves that slot empty on purpose), the
      // `generate` need gets an image. A dialog that answered both the same way
      // would not be a dialog, it would be a form.
      const selectNeed = (await page
        .locator('[data-role="media-need"][data-treatment="select"]')
        .first()
        .getAttribute("data-need")) as string;
      expect(selectNeed, "kein select-Bedarf im Panel").not.toBe("");
      await page
        .locator(`[data-role="media-need"][data-need="${selectNeed}"] [data-action="media-need-manual"]`)
        .click();
      await expect
        .poll(
          async () =>
            page.locator(`[data-role="media-need"][data-need="${selectNeed}"]`).getAttribute("data-state"),
          { timeout: 10000 },
        )
        .toBe("manual");
      await page.screenshot({ path: join(shotDir, "02-vor-generate.png") });

      // The generate path, on the `generate` need specifically. The local
      // endpoint answers immediately, so this is a job that runs while the
      // dialog waits - the same shape as a real one, only faster.
      const generateNeed = (await page
        .locator('[data-role="media-need"][data-treatment="generate"]')
        .first()
        .getAttribute("data-need")) as string;
      expect(generateNeed, "kein generate-Bedarf im Panel").not.toBe("");
      await page
        .locator(`[data-role="media-need"][data-need="${generateNeed}"] [data-action="media-need-generate"]`)
        .click();
      // The panel's own error line is the fastest way to see WHY a generation
      // did not finish. It is read only when the wait fails, so the happy path
      // stays silent and the failure stays legible.
      try {
        await expect
          .poll(
            async () =>
              page.locator(`[data-role="media-need"][data-need="${generateNeed}"]`).getAttribute("data-state"),
            { timeout: 90000 },
          )
          .toBe("generated");
      } catch (error) {
        const panelError = await page
          .locator('[data-role="media-needs-error"]')
          .textContent()
          .catch(() => "");
        // The job row says where it stopped: `queued` (the worker never got to
        // it), `running` (the provider call hangs) or `failed` (with the
        // provider's own message). Those are three different bugs, and the
        // panel's text alone cannot tell them apart.
        const appliedBody = (await (
          await call("GET", `/api/redesign-proposals/${proposalId}`)
        ).json()) as {
          applyResult?: { siteId?: string | null } | null;
          proposal?: { applyResult?: { siteId?: string | null } | null };
        };
        const appliedSite =
          appliedBody.applyResult?.siteId ?? appliedBody.proposal?.applyResult?.siteId;
        const jobs =
          typeof appliedSite === "string"
            ? await call("GET", `/api/sites/${appliedSite}/images/jobs`).then((r) => r.text())
            : "(keine Zielsite)";
        throw new Error(
          `${String(error)} — Panel: ${panelError ?? "(leer)"} — Jobs: ${jobs.slice(0, 600)}`,
        );
      }
      await page.screenshot({ path: join(shotDir, "02b-generiert.png") });

      await page.locator('[data-action="media-needs-done"]').click();
      // Everything is answered, so the dialog hands over to the draft page.
      await expect
        .poll(async () => page.locator('[data-role="media-needs-dialog"]').count(), { timeout: 20000 })
        .toBe(0);
      await expect
        .poll(async () => page.url().includes(`/pages/`), { timeout: 20000 })
        .toBe(true);
      await page.screenshot({ path: join(shotDir, "03-nach-bedienung.png") });

      // The engine agrees the needs are gone. This is the assertion that ties
      // the dialog to the state: the panel is not a local counter.
      const readApplied = async (): Promise<{ openMediaNeeds: unknown[]; siteId: string | null } | null> => {
        const body = (await (
          await call("GET", `/api/redesign-proposals/${proposalId}`)
        ).json()) as {
          applyResult?: { openMediaNeeds: unknown[]; siteId: string | null } | null;
          proposal?: { applyResult?: { openMediaNeeds: unknown[]; siteId: string | null } | null };
        };
        return body.applyResult ?? body.proposal?.applyResult ?? null;
      };
      const stored = await readApplied();
      expect(stored?.openMediaNeeds ?? []).toEqual([]);
      // The apply named the site it built into. That is the one the report and
      // the review belong to - NOT the source site, which is untouched.
      const targetSiteId = stored?.siteId;
      expect(typeof targetSiteId).toBe("string");
      expect(targetSiteId).not.toBe(source.id);

      // And the design report sees nothing open either - the needs were visible
      // in the report while they were open, and are gone now.
      const report = (await (
        await call("GET", `/api/sites/${targetSiteId as string}/design-report`)
      ).json()) as { openMediaNeeds: unknown[] };
      expect(report.openMediaNeeds).toEqual([]);

      // The run reaches the review handoff: this is the last step of the gate.
      // The author comes from the token, so the body carries only the note.
      //
      // The status is `submitted`, not `open`: a review is submitted first and
      // only then approved. Asserting the wrong word here would have made the
      // test name a state the product never has.
      const submitted = await post(`/api/sites/${targetSiteId as string}/reviews`, {
        note: "Bitte pruefen",
      });
      expect(submitted.status, `review: ${await submitted.clone().text()}`).toBe(201);
      const review = JSON.parse(await submitted.text()) as {
        review: { id: string; status: string };
        preview?: { token: string };
      };
      expect(review.review.status).toBe("submitted");
      // And the review carries a preview, so a human can look before approving.
      expect(review.preview?.token).toBeTruthy();
      await page.screenshot({ path: join(shotDir, "04-review.png"), fullPage: true });

      // The console must be clean - no unhandled rejection, no failed request.
      // The request list is in the message because "Failed to load resource"
      // without a URL cannot be acted on, and a run that fails here with four
      // identical lines teaches nobody anything.
      //
      // The two assets this run seeds as MISSING are allowed to 404, and only
      // those: the source page points at them on purpose, and the browser
      // asking for a picture it was told to expect is the whole premise. A
      // missing image renders as a broken image, not as a console error in the
      // product - the console lines are the browser's, and the run can only
      // read them. Anything else here is a real failure.
      const erlaubt = new Set(["/assets/fehlt-1", "/assets/fehlt-2"]);
      const echteFehler = failedRequests.filter((zeile) => {
        const url = zeile.slice(zeile.indexOf(" ") + 1);
        const pfad = new URL(url).pathname;
        return ![...erlaubt].some((nichtFehler) => pfad === nichtFehler);
      });
      // The browser logs one console line per failed image load, without a URL,
      // and it logs it again on every re-render. The same missing asset can
      // therefore produce several lines - so the console is not counted but
      // FILTERED: what remains must be a product error, and the image lines are
      // checked against the request list, which does carry the URL.
      const echteKonsolenFehler = consoleErrors.filter(
        (zeile) => !zeile.includes("Failed to load resource"),
      );
      expect(echteKonsolenFehler, `Konsole:\n${echteKonsolenFehler.join("\n")}`).toEqual([]);
      // The image lines and the 404s have to match up: one console line per
      // failed request would mean the browser is complaining about something
      // the server never refused.
      const bildZeilen = consoleErrors.filter((zeile) =>
        zeile.includes("Failed to load resource"),
      ).length;
      expect(bildZeilen, `Bild-404er: ${bildZeilen}, Anfragen: ${failedRequests.length}`).toBe(
        failedRequests.length,
      );
      expect(echteFehler, `Fehlgeschlagene Anfragen:\n${echteFehler.join("\n")}`).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      await imageEndpoint.close();
    }
  }, 240000);
});
