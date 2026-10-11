import { listenReachable } from "@senify/core/net";
import {
  createServer,
  type Server,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildQwenGraph,
  createComfyImageProvider,
  ImageProviderError,
  type ComfyImageConfig,
  type ImageSettings,
} from "@senify/engine";
import { bootEngine, type BootEnv } from "./helpers.ts";

// Prüfstelle 1: image generation S1 — the ComfyUI provider (graph, generate,
// health) against a stub server that speaks the ComfyUI HTTP surface, plus
// the settings roundtrip and the health route against the real engine. No
// test ever talks to a real ComfyUI.

type StubState = {
  requests: { method: string; url: string; body: unknown }[];
  history: Record<string, unknown>;
  models: { unet: string[]; clip: string[]; vae: string[] };
  viewBytes: Buffer;
  version: string;
};

function freshState(): StubState {
  return {
    requests: [],
    history: {},
    models: {
      unet: ["qwen-image-2.1-Q4_K_M.gguf"],
      clip: ["qwen3vl_8b_int8_convrot.safetensors"],
      vae: ["qwen_image_2.1_vae_bf16.safetensors"],
    },
    viewBytes: Buffer.from("stub-png-bytes"),
    version: "0.37.0",
  };
}

async function startComfyStub(
  state: StubState,
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      state.requests.push({
        method: req.method ?? "",
        url: req.url ?? "",
        body: raw === "" ? undefined : JSON.parse(raw),
      });
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === "/system_stats") {
        json(200, { system: { comfyui_version: state.version } });
        return;
      }
      if (url.pathname === "/object_info/UnetLoaderGGUF") {
        json(200, {
          UnetLoaderGGUF: { input: { required: { unet_name: [state.models.unet, {}] } } },
        });
        return;
      }
      if (url.pathname === "/object_info/CLIPLoader") {
        json(200, {
          CLIPLoader: { input: { required: { clip_name: [state.models.clip, {}] } } },
        });
        return;
      }
      if (url.pathname === "/object_info/VAELoader") {
        json(200, {
          VAELoader: { input: { required: { vae_name: [state.models.vae, {}] } } },
        });
        return;
      }
      if (url.pathname === "/prompt" && req.method === "POST") {
        json(200, { prompt_id: "stub-1", number: 1, node_errors: {} });
        return;
      }
      if (url.pathname === "/history/stub-1") {
        json(200, state.history);
        return;
      }
      if (url.pathname === "/view") {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(state.viewBytes);
        return;
      }
      json(404, { error: { message: "not found" } });
    });
  });
  return new Promise((resolve) => {
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function stubConfig(baseUrl: string): ComfyImageConfig {
  return {
    baseUrl,
    diffusionModel: "qwen-image-2.1-Q4_K_M.gguf",
    textEncoder: "qwen3vl_8b_int8_convrot.safetensors",
    vae: "qwen_image_2.1_vae_bf16.safetensors",
    defaultSteps: 40,
    maxPixels: 1_048_576,
    timeoutMinutes: 60,
  };
}

describe("Qwen graph", () => {
  it("builds the verified low-VRAM graph with the requested values", () => {
    const graph = buildQwenGraph(
      {
        diffusionModel: "unet.gguf",
        textEncoder: "encoder.safetensors",
        vae: "vae.safetensors",
      },
      { prompt: "a teapot", width: 512, height: 512, steps: 40, seed: 7 },
    );
    expect(graph["1"]?.class_type).toBe("UnetLoaderGGUF");
    expect(graph["1"]?.inputs.unet_name).toBe("unet.gguf");
    expect(graph["2"]?.inputs).toMatchObject({
      clip_name: "encoder.safetensors",
      type: "qwen_image",
      device: "cpu",
    });
    expect(graph["3"]?.inputs.vae_name).toBe("vae.safetensors");
    expect(graph["4"]?.inputs).toMatchObject({ prompt: "a teapot", resolution: 1024 });
    expect(graph["5"]?.inputs).toMatchObject({ width: 512, height: 512, batch_size: 1 });
    expect(graph["6"]?.inputs).toMatchObject({
      seed: 7,
      steps: 40,
      cfg: 1.0,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1.0,
    });
    expect(graph["6"]?.inputs.positive).toEqual(["4", 0]);
    expect(graph["6"]?.inputs.negative).toEqual(["4", 1]);
    expect(graph["7"]?.class_type).toBe("VAEDecodeTiled");
    expect(graph["8"]?.class_type).toBe("SaveImage");
  });
});

describe("ComfyUI provider", () => {
  it("submits the graph, polls the history and returns the image bytes", async () => {
    const state = freshState();
    state.history = {
      "stub-1": {
        status: { status_str: "success" },
        outputs: {
          "8": { images: [{ filename: "out.png", subfolder: "Senify", type: "output" }] },
        },
      },
    };
    const stub = await startComfyStub(state);
    try {
      const provider = createComfyImageProvider(stubConfig(stub.baseUrl));
      const result = await provider.generate(
        { prompt: "a teapot", width: 512, height: 512, steps: 5, seed: 11 },
        { timeoutMs: 30_000 },
      );
      expect(result.mime).toBe("image/png");
      expect(result.width).toBe(512);
      expect(result.height).toBe(512);
      expect(result.seed).toBe(11);
      expect(result.bytes.equals(state.viewBytes)).toBe(true);

      const submit = state.requests.find((entry) => entry.url === "/prompt");
      expect(submit).toBeDefined();
      const graph = (submit?.body as { prompt: Record<string, { inputs: Record<string, unknown> }> })
        .prompt;
      expect(graph["6"]?.inputs.steps).toBe(5);
      expect(graph["6"]?.inputs.seed).toBe(11);

      const view = state.requests.find((entry) => entry.url.startsWith("/view"));
      expect(view?.url).toContain("filename=out.png");
      expect(view?.url).toContain("subfolder=Senify");
    } finally {
      await new Promise((resolve) => stub.server.close(resolve));
    }
  });

  it("rejects invalid input before any provider request", async () => {
    const state = freshState();
    const stub = await startComfyStub(state);
    try {
      const provider = createComfyImageProvider(stubConfig(stub.baseUrl));
      await expect(
        provider.generate({ prompt: "", width: 512, height: 512, steps: 5 }, { timeoutMs: 5_000 }),
      ).rejects.toMatchObject({ kind: "invalid_input" });
      await expect(
        provider.generate({ prompt: "x", width: 100, height: 512, steps: 5 }, { timeoutMs: 5_000 }),
      ).rejects.toMatchObject({ kind: "invalid_input" });
      await expect(
        provider.generate(
          { prompt: "x", width: 2048, height: 2048, steps: 5 },
          { timeoutMs: 5_000 },
        ),
      ).rejects.toMatchObject({ kind: "invalid_input" });
      expect(state.requests).toHaveLength(0);
    } finally {
      await new Promise((resolve) => stub.server.close(resolve));
    }
  });

  it("classifies a failed run, a timeout and an unreachable server", async () => {
    const state = freshState();
    state.history = {
      "stub-1": {
        status: {
          status_str: "error",
          messages: [["execution_error", { exception_message: "CUDA out of memory" }]],
        },
      },
    };
    const stub = await startComfyStub(state);
    try {
      const provider = createComfyImageProvider(stubConfig(stub.baseUrl));
      await expect(
        provider.generate({ prompt: "x", width: 512, height: 512, steps: 5 }, { timeoutMs: 5_000 }),
      ).rejects.toMatchObject({ kind: "generation" });
    } finally {
      await new Promise((resolve) => stub.server.close(resolve));
    }

    const state2 = freshState();
    const stub2 = await startComfyStub(state2);
    try {
      const provider = createComfyImageProvider(stubConfig(stub2.baseUrl));
      await expect(
        provider.generate({ prompt: "x", width: 512, height: 512, steps: 5 }, { timeoutMs: 1 }),
      ).rejects.toMatchObject({ kind: "timeout" });
    } finally {
      await new Promise((resolve) => stub2.server.close(resolve));
    }

    const offline = createComfyImageProvider(stubConfig("http://127.0.0.1:1"));
    await expect(
      offline.generate({ prompt: "x", width: 512, height: 512, steps: 5 }, { timeoutMs: 5_000 }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    const health = await offline.health();
    expect(health.ok).toBe(false);
    expect(health.built).toBe(true);
    expect(health.detail).toContain("nicht erreichbar");
  });

  it("reports reachability and the configured model files", async () => {
    const state = freshState();
    const stub = await startComfyStub(state);
    try {
      const provider = createComfyImageProvider(stubConfig(stub.baseUrl));
      const health = await provider.health();
      expect(health.ok).toBe(true);
      expect(health.built).toBe(true);
      expect(health.detail).toContain("0.37.0");
      expect(health.models?.diffusionModel).toBe("qwen-image-2.1-Q4_K_M.gguf");
      expect(health.models?.present).toEqual({
        diffusionModel: true,
        textEncoder: true,
        vae: true,
      });
    } finally {
      await new Promise((resolve) => stub.server.close(resolve));
    }

    const missing = freshState();
    missing.models.unet = ["other.gguf"];
    const stub2 = await startComfyStub(missing);
    try {
      const provider = createComfyImageProvider(stubConfig(stub2.baseUrl));
      const health = await provider.health();
      expect(health.ok).toBe(false);
      expect(health.detail).toContain("diffusionModel");
    } finally {
      await new Promise((resolve) => stub2.server.close(resolve));
    }
  });
});

type ImageSettingsView = ImageSettings;
type HealthBody = {
  provider: string;
  fallbackProvider: string;
  detail?: string;
  providers: {
    "image-use": { ok: boolean; built: boolean; detail?: string } | null;
    comfyui: {
      ok: boolean;
      built: boolean;
      detail?: string;
      models?: { diffusionModel: string; present?: Record<string, boolean> };
    } | null;
  };
};

describe("image settings and health route", () => {
  let env: BootEnv;
  let stub: { server: Server; baseUrl: string };
  let state: StubState;

  beforeAll(async () => {
    env = await bootEngine();
    state = freshState();
    stub = await startComfyStub(state);
  });

  afterAll(async () => {
    await new Promise((resolve) => stub.server.close(resolve));
    await env.close();
  });

  it("exposes the spec defaults and stores overrides", async () => {
    const initial = await env.api.request<{ image: ImageSettingsView }>({
      method: "GET",
      path: "/api/settings",
    });
    expect(initial.status).toBe(200);
    expect(initial.body.image.provider).toBe("image-use");
    expect(initial.body.image.fallbackProvider).toBe("comfyui");
    expect(initial.body.image.cooldownMinutes).toBe(60);
    expect(initial.body.image.baseUrl).toBe("http://127.0.0.1:8188");
    expect(initial.body.image.diffusionModel).toBe("qwen-image-2.1-Q4_K_M.gguf");
    expect(initial.body.image.textEncoder).toBe("qwen3vl_8b_int8_convrot.safetensors");
    expect(initial.body.image.vae).toBe("qwen_image_2.1_vae_bf16.safetensors");
    expect(initial.body.image.defaultSteps).toBe(40);
    expect(initial.body.image.maxPixels).toBe(1_048_576);
    expect(initial.body.image.timeoutMinutes).toBe(60);
    expect(initial.body.image.cliPath).toContain("image-use");

    const saved = await env.api.request<{ image: ImageSettingsView }>({
      method: "PUT",
      path: "/api/settings",
      body: { image: { provider: "comfyui", defaultSteps: 25, fallbackProvider: "none" } },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.image.provider).toBe("comfyui");
    expect(saved.body.image.defaultSteps).toBe(25);
    expect(saved.body.image.fallbackProvider).toBe("none");

    const rejected = await env.api.request({
      method: "PUT",
      path: "/api/settings",
      body: { image: { provider: "dall-e" } },
    });
    expect(rejected.status).toBe(400);
  });

  it("reports the ComfyUI state and the image-use state", async () => {
    await env.api.request({
      method: "PUT",
      path: "/api/settings",
      body: {
        image: {
          provider: "image-use",
          fallbackProvider: "comfyui",
          baseUrl: stub.baseUrl,
          // A path that never exists: the test pins the clean missing-CLI
          // state instead of spawning the operator's real installation.
          cliPath: join(tmpdir(), "senify-test-image-use-missing", "image-use"),
        },
      },
    });
    const health = await env.api.request<HealthBody>({
      method: "GET",
      path: "/api/images/health",
    });
    expect(health.status).toBe(200);
    expect(health.body.provider).toBe("image-use");
    expect(health.body.fallbackProvider).toBe("comfyui");
    expect(health.body.providers["image-use"]).toMatchObject({ ok: false, built: true });
    expect(health.body.providers["image-use"]?.detail).toContain("nicht gefunden");
    expect(health.body.providers.comfyui).toMatchObject({ ok: true, built: true });
    expect(health.body.providers.comfyui?.models?.diffusionModel).toBe(
      "qwen-image-2.1-Q4_K_M.gguf",
    );
    expect(health.body.providers.comfyui?.models?.present).toEqual({
      diffusionModel: true,
      textEncoder: true,
      vae: true,
    });
  });

  it("stays a clean state with provider off", async () => {
    await env.api.request({
      method: "PUT",
      path: "/api/settings",
      body: { image: { provider: "off" } },
    });
    const health = await env.api.request<HealthBody>({
      method: "GET",
      path: "/api/images/health",
    });
    expect(health.status).toBe(200);
    expect(health.body.provider).toBe("off");
    expect(health.body.providers.comfyui).toBeNull();
    expect(health.body.providers["image-use"]).toBeNull();
    expect(health.body.detail).toContain("deaktiviert");
  });

  it("reports an unreachable ComfyUI as ok:false with a detail", async () => {
    await env.api.request({
      method: "PUT",
      path: "/api/settings",
      body: { image: { provider: "comfyui", baseUrl: "http://127.0.0.1:1" } },
    });
    const health = await env.api.request<HealthBody>({
      method: "GET",
      path: "/api/images/health",
    });
    expect(health.status).toBe(200);
    expect(health.body.providers.comfyui?.ok).toBe(false);
    expect(health.body.providers.comfyui?.detail).toContain("nicht erreichbar");
  });

  it("exposes the provider error kind to callers", () => {
    const error = new ImageProviderError("comfyui", "timeout", "zu langsam");
    expect(error.kind).toBe("timeout");
    expect(error.provider).toBe("comfyui");
  });
});
