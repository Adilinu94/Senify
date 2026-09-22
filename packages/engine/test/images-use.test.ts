import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  createImageUseProvider,
  defaultImageProviders,
  type ImageProviderFailureKind,
  type ImageSettings,
  type ImageUseProcess,
  type ImageUseProcessResult,
} from "@senify/engine";

// Prüfstelle 1: image generation S6 — the image-use CLI wrapper. The process
// is injected, so no test ever spawns Python or talks to a subscription.

const CLI = "C:/tools/image-use/image-use";

async function pngBytes(width = 64, height = 64): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 30, g: 120, b: 200, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

type FakeCall = { file: string; args: string[]; env: NodeJS.ProcessEnv };

// generate() pre-warms the chrome-use daemon; tests inject a no-op so nothing
// ever touches a real browser.
const noPrewarm = async (): Promise<void> => {};

function fakeProcess(
  handler: (args: string[]) => ImageUseProcessResult | Promise<ImageUseProcessResult>,
): { run: ImageUseProcess; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  return {
    calls,
    run: async (file, args, options) => {
      calls.push({ file, args, env: options.env });
      return handler(args);
    },
  };
}

function config(cliPath = CLI): Parameters<typeof createImageUseProvider>[0] {
  return { cliPath, timeoutMinutes: 30, maxPixels: 1_048_576, pythonPath: "python" };
}

function imageSettings(overrides: Partial<ImageSettings> = {}): ImageSettings {
  return {
    provider: "image-use",
    fallbackProvider: "comfyui",
    cooldownMinutes: 60,
    cliPath: CLI,
    baseUrl: "http://127.0.0.1:8188",
    diffusionModel: "unet.gguf",
    textEncoder: "encoder.safetensors",
    vae: "vae.safetensors",
    defaultSteps: 40,
    maxPixels: 1_048_576,
    timeoutMinutes: 60,
    customBaseUrl: "https://api.minimax.io/v1",
    customModel: "image-01",
    customFormat: "minimax",
    customApiKeyEncrypted: null,
    ...overrides,
  };
}

const missingDir = mkdtempSync(join(tmpdir(), "senify-image-use-missing-"));
const cliDir = mkdtempSync(join(tmpdir(), "senify-image-use-cli-"));
const cliFile = join(cliDir, "image-use");
writeFileSync(cliFile, "#!/usr/bin/env python3\n");

afterAll(() => {
  rmSync(missingDir, { recursive: true, force: true });
  rmSync(cliDir, { recursive: true, force: true });
});

describe("image-use provider: generate", () => {
  it("runs the CLI with the web backend and reports the real file size", async () => {
    const bytes = await pngBytes(64, 48);
    let target = "";
    const fake = fakeProcess(async (args) => {
      target = argValue(args, "-o") ?? "";
      writeFileSync(target, bytes);
      return { code: 0, stdout: `${target}\n`, stderr: "[ 12.3s] generating\n" };
    });
    const provider = createImageUseProvider(config(), { process: fake.run, prewarm: noPrewarm });

    const result = await provider.generate(
      { prompt: "a teapot", width: 512, height: 512, steps: 40, seed: 9 },
      { timeoutMs: 30 * 60_000 },
    );

    expect(result.bytes.equals(bytes)).toBe(true);
    expect(result.mime).toBe("image/png");
    // The web surface decides the pixel size; the wrapper reports the file.
    expect(result.width).toBe(64);
    expect(result.height).toBe(48);
    expect(result.seed).toBe(9);

    const call = fake.calls[0];
    expect(call?.file).toBe("python");
    expect(call?.args[0]).toBe(CLI);
    expect(call?.args[1]).toBe("a teapot");
    expect(argValue(call?.args ?? [], "--size")).toBe("512x512");
    expect(argValue(call?.args ?? [], "--backend")).toBe("web");
    expect(argValue(call?.args ?? [], "--format")).toBe("png");
    expect(call?.args).toContain("--quiet");
    expect(Number(argValue(call?.args ?? [], "--timeout"))).toBeGreaterThan(60);
    // Windows fix: the CLI crashes on cp1252 without this.
    expect(call?.env.PYTHONIOENCODING).toBe("utf-8");

    // The temp file is cleaned up after the run.
    expect(target).not.toBe("");
    expect(existsSync(target)).toBe(false);
  });

  it("classifies the CLI failures into the chain categories", async () => {
    const cases: [string, ImageProviderFailureKind][] = [
      ["chatgpt.com rate-limited this account ('Too many requests')", "quota"],
      ["HTTP 429: quota exhausted for today", "quota"],
      ["no image returned. events seen: ['response.created']", "refusal"],
      ["timed out: no image within the 300s total budget (last phase: generating)", "timeout"],
      ["stalled: the image backend sent no data for ~120s (last phase: submitting)", "timeout"],
      ["`chrome-use` is not installed — curl -fsSL …", "unavailable"],
      ["relay is not connected; start Chrome first", "unavailable"],
      ["boom: unexpected traceback", "generation"],
    ];
    for (const [stderr, kind] of cases) {
      const fake = fakeProcess(() => ({ code: 1, stdout: "", stderr }));
      const provider = createImageUseProvider(config(), { process: fake.run, prewarm: noPrewarm });
      await expect(
        provider.generate({ prompt: "x", width: 512, height: 512, steps: 5 }, { timeoutMs: 60_000 }),
      ).rejects.toMatchObject({ kind, provider: "image-use" });
    }
  });

  it("treats a killed process as a timeout and a spawn error as unavailable", async () => {
    const killed = fakeProcess(() => ({
      code: null,
      stdout: "",
      stderr: "",
      timedOut: true,
    }));
    const timeoutProvider = createImageUseProvider(config(), {
      process: killed.run,
      prewarm: noPrewarm,
    });
    await expect(
      timeoutProvider.generate(
        { prompt: "x", width: 512, height: 512, steps: 5 },
        { timeoutMs: 60_000 },
      ),
    ).rejects.toMatchObject({ kind: "timeout" });

    const broken = fakeProcess(() => ({
      code: null,
      stdout: "",
      stderr: "",
      spawnError: "spawn python ENOENT",
    }));
    const unavailableProvider = createImageUseProvider(config(), {
      process: broken.run,
      prewarm: noPrewarm,
    });
    await expect(
      unavailableProvider.generate(
        { prompt: "x", width: 512, height: 512, steps: 5 },
        { timeoutMs: 60_000 },
      ),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("pre-warms the chrome-use session before the CLI runs", async () => {
    const order: string[] = [];
    const fake = fakeProcess(async (args) => {
      order.push("cli");
      const target = argValue(args, "-o") ?? "";
      writeFileSync(target, await pngBytes(32, 32));
      return { code: 0, stdout: `${target}\n`, stderr: "" };
    });
    const provider = createImageUseProvider(config(), {
      process: fake.run,
      prewarm: async () => {
        order.push("prewarm");
      },
    });
    await provider.generate(
      { prompt: "a teapot", width: 512, height: 512, steps: 5 },
      { timeoutMs: 60_000 },
    );
    expect(order).toEqual(["prewarm", "cli"]);
  });

  it("rejects invalid input without starting the CLI", async () => {
    const fake = fakeProcess(() => ({ code: 0, stdout: "", stderr: "" }));
    let prewarmed = 0;
    const provider = createImageUseProvider(config(), {
      process: fake.run,
      prewarm: async () => {
        prewarmed += 1;
      },
    });
    await expect(
      provider.generate({ prompt: "", width: 512, height: 512, steps: 5 }, { timeoutMs: 5_000 }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    await expect(
      provider.generate({ prompt: "x", width: 100, height: 512, steps: 5 }, { timeoutMs: 5_000 }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    expect(fake.calls).toHaveLength(0);
    expect(prewarmed).toBe(0);
  });
});

describe("image-use provider: health", () => {
  it("reports a missing CLI as a clean state with a setup hint", async () => {
    const provider = createImageUseProvider(config(join(missingDir, "image-use")));
    const health = await provider.health();
    expect(health.ok).toBe(false);
    expect(health.built).toBe(true);
    expect(health.detail).toContain("nicht gefunden");
  });

  it("parses doctor output: relay up wins over the profile false-negative", async () => {
    const doctor = [
      "image-use doctor",
      "",
      "  [ok]    python     3.13.15",
      "  [ok]    version    0.29.1 (latest)",
      "",
      "  web backend:",
      "  [ok]    chrome-use 1.5.131",
      "  [ok]    relay      connected (drives your open Chrome)",
      "  [fail]  profiles   none detected — sign in to chatgpt.com",
      "",
      "  → auto would use: web  (spares Codex-usage)",
    ].join("\n");
    const fake = fakeProcess(() => ({ code: 0, stdout: doctor, stderr: "" }));
    const provider = createImageUseProvider(config(cliFile), { process: fake.run });
    const health = await provider.health();
    expect(health.ok).toBe(true);
    expect(health.detail).toContain("0.29.1");
    expect(health.detail).toContain("none detected");
    expect(fake.calls[0]?.args).toEqual([cliFile, "doctor"]);
  });

  it("reports a broken web backend with the doctor findings", async () => {
    const doctor = [
      "  web backend:",
      "  [fail]  chrome-use not installed — curl -fsSL …",
      "  [fail]  relay      not connected",
      "",
      "  → auto would use: codex  (web not available)",
    ].join("\n");
    const fake = fakeProcess(() => ({ code: 1, stdout: doctor, stderr: "" }));
    const provider = createImageUseProvider(config(cliFile), { process: fake.run });
    const health = await provider.health();
    expect(health.ok).toBe(false);
    expect(health.built).toBe(true);
    expect(health.detail).toContain("nicht bereit");
    expect(health.detail).toContain("chrome-use");
  });
});

describe("image-use provider: wiring", () => {
  it("is part of the default chain next to ComfyUI", () => {
    const providers = defaultImageProviders(imageSettings());
    expect(Object.keys(providers).sort()).toEqual(["comfyui", "custom", "image-use"]);
  });
});
