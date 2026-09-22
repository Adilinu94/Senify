import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_GENERATE_FORM,
  imageGenerateRequest,
  imageHealthHint,
  imageJobActive,
  imageJobErrorText,
  imageJobStatusLabel,
  parseImageTags,
  validateImageGenerateForm,
} from "@senify/editor";

// Prüfstelle: the headless model of the "Erzeugen" area (image generation
// ticket 04). The shell owns the HTTP calls; everything text- and rule-shaped
// lives here and is pinned by these tests.

describe("media generate model (image generation ticket 04)", () => {
  it("validates prompt/reference and the 32-multiple sizes", () => {
    expect(validateImageGenerateForm(DEFAULT_IMAGE_GENERATE_FORM)).toContain("Prompt");
    expect(
      validateImageGenerateForm({ ...DEFAULT_IMAGE_GENERATE_FORM, prompt: "x" }),
    ).toBeNull();
    expect(
      validateImageGenerateForm({ ...DEFAULT_IMAGE_GENERATE_FORM, referenceId: "r1" }),
    ).toBeNull();
    expect(
      validateImageGenerateForm({ ...DEFAULT_IMAGE_GENERATE_FORM, prompt: "x", width: 100 }),
    ).toContain("Vielfaches von 32");
    expect(
      validateImageGenerateForm({ ...DEFAULT_IMAGE_GENERATE_FORM, prompt: "x", height: 0 }),
    ).toContain("positive");
  });

  it("builds the request: empty optional fields drop out, tags split", () => {
    const request = imageGenerateRequest({
      prompt: "  rote Teekanne  ",
      width: 512,
      height: 512,
      referenceId: "",
      altText: " ",
      tags: "hero, rot ,, hero",
      folderId: "",
    });
    expect(request).toEqual({
      prompt: "rote Teekanne",
      width: 512,
      height: 512,
      tags: ["hero", "rot"],
    });
    const withReference = imageGenerateRequest({
      ...DEFAULT_IMAGE_GENERATE_FORM,
      referenceId: "ref-1",
      tags: "",
    });
    expect(withReference.referenceId).toBe("ref-1");
    expect(withReference.prompt).toBeUndefined();
    expect(withReference.tags).toEqual([]);
  });

  it("labels the job card with status and provider", () => {
    const base = { id: "j1", assetId: null, error: [] } as const;
    expect(imageJobStatusLabel({ ...base, status: "queued", providerUsed: null })).toBe(
      "Wartet",
    );
    expect(
      imageJobStatusLabel({ ...base, status: "running", providerUsed: "image-use" }),
    ).toBe("Läuft · image-use");
    expect(
      imageJobStatusLabel({ ...base, status: "succeeded", providerUsed: "custom" }),
    ).toBe("Fertig · custom");
    expect(imageJobActive({ ...base, status: "queued", providerUsed: null })).toBe(true);
    expect(imageJobActive({ ...base, status: "succeeded", providerUsed: null })).toBe(false);
    expect(imageJobActive(null)).toBe(false);
  });

  it("turns the last attempt into the readable failure", () => {
    expect(
      imageJobErrorText({
        id: "j1",
        status: "succeeded",
        providerUsed: "x",
        assetId: null,
        error: [],
      }),
    ).toBeNull();
    const failed = imageJobErrorText({
      id: "j1",
      status: "failed",
      providerUsed: null,
      assetId: null,
      error: [
        { provider: "image-use", kind: "generation", message: "erster Versuch" },
        {
          provider: "comfyui",
          kind: "generation",
          message: "CUDA out of memory",
          suggestion: "kleiner testen",
        },
      ],
    });
    expect(failed).toContain("comfyui: CUDA out of memory");
    expect(failed).toContain("kleinere Auflösung wählen");
    expect(
      imageJobErrorText({
        id: "j1",
        status: "failed",
        providerUsed: null,
        assetId: null,
        error: [],
      }),
    ).toContain("Details fehlen");
  });

  it("hints when the chain is off or the primary provider is not ready", () => {
    expect(imageHealthHint(null)).toBeNull();
    expect(
      imageHealthHint({ provider: "off", fallbackProvider: "comfyui", providers: {} }),
    ).toContain("deaktiviert");
    const hint = imageHealthHint({
      provider: "image-use",
      fallbackProvider: "comfyui",
      providers: {
        "image-use": { ok: false, built: true, detail: "relay not connected" },
        comfyui: { ok: true, built: true },
      },
    });
    expect(hint).toContain("nicht bereit");
    expect(hint).toContain("relay not connected");
    expect(
      imageHealthHint({
        provider: "custom",
        fallbackProvider: "none",
        providers: { custom: { ok: true, built: true } },
      }),
    ).toBeNull();
  });

  it("parses tags like the asset metadata field", () => {
    expect(parseImageTags(" hero , rot,,hero ")).toEqual(["hero", "rot"]);
    expect(parseImageTags("")).toEqual([]);
  });
});
