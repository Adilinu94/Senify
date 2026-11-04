import { describe, expect, it, vi } from "vitest";
import type { Engine, EngineServer } from "@senify/engine";
import { listenForFetch } from "./helpers.ts";

describe("engine test listener", () => {
  it("retries a port rejected by fetch and closes the rejected listener", async () => {
    const closed = vi.fn(async () => {});
    const first: EngineServer = { origin: "http://127.0.0.1:6000", port: 6000, close: closed };
    const second: EngineServer = { origin: "http://127.0.0.1:50001", port: 50001, close: vi.fn(async () => {}) };
    const engine = { listen: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) } as Pick<Engine, "listen">;
    const probe = vi.fn(async (origin: string) => {
      if (origin === first.origin) throw new TypeError("fetch failed", { cause: new Error("bad port") });
    });
    expect(await listenForFetch(engine, probe)).toBe(second);
    expect(closed).toHaveBeenCalledOnce();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("does not hide other listener errors", async () => {
    const close = vi.fn(async () => {});
    const server: EngineServer = { origin: "http://127.0.0.1:50001", port: 50001, close };
    const engine = { listen: vi.fn().mockResolvedValue(server) } as Pick<Engine, "listen">;
    await expect(listenForFetch(engine, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(close).toHaveBeenCalledOnce();
  });
});
