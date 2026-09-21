import { writeFileSync } from "node:fs";
import { createComfyImageProvider } from "../../packages/engine/src/image-comfy.ts";

// One-off smoke test for S1 (Ticket 01): health, then a fixed 512x512 run
// against the running ComfyUI. Result is documented in the ticket.

const provider = createComfyImageProvider({
  baseUrl: "http://127.0.0.1:8188",
  diffusionModel: "qwen-image-2.1-Q4_K_M.gguf",
  textEncoder: "qwen3vl_8b_int8_convrot.safetensors",
  vae: "qwen_image_2.1_vae_bf16.safetensors",
  defaultSteps: 40,
  maxPixels: 1_048_576,
  timeoutMinutes: 30,
});

const health = await provider.health();
console.log("health:", JSON.stringify(health, null, 2));

const started = Date.now();
const result = await provider.generate(
  {
    prompt:
      "A small red ceramic teapot beside a green plant on a worn wooden kitchen table. Soft morning light through a window, realistic ceramic glaze and wood grain, quiet documentary photograph.",
    width: 512,
    height: 512,
    steps: 40,
    seed: 43,
  },
  { timeoutMs: 30 * 60_000 },
);
const seconds = Math.round((Date.now() - started) / 1000);

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isPng = result.bytes.subarray(0, 8).equals(pngSignature);
const width = result.bytes.readUInt32BE(16);
const height = result.bytes.readUInt32BE(20);

const target = "G:/ai-studio/temp/imagegen-test/s1-smoke-512-seed43.png";
writeFileSync(target, result.bytes);
console.log(
  `done in ${seconds}s: ${result.width}x${result.height}, seed ${result.seed}, ` +
    `${result.bytes.length} bytes, png=${isPng}, ihdr=${width}x${height} -> ${target}`,
);
