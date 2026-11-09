import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@senify/core/net", async (importOriginal) => ({
  ...await importOriginal<typeof import("@senify/core/net")>(),
  fetchPublic: fetchMock,
}));
import { runImport } from "../src/import.ts";

const ORIGIN = "https://example.framer.app/";
const PAGE = `<!doctype html><html><head><title>Beispiel</title>
<script type="module" data-framer-bundle src="/script_main.mjs"></script></head>
<body><div id="main" data-framer-hydrate-v2='{"routeId":"home"}'><p>Text</p></div></body></html>`;
const RUNTIME = `globalThis.__framerRuntime = document.getElementById("main");`;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: string | URL) => {
    const url = String(input);
    if (url === ORIGIN) return new Response(PAGE, { status: 200 });
    if (url === `${ORIGIN}script_main.mjs`) return new Response(RUNTIME, { status: 200 });
    throw new Error(`Unexpected fixture URL: ${url}`);
  });
});

describe("URL import output", () => {
  it("does not fetch or bundle the page runtime for a structural import", async () => {
    const source = { kind: "url" as const, url: ORIGIN };
    const original = await runImport({ source, capture: "static" });
    expect(original.payloads.some((payload) => payload.scope === "page")).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/script_main.mjs"))).toBe(true);
    fetchMock.mockClear();
    const structural = await runImport({ source, capture: "static", output: "structure" });
    expect(structural.payloads.some((payload) => payload.scope === "page")).toBe(false);
    expect(structural.mapped.document.nodes["framer-runtime-payload"]).toBeUndefined();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/script_main.mjs"))).toBe(false);
    expect(structural.irHash).not.toBe(original.irHash);
    expect(structural.report.steps.join(" ")).toContain("nicht geprüft");
  });
});
