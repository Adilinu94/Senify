import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  assertPublicHttpUrl,
  fetchPublic,
  isFetchBlockedPort,
  isPublicAddress,
  listenReachable,
} from "@senify/core/net";

// The suite runs with SENIFY_ALLOW_PRIVATE_URLS=1 (vitest.config.ts) because
// many tests import from a local server. These tests switch it off on purpose.
const strict = (): void => {
  vi.stubEnv("SENIFY_ALLOW_PRIVATE_URLS", "");
};

describe("isPublicAddress", () => {
  it("accepts public addresses and the edges next to private ranges", () => {
    for (const address of [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "172.15.255.255",
      "172.32.0.0",
      "100.63.255.255",
      "100.128.0.0",
      "198.17.255.255",
      "198.20.0.0",
      "2606:4700:4700::1111",
      "2a00:1450:4001:81b::200e",
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it("refuses loopback, private, link-local, shared, reserved and multicast ranges", () => {
    for (const address of [
      "0.0.0.0",
      "127.0.0.1",
      "127.255.255.254",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "100.127.255.255",
      "192.0.2.1",
      "198.18.0.1",
      "198.19.255.255",
      "203.0.113.9",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12:3456:789a::1",
      "ff02::1",
      "2001:db8::1",
      // IPv4 wrapped in IPv6: the embedded address decides.
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:10.1.2.3",
      "::127.0.0.1",
      "64:ff9b::7f00:1",
      "2002:7f00:1::",
      "2001:0:4136:e378:8000:63bf:3fff:fdd2",
      "not-an-address",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });
});

describe("assertPublicHttpUrl", () => {
  it("refuses what is not a public http(s) address", async () => {
    strict();
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com/",
      "javascript:alert(1)",
      "not a url",
      "http://user:secret@example.com/",
      "http://127.0.0.1:4322/api/sites",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://169.254.169.254/latest/meta-data/",
      // The URL parser turns these spellings into 127.0.0.1.
      "http://2130706433/",
      "http://0x7f.1/",
      "http://017700000001/",
      "http://localhost:1/",
    ]) {
      await expect(assertPublicHttpUrl(url), url).rejects.toMatchObject({
        category: "validation",
      });
    }
    vi.unstubAllEnvs();
  });

  it("accepts a public literal without any network access", async () => {
    strict();
    expect((await assertPublicHttpUrl("https://8.8.8.8/x?y=1")).hostname).toBe("8.8.8.8");
    vi.unstubAllEnvs();
  });

  it("lets the operator opt in to private targets, but never to other schemes", async () => {
    vi.stubEnv("SENIFY_ALLOW_PRIVATE_URLS", "1");
    expect((await assertPublicHttpUrl("http://127.0.0.1:1/")).port).toBe("1");
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toMatchObject({
      category: "validation",
    });
    vi.unstubAllEnvs();
  });
});

describe("fetchPublic", () => {
  let server: Server;
  let origin = "";
  let hits = 0;

  beforeAll(async () => {
    server = createServer((request, response) => {
      hits += 1;
      const path = request.url ?? "/";
      if (path === "/start") {
        response.writeHead(302, { location: "/final" }).end();
      } else if (path === "/final") {
        response.writeHead(200, { "content-type": "text/plain" }).end("angekommen");
      } else if (path === "/loop") {
        response.writeHead(302, { location: "/loop" }).end();
      } else if (path === "/to-file") {
        response.writeHead(302, { location: "file:///etc/passwd" }).end();
      } else if (path === "/gz") {
        response
          .writeHead(200, { "content-encoding": "gzip", "content-type": "text/plain" })
          .end(gzipSync("entpackt"));
      } else if (path === "/big") {
        // Explicit length: writeHead() before end() would otherwise make it chunked.
        response
          .writeHead(200, { "content-type": "text/plain", "content-length": 4096 })
          .end("x".repeat(4096));
      } else if (path === "/chunked") {
        response.writeHead(200, { "content-type": "text/plain" });
        response.write("x".repeat(2048));
        setTimeout(() => response.end("x".repeat(2048)), 20);
      } else if (path === "/empty") {
        response.writeHead(204).end();
      } else {
        response.writeHead(404).end("weg");
      }
    });
    await new Promise<void>((done) => listenReachable(server, 0, "127.0.0.1").then(() => done()));
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
  });

  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  it("never reaches a private target unless the operator allows it", async () => {
    strict();
    hits = 0;
    await expect(fetchPublic(`${origin}/final`)).rejects.toMatchObject({
      category: "validation",
    });
    expect(hits).toBe(0);
    vi.unstubAllEnvs();
  });

  it("follows redirects and returns a normal Response", async () => {
    const response = await fetchPublic(`${origin}/start`);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("angekommen");
    expect((await fetchPublic(`${origin}/nope`)).ok).toBe(false);
    expect((await fetchPublic(`${origin}/empty`)).status).toBe(204);
  });

  it("stops redirect loops and re-checks every hop", async () => {
    await expect(fetchPublic(`${origin}/loop`)).rejects.toMatchObject({
      category: "validation",
      message: expect.stringContaining("redirects"),
    });
    await expect(fetchPublic(`${origin}/to-file`)).rejects.toMatchObject({
      category: "validation",
      message: expect.stringContaining("scheme"),
    });
  });

  it("decodes gzip", async () => {
    expect(await (await fetchPublic(`${origin}/gz`)).text()).toBe("entpackt");
  });

  it("refuses bodies over the limit, declared or streamed", async () => {
    await expect(fetchPublic(`${origin}/big`, { maxBytes: 1024 })).rejects.toMatchObject({
      category: "validation",
    });
    const streamed = await fetchPublic(`${origin}/chunked`, { maxBytes: 1024 });
    await expect(streamed.arrayBuffer()).rejects.toThrow();
    expect((await (await fetchPublic(`${origin}/big`, { maxBytes: 8192 })).text()).length).toBe(4096);
  });

  it("honours an abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchPublic(`${origin}/final`, { signal: controller.signal })).rejects.toThrow();
  });
});

describe("listenReachable", () => {
  it("knows the fetch-blocked ports", () => {
    expect(isFetchBlockedPort(6000)).toBe(true);
    expect(isFetchBlockedPort(6667)).toBe(true);
    expect(isFetchBlockedPort(8080)).toBe(false);
  });

  it("re-binds port 0 until the OS picks a reachable port", async () => {
    // A stand-in for an OS whose ephemeral range starts at 1024 (Windows here).
    const ports = [6000, 6667, 50123];
    let listening = 0;
    const server = {
      once: vi.fn(),
      removeListener: vi.fn(),
      listen: vi.fn((_port: number, _host: string, cb: () => void) => {
        listening += 1;
        cb();
      }),
      address: () => ({ port: ports[listening - 1] ?? 0 }),
      close: vi.fn((cb: () => void) => cb()),
    } as unknown as Parameters<typeof listenReachable>[0];
    expect(await listenReachable(server, 0, "127.0.0.1")).toBe(50123);
    expect(server.close).toHaveBeenCalledTimes(2);
  });

  it("binds a real socket that fetch can reach", async () => {
    const real = createServer((_req, res) => res.end("ok"));
    const port = await listenReachable(real, 0, "127.0.0.1");
    try {
      expect(isFetchBlockedPort(port)).toBe(false);
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe("ok");
    } finally {
      await new Promise<void>((resolve) => real.close(() => resolve()));
    }
  });
});
