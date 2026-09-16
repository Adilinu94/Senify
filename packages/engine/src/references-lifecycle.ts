import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SenifyError } from "@senify/core";
import type { Author } from "@senify/section-sdk";
import type { Theme } from "@senify/tokens";
import {
  heuristicAnalyzer,
  createLlmReferenceAnalyzer,
  referenceAdherenceIssues,
  type AnalyzerOutput,
  type ReferenceAnalyzer,
  type ReferenceLlmConfig,
} from "./references-analyze.ts";
import type { ReferenceSnapshotBody } from "./references-contract.ts";
import { buildStyleBrief } from "./references-analyze.ts";
import { weakestEvidenceLevel } from "./references-evidence.ts";
import { extractReference, type CaptureInput } from "./references-extract.ts";
import { buildReferenceProfile } from "./references.ts";
import {
  deriveThemeDraft,
  verifyThemeRoundTrip,
  type ReferenceAssignmentInput,
  type ReferenceThemeDraft,
  type ThemeDraftVerification,
} from "./references-theme.ts";
import type { Store } from "./store.ts";
import type {
  CheckIssue,
  Reference,
  ReferenceAssignment,
  ReferenceJob,
  ReferenceProfileRevision,
  ReferenceProvenance,
  ReferenceScale,
  ReferenceSnapshot,
} from "./types.ts";

// Reference pipeline (T14): governance → capture → extraction → analysis →
// profile, driven as a lifecycle job with progress and retry. Capture and
// analyzer are injected, so CI runs on fixtures without a browser or network.

export type CapturedScreenshot = {
  breakpoint: string;
  kind: "fullpage" | "section";
  bytes: Buffer;
  width: number;
  height: number;
  // Container of the uploaded image; captures are always PNG - a manually
  // stored reference may be a JPEG or WebP.
  extension?: "png" | "jpg" | "webp";
};

export type CaptureResult = {
  markup: string;
  computedSamples?: CaptureInput["computedSamples"];
  customProperties?: CaptureInput["customProperties"];
  breakpoints?: number[];
  motion?: CaptureInput["motion"];
  surfaces?: CaptureInput["surfaces"];
  assets?: CaptureInput["assets"];
  screenshots?: CapturedScreenshot[];
  // Recorded scroll pass of a live capture (T14/T07): a short silent .webm.
  video?: { bytes: Buffer; durationMs: number };
};

export type ReferenceCaptureDriver = (input: {
  url: string;
  breakpoints: number[];
}) => Promise<CaptureResult>;

export type ReferenceCaptureFailure = {
  reason: "blocked" | "unavailable" | "timeout" | "internal";
  message: string;
  suggestion: string;
  retryable: boolean;
};

export class ReferenceCaptureError extends Error {
  readonly failure: ReferenceCaptureFailure;

  constructor(failure: ReferenceCaptureFailure) {
    super(failure.message);
    this.name = "ReferenceCaptureError";
    this.failure = failure;
  }
}

export type ReferenceDeps = {
  capture?: ReferenceCaptureDriver;
  analyzer?: ReferenceAnalyzer;
  llm?: ReferenceLlmConfig;
  maxAttempts?: number;
  // Retry schedule; tests shorten it to zero so the tick runs immediately.
  retryDelayMs?: (attempts: number) => number;
};

export type ReferenceContext = {
  store: Store;
  dataDir: string;
  deps?: ReferenceDeps;
};

// Tablet is 810 (research/29 §7: 810 instead of 768).
export const REFERENCE_BREAKPOINTS: readonly number[] = [1440, 810, 390];

// The motion recording of a live capture: fixed frame, one scroll pass.
export const MOTION_VIDEO_SIZE = { width: 1280, height: 720 };
const MOTION_STEPS = 24;
const MOTION_STEP_MS = 160;

const STAGE_PROGRESS = {
  governance: 5,
  capture: 20,
  extract: 60,
  analyze: 78,
  profile: 95,
  ready: 100,
} as const;

const MAX_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 60_000;
const PIPELINE_AUTHOR: Author = {
  kind: "agent",
  id: "reference-pipeline",
  label: "Referenz-Pipeline",
};

export function referenceBackoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

// --------------------------------------------------------------- analyze

export async function analyzeReference(
  context: ReferenceContext,
  input: {
    url: string;
    name?: string;
    snapshot?: ReferenceSnapshotBody;
    author: Author;
    wait?: boolean;
  },
): Promise<{ reference: Reference; job: ReferenceJob }> {
  const url = normalizeUrl(input.url);
  const method = input.snapshot === undefined ? "playwright" : "snapshot";
  const now = new Date().toISOString();
  const reference = await context.store.createReference({
    name: input.name ?? new URL(url).hostname,
    sourceUrl: url,
    method,
    provenance: {
      url,
      capturedAt: now,
      hash: "",
      method,
      note:
        method === "snapshot"
          ? "Snapshot-Fallback: Analyse aus hochgeladenem Seitenquelltext (reduziertes Profil)"
          : "Governance: interner Gebrauch, Provenance dokumentiert",
    },
  });
  const job = await context.store.createReferenceJob({
    referenceId: reference.id,
    maxAttempts: context.deps?.maxAttempts ?? MAX_ATTEMPTS,
    payload:
      input.snapshot === undefined
        ? null
        : { snapshot: input.snapshot, name: reference.name, author: input.author },
  });
  if (input.wait === false) {
    return { reference, job };
  }
  return runReferenceJob(context, job.id);
}

function normalizeUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new SenifyError("validation", `"${input}" is not a valid URL`, {
      field: "url",
      suggestion: 'Pass an absolute URL including the scheme, e.g. "https://example.com".',
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SenifyError(
      "validation",
      `Unsupported URL scheme "${parsed.protocol}"`,
      { field: "url", suggestion: "Only http(s) URLs can be analysed." },
    );
  }
  return parsed.toString();
}

// One job attempt: progress is written on the reference and the job, so the
// tab can show where the analysis stands.
export async function runReferenceJob(
  context: ReferenceContext,
  jobId: string,
): Promise<{ job: ReferenceJob; reference: Reference }> {
  const job = await context.store.getReferenceJob(jobId);
  let reference = await context.store.getReference(job.referenceId);
  const attempts = job.attempts + 1;
  const now = new Date().toISOString();

  const markProgress = async (stage: string, progress: number): Promise<void> => {
    reference = await context.store.updateReference(reference.id, { stage, progress });
    await context.store.updateReferenceJob({
      id: job.id,
      status: "running",
      stage,
      progress,
      attempts,
      nextAttemptAt: job.nextAttemptAt,
      lastError: job.lastError,
      finishedAt: null,
    });
  };

  try {
    await markProgress("governance", STAGE_PROGRESS.governance);
    const payload = await context.store.getReferenceJobPayload(job.id);
    const capture = await captureFor(context, reference, payload);
    await markProgress("capture", STAGE_PROGRESS.capture);

    const captureInput: CaptureInput = {
      url: reference.sourceUrl,
      method: reference.method,
      markup: capture.markup,
      computedSamples: capture.computedSamples,
      customProperties: capture.customProperties,
      breakpoints: capture.breakpoints,
      motion: capture.motion,
      surfaces: capture.surfaces,
      assets: capture.assets,
    };
    const extraction = extractReference(captureInput);
    await markProgress("extract", STAGE_PROGRESS.extract);

    const analyzer = analyzerFor(context.deps);
    const output: AnalyzerOutput = await analyzer({
      url: reference.sourceUrl,
      name: reference.name,
      extraction,
    });
    await markProgress("analyze", STAGE_PROGRESS.analyze);

    const capturedAt = new Date().toISOString();
    const provenance: ReferenceProvenance = {
      url: reference.sourceUrl,
      capturedAt,
      hash: sha256(capture.markup),
      method: reference.method,
      note: extraction.reduced
        ? "Reduziertes Profil: Runtime-Werte fehlen (Snapshot-Fallback bzw. blockierte Live-Messung)"
        : "Playwright-Capture (Desktop 1440 / Tablet 810 / Mobile 390)",
    };
    const snapshots = persistReferenceSnapshots(
      context,
      reference.id,
      capture.screenshots,
      capture.video,
    );
    const { profile, evidence } = buildReferenceProfile({
      url: reference.sourceUrl,
      capturedAt,
      extraction,
      analyzer: output,
    });
    await markProgress("profile", STAGE_PROGRESS.profile);
    await context.store.createReferenceProfileRevision({
      referenceId: reference.id,
      profile,
      evidence,
      provenance,
      author: PIPELINE_AUTHOR,
      note: null,
    });
    reference = await context.store.updateReference(reference.id, {
      status: "ready",
      stage: "ready",
      progress: STAGE_PROGRESS.ready,
      failureReason: null,
      families: profile.families,
      vocabulary: profile.vocabulary,
      styleBrief: profile.styleBrief,
      snapshots: reference.snapshots.length > 0 ? reference.snapshots : snapshots,
      provenance,
    });
    const finished = await context.store.updateReferenceJob({
      id: job.id,
      status: "done",
      stage: "ready",
      progress: STAGE_PROGRESS.ready,
      attempts,
      nextAttemptAt: now,
      lastError: null,
      finishedAt: new Date().toISOString(),
    });
    return { job: finished, reference };
  } catch (error) {
    const failure = describeFailure(error);
    const delay = (context.deps?.retryDelayMs ?? referenceBackoffMs)(attempts);
    const nextAttemptAt = new Date(Date.now() + delay).toISOString();
    if (failure.retryable && attempts < job.maxAttempts) {
      reference = await context.store.updateReference(reference.id, {
        status: "analyzing",
        stage: "retry-scheduled",
        failureReason: null,
      });
      const scheduled = await context.store.updateReferenceJob({
        id: job.id,
        status: "queued",
        stage: "retry-scheduled",
        progress: reference.progress,
        attempts,
        nextAttemptAt,
        lastError: failure.message,
        finishedAt: null,
      });
      return { job: scheduled, reference };
    }
    const failedReference = await context.store.updateReference(reference.id, {
      status: "failed",
      stage: "failed",
      failureReason: `${failure.reason}: ${failure.message}`,
    });
    const failedJob = await context.store.updateReferenceJob({
      id: job.id,
      status: "failed",
      stage: "failed",
      progress: failedReference.progress,
      attempts,
      nextAttemptAt,
      lastError: `${failure.message} ${failure.suggestion}`,
      finishedAt: new Date().toISOString(),
    });
    return { job: failedJob, reference: failedReference };
  }
}

export type ReferenceTickResult = {
  processed: number;
  done: number;
  failed: number;
  retrying: number;
};

export async function runDueReferenceJobs(
  context: ReferenceContext,
  options: { limit?: number } = {},
): Promise<ReferenceTickResult> {
  const due = await context.store.listDueReferenceJobs(
    new Date().toISOString(),
    options.limit ?? 20,
  );
  const result: ReferenceTickResult = { processed: due.length, done: 0, failed: 0, retrying: 0 };
  for (const job of due) {
    const outcome = await runReferenceJob(context, job.id);
    if (outcome.job.status === "done") result.done += 1;
    else if (outcome.job.status === "failed") result.failed += 1;
    else result.retrying += 1;
  }
  return result;
}

function describeFailure(error: unknown): ReferenceCaptureFailure {
  if (error instanceof ReferenceCaptureError) return error.failure;
  if (error instanceof SenifyError) {
    return {
      reason: "internal",
      message: error.message,
      suggestion: error.suggestion ?? "Check the analysis input and retry the job.",
      retryable: false,
    };
  }
  return {
    reason: "internal",
    message: error instanceof Error ? error.message : "Unknown analysis error",
    suggestion: "Inspect the engine log and retry the job (references tick).",
    retryable: false,
  };
}

function analyzerFor(deps: ReferenceDeps | undefined): ReferenceAnalyzer {
  if (deps?.analyzer !== undefined) return deps.analyzer;
  if (deps?.llm !== undefined) return createLlmReferenceAnalyzer(deps.llm);
  return heuristicAnalyzer();
}

// LLM configuration from the environment (same OpenAI-compatible shape as the
// docs-portal BYOK config). Without it the heuristic analyzer runs.
export function referenceDepsFromEnv(env: NodeJS.ProcessEnv): ReferenceDeps {
  const endpoint = env.SENIFY_LLM_ENDPOINT;
  const model = env.SENIFY_LLM_MODEL;
  if (endpoint === undefined || endpoint === "" || model === undefined || model === "") {
    return {};
  }
  return {
    llm: {
      endpoint,
      model,
      ...(env.SENIFY_LLM_API_KEY === undefined ? {} : { apiKey: env.SENIFY_LLM_API_KEY }),
    },
  };
}

// --------------------------------------------------------------- capture

async function captureFor(
  context: ReferenceContext,
  reference: Reference,
  payload: Record<string, unknown> | null,
): Promise<CaptureResult> {
  const snapshot = payload?.snapshot as ReferenceSnapshotBody | undefined;
  if (snapshot !== undefined) {
    return {
      markup: snapshot.html ?? "",
      computedSamples: snapshot.computedSamples,
      customProperties: snapshot.customProperties,
      breakpoints: snapshot.breakpoints,
      motion: snapshot.motion,
      surfaces: snapshot.surfaces,
      assets: snapshot.assets,
      screenshots: (snapshot.screenshots ?? []).map((entry) => ({
        breakpoint: entry.breakpoint,
        kind: entry.kind,
        bytes: decodePngDataUrl(entry.dataUrl),
        width: entry.width,
        height: entry.height,
      })),
    };
  }
  const driver = context.deps?.capture ?? createPlaywrightCaptureDriver();
  return driver({ url: reference.sourceUrl, breakpoints: [...REFERENCE_BREAKPOINTS] });
}

// Snapshots stay internal: they live under <dataDir>/references/<id>/ and never
// enter the site media library (artifacts/28 §4). The manually stored reference
// uses the same path, so its preview URL is the one of the snapshot fallback.
export function persistReferenceSnapshots(
  context: ReferenceContext,
  referenceId: string,
  screenshots: CapturedScreenshot[] | undefined,
  video?: CaptureResult["video"],
): ReferenceSnapshot[] {
  if ((!screenshots || screenshots.length === 0) && video === undefined) return [];
  const dir = join(context.dataDir, "references", referenceId, "snapshots");
  mkdirSync(dir, { recursive: true });
  const snapshots: ReferenceSnapshot[] = (screenshots ?? []).map((screenshot, index) => {
    const name = `${screenshot.breakpoint}-${screenshot.kind}-${index + 1}.${
      screenshot.extension ?? "png"
    }`;
    const withBytes = screenshot.bytes.length > 0;
    if (withBytes) writeFileSync(join(dir, name), screenshot.bytes);
    return {
      breakpoint: screenshot.breakpoint,
      width: screenshot.width,
      height: screenshot.height,
      kind: screenshot.kind,
      // Storage refs use posix separators (like the asset library); the file
      // path itself stays OS-native.
      storageRef: ["references", referenceId, "snapshots", name].join("/"),
      hash: withBytes ? sha256(screenshot.bytes) : sha256(name),
      ...(withBytes
        ? { previewPath: `/api/references/${referenceId}/snapshots/${name}` }
        : {}),
    };
  });
  if (video !== undefined && video.bytes.length > 0) {
    const name = `motion-${snapshots.length + 1}.webm`;
    writeFileSync(join(dir, name), video.bytes);
    snapshots.push({
      breakpoint: "desktop",
      width: MOTION_VIDEO_SIZE.width,
      height: MOTION_VIDEO_SIZE.height,
      kind: "motion",
      durationMs: video.durationMs,
      storageRef: ["references", referenceId, "snapshots", name].join("/"),
      hash: sha256(video.bytes),
      previewPath: `/api/references/${referenceId}/snapshots/${name}`,
    });
  }
  return snapshots;
}

// Screenshot uploads of the snapshot fallback arrive as an inline PNG data URL.
function decodePngDataUrl(dataUrl: string | undefined): Buffer {
  if (dataUrl === undefined) return Buffer.from("");
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  const encoded = match?.[1];
  return encoded === undefined ? Buffer.from("") : Buffer.from(encoded, "base64");
}

// Live capture path (not executed in CI): the probes mirror the site-clone
// scripts tokens-probe/motion-probe/surface-map (research/29 §2).
export function createPlaywrightCaptureDriver(
  options: { module?: PlaywrightLike; breakpoints?: number[]; recordMotion?: boolean } = {},
): ReferenceCaptureDriver {
  return async (input) => {
    const playwright = options.module ?? (await loadPlaywright());
    const breakpoints = options.breakpoints ?? input.breakpoints;
    const recordMotion = options.recordMotion ?? true;
    const videoDir = recordMotion
      ? mkdtempSync(join(tmpdir(), "senify-motion-"))
      : undefined;
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: breakpoints[0] ?? 1440, height: 900 },
        ...(videoDir === undefined
          ? {}
          : { recordVideo: { dir: videoDir, size: MOTION_VIDEO_SIZE } }),
      });
      const page = await context.newPage();
      const response = await page.goto(input.url, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      const status = response?.status() ?? 0;
      if (status === 403 || status === 429 || status === 503) {
        throw new ReferenceCaptureError({
          reason: "blocked",
          message: `Die Seite hat die Analyse blockiert (HTTP ${status})`,
          suggestion:
            "Screenshot-/HTML-Snapshot hochladen (pageHtml) - der Fallback erzeugt ein reduziertes Profil.",
          retryable: false,
        });
      }
      await page.waitForTimeout(1500);
      const markup = await page.content();
      if (/captcha|access denied|are you a robot|cf-chl/i.test(markup.slice(0, 4000))) {
        throw new ReferenceCaptureError({
          reason: "blocked",
          message: "Bot-Wall/Captcha erkannt",
          suggestion:
            "Snapshot-Fallback verwenden (pageHtml) und das reduzierte Profil nachbearbeiten.",
          retryable: false,
        });
      }
      const probe = (await page.evaluate(`(${PROBE_SCRIPT})()`)) as CaptureResult & {
        screenshots?: never;
      };
      const shots: CapturedScreenshot[] = [];
      for (const breakpoint of breakpoints) {
        await page.setViewportSize({ width: breakpoint, height: 900 });
        const bytes = await page.screenshot({ fullPage: true, type: "png" });
        shots.push({
          breakpoint: String(breakpoint),
          kind: "fullpage",
          bytes,
          width: breakpoint,
          height: 0,
        });
      }
      // Motion recording (T14/T07): one scroll pass through the page at the
      // desktop width; the .webm lands in the snapshot list.
      let video: CaptureResult["video"];
      const videoHandle = page.video();
      if (videoDir !== undefined && videoHandle !== null) {
        await page.setViewportSize({ width: breakpoints[0] ?? 1440, height: 900 });
        for (let step = 0; step < MOTION_STEPS; step += 1) {
          await page.evaluate(
            `(ratio) => {
              const max = Math.max(0, document.body.scrollHeight - window.innerHeight);
              window.scrollTo(0, Math.round(max * ratio));
            }`,
            step / (MOTION_STEPS - 1),
          );
          await page.waitForTimeout(MOTION_STEP_MS);
        }
        await context.close();
        video = {
          bytes: readFileSync(await videoHandle.path()),
          durationMs: MOTION_STEPS * MOTION_STEP_MS,
        };
      }
      return { ...probe, markup, screenshots: shots, ...(video ? { video } : {}) };
    } catch (error) {
      if (error instanceof ReferenceCaptureError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const timeout = /timeout|timed out/i.test(message);
      throw new ReferenceCaptureError({
        reason: timeout ? "timeout" : "internal",
        message: `Capture fehlgeschlagen: ${message}`,
        suggestion: timeout
          ? "Erneut versuchen (der Job wiederholt automatisch) oder einen Snapshot hochladen."
          : "Snapshot-Fallback (pageHtml) verwenden oder die URL pruefen.",
        retryable: timeout,
      });
    } finally {
      await browser.close();
      if (videoDir !== undefined) {
        rmSync(videoDir, { recursive: true, force: true });
      }
    }
  };
}

const PROBE_SCRIPT = `() => {
  const out = { computedSamples: [], customProperties: [], breakpoints: [], motion: { libraries: [], transitions: [], animations: [], reveals: [] }, surfaces: [], assets: [] };
  const kindOf = (property) => property === 'fontFamily' ? 'font' : null;
  const push = (kind, role, value, where) => out.computedSamples.push({ breakpoint: 'desktop', kind, role, value, where, source: 'runtime' });
  for (const element of Array.from(document.querySelectorAll('*')).slice(0, 4000)) {
    const style = getComputedStyle(element);
    const where = element.tagName.toLowerCase() + (element.className && typeof element.className === 'string' ? '.' + element.className.trim().split(/\\s+/).join('.') : '');
    if (element.childElementCount === 0 && element.textContent && element.textContent.trim()) push('color', 'text', style.color, where);
    if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') push('color', 'bg', style.backgroundColor, where);
    push('font', /^h[1-6]$/i.test(element.tagName) ? 'display' : 'body', style.fontFamily, where);
    push('typeScale', element.tagName.toLowerCase(), [style.fontSize, style.lineHeight, style.fontWeight].join('/'), where);
    push('spacing', 'padding', style.padding, where);
    push('spacing', 'gap', style.gap, where);
    push('radius', 'default', style.borderRadius, where);
    if (style.boxShadow && style.boxShadow !== 'none') push('shadow', 'default', style.boxShadow, where);
    if (style.backdropFilter && style.backdropFilter !== 'none') push('shadow', 'blur', style.backdropFilter, where);
  }
  const rootStyle = getComputedStyle(document.documentElement);
  for (const sheet of Array.from(document.styleSheets)) {
    let rules = [];
    try { rules = Array.from(sheet.cssRules); } catch { continue; }
    for (const rule of rules) {
      if (rule.type === CSSRule.MEDIA_RULE) {
        const match = rule.conditionText && rule.conditionText.match(/(min|max)-width:\\s*([0-9.]+)px/);
        if (match) out.breakpoints.push(Number(match[2]));
      }
    }
  }
  for (const name of Array.from(rootStyle)) {
    if (name.startsWith('--')) out.customProperties.push({ name, value: rootStyle.getPropertyValue(name).trim() });
  }
  const scripts = Array.from(document.querySelectorAll('script[src]')).map((script) => script.src).join(' ');
  const libraries = [];
  for (const [key, pattern] of [['gsap', /gsap/], ['scrolltrigger', /scrolltrigger|ScrollTrigger/], ['lenis', /lenis|locomotive/], ['three', /three/], ['spline', /spline/], ['rive', /rive/], ['lottie', /lottie/], ['swiper', /swiper/], ['embla', /embla/], ['jquery', /jquery/]]) {
    if (pattern.test(scripts) || pattern.test(document.documentElement.innerHTML.slice(0, 200000))) libraries.push(key);
  }
  out.motion.libraries = libraries;
  if (window.lenis) out.motion.smoothScroll = { library: 'lenis', params: Object.fromEntries(Object.entries(window.lenis.options || {}).map(([k, v]) => [k, String(v)])) };
  if (window.gsap && window.ScrollTrigger) {
    out.motion.reveals.push({ name: 'scrolltrigger', mechanism: 'GSAP ScrollTrigger', params: { count: String(window.ScrollTrigger.getAll().length) }, where: 'window.ScrollTrigger' });
    for (const trigger of window.ScrollTrigger.getAll().slice(0, 20)) {
      out.motion.scrollTriggers = out.motion.scrollTriggers || [];
      out.motion.scrollTriggers.push({ trigger: trigger.trigger ? trigger.trigger.className || trigger.trigger.tagName : 'unknown', pin: !!trigger.pin, scrub: trigger.vars && trigger.vars.scrub !== undefined ? trigger.vars.scrub : false, start: String(trigger.start), end: String(trigger.end) });
    }
  }
  if (window.gsap) {
    for (const tween of (window.gsap.globalTimeline ? window.gsap.globalTimeline.getChildren() : []).slice(0, 20)) {
      out.motion.transitions.push({ property: 'gsap', duration: String((tween.duration && tween.duration()) || 0), timing: (tween.vars && tween.vars.ease) ? String(tween.vars.ease) : 'none', where: 'gsap', uses: 2 });
    }
  }
  for (const animation of document.getAnimations().slice(0, 40)) {
    const timing = animation.effect && animation.effect.getComputedTiming ? animation.effect.getComputedTiming() : {};
    out.motion.animations.push({ name: animation.animationName || 'waapi', duration: String(timing.duration || 0) + 'ms', timing: String(timing.easing || 'linear'), where: 'document.getAnimations' });
  }
  for (const element of Array.from(document.querySelectorAll('canvas, video, svg, iframe')).slice(0, 40)) {
    let kind = 'canvas';
    if (element.tagName === 'VIDEO') kind = 'video';
    else if (element.tagName === 'SVG') kind = 'svg';
    else if (element.tagName === 'IFRAME') kind = 'iframe';
    let live = false;
    if (kind === 'canvas') live = !!(element.getContext && element.getContext('webgl2'));
    out.surfaces.push({ kind, detail: element.tagName.toLowerCase(), live, where: element.className || element.tagName.toLowerCase() });
  }
  for (const image of Array.from(document.querySelectorAll('img')).slice(0, 100)) {
    out.assets.push({ kind: /logo|brand/i.test(image.className + ' ' + image.src) ? 'logo' : 'image', ref: image.src, where: image.className || 'img' });
  }
  return out;
}`;

type PlaywrightLike = {
  chromium: {
    launch(options?: { headless?: boolean }): Promise<{
      newContext(options: { viewport: { width: number; height: number } }): Promise<{
        newPage(): Promise<{
          goto(
            url: string,
            options: { waitUntil?: string; timeout?: number },
          ): Promise<{ status(): number } | null>;
          waitForTimeout(ms: number): Promise<void>;
          content(): Promise<string>;
          evaluate(script: string, arg?: unknown): Promise<unknown>;
          setViewportSize(size: { width: number; height: number }): Promise<void>;
          screenshot(options: { fullPage?: boolean; type?: "png" }): Promise<Buffer>;
          video(): { path(): Promise<string> } | null;
        }>;
        close(): Promise<void>;
      }>;
      close(): Promise<void>;
    }>;
  };
};

async function loadPlaywright(): Promise<PlaywrightLike> {
  const specifier = "playwright";
  try {
    const loaded = (await import(/* @vite-ignore */ specifier)) as Partial<PlaywrightLike>;
    if (!loaded.chromium) throw new Error("playwright export missing");
    return loaded as PlaywrightLike;
  } catch {
    throw new ReferenceCaptureError({
      reason: "unavailable",
      message: "Playwright ist nicht verfuegbar (Browser-Capture nicht moeglich)",
      suggestion:
        "playwright installieren (`pnpm add -D playwright && npx playwright install chromium`) oder einen HTML-/Screenshot-Snapshot hochladen (Fallback mit reduziertem Profil).",
      retryable: false,
    });
  }
}

// ----------------------------------------------------------- profile edits

export async function editReferenceProfile(
  context: ReferenceContext,
  input: {
    referenceId: string;
    vocabulary?: string[];
    families?: string[];
    rules?: { constants?: string[]; never?: string[] };
    note?: string;
    author: Author;
  },
): Promise<ReferenceProfileRevision> {
  const latest = await context.store.getLatestReferenceProfile(input.referenceId);
  if (!latest) {
    throw new SenifyError(
      "conflict",
      `Reference "${input.referenceId}" has no profile to edit`,
      {
        field: "referenceId",
        suggestion: "Wait for the analysis to finish (status ready) before editing.",
      },
    );
  }
  const base = {
    ...latest.profile,
    vocabulary: input.vocabulary ?? latest.profile.vocabulary,
    families: input.families ?? latest.profile.families,
    rules: {
      constants: input.rules?.constants ?? latest.profile.rules.constants,
      never: input.rules?.never ?? latest.profile.rules.never,
    },
  };
  const evidenceLevel = weakestEvidenceLevel(
    latest.evidence.length === 0 ? ["inferred"] : latest.evidence.map((entry) => entry.level),
  );
  const profile = {
    ...base,
    styleBrief: buildStyleBrief({
      url: latest.provenance.url,
      capturedAt: latest.provenance.capturedAt,
      method: latest.provenance.method,
      profile: base,
      evidenceLevel,
    }),
  };
  const revision = await context.store.createReferenceProfileRevision({
    referenceId: input.referenceId,
    profile,
    evidence: latest.evidence,
    provenance: latest.provenance,
    author: input.author,
    note: input.note ?? "Nachbearbeitung",
  });
  await context.store.updateReference(input.referenceId, {
    families: profile.families,
    vocabulary: profile.vocabulary,
    styleBrief: profile.styleBrief,
  });
  return revision;
}

// ------------------------------------------------------------- reuse (T14)

export async function applyReference(
  context: ReferenceContext,
  input: {
    siteId: string;
    referenceId: string;
    scales?: readonly ReferenceScale[];
    author: Author;
  },
): Promise<{
  assignment: ReferenceAssignment;
  draft: ReferenceThemeDraft;
  verification: ThemeDraftVerification;
  unchanged: { unchanged: boolean; checks: { name: string; ok: boolean; detail: string }[] };
}> {
  const reference = await context.store.getReference(input.referenceId);
  if (reference.status !== "ready" || reference.profile === null) {
    const manual = reference.profile === null && reference.origin === "manual";
    throw new SenifyError(
      "conflict",
      manual
        ? `Referenz "${reference.name}" hat kein Analyseprofil (manuell abgelegt)`
        : `Reference "${reference.name}" is ${reference.status}`,
      {
        field: "referenceId",
        suggestion: manual
          ? "Die Referenz als URL analysieren, um Stil-Skalen in ein Projekt zu übernehmen."
          : reference.status === "failed"
            ? "Fix the failure cause (failureReason) and enqueue a new analysis."
            : "Wait for the analysis to finish, or run the reference tick.",
      },
    );
  }
  await context.store.getSite(input.siteId);
  const existing = await context.store.listReferenceAssignments(input.siteId);
  const assignment = await context.store.upsertReferenceAssignment({
    siteId: input.siteId,
    referenceId: input.referenceId,
    scales: [...(input.scales ?? ["color", "type", "motion", "rest"])],
    priority: existing.find((entry) => entry.referenceId === input.referenceId)?.priority ?? existing.length,
  });
  const { draft, verification } = await referenceThemeDraft(context, input.siteId);
  return {
    assignment,
    draft,
    verification,
    unchanged: await verifyReferenceApply(context, input.siteId),
  };
}

export async function removeReferenceAssignment(
  context: ReferenceContext,
  input: { siteId: string; referenceId: string },
): Promise<{ removed: boolean }> {
  return {
    removed: await context.store.deleteReferenceAssignment(input),
  };
}

async function assignmentInputs(
  context: ReferenceContext,
  siteId: string,
): Promise<ReferenceAssignmentInput[]> {
  const assignments = await context.store.listReferenceAssignments(siteId);
  const inputs: ReferenceAssignmentInput[] = [];
  for (const assignment of assignments) {
    const revision = await context.store.getLatestReferenceProfile(assignment.referenceId);
    if (!revision) continue;
    const reference = await context.store.getReference(assignment.referenceId);
    inputs.push({
      referenceId: assignment.referenceId,
      name: reference.name,
      profile: revision.profile,
      scales: assignment.scales,
    });
  }
  return inputs;
}

// Project theme draft: the assigned references feed the scale engine.
export async function referenceThemeDraft(
  context: ReferenceContext,
  siteId: string,
): Promise<{ draft: ReferenceThemeDraft; verification: ThemeDraftVerification }> {
  const assignments = await assignmentInputs(context, siteId);
  const draft = deriveThemeDraft({ assignments });
  const base = (await context.store.getTheme(siteId)).theme;
  return { draft, verification: verifyThemeRoundTrip(draft, base) };
}

type StoreState = {
  themeVersion: number;
  activeReleaseId: string | null;
  draftVersions: string;
};

async function storeState(context: ReferenceContext, siteId: string): Promise<StoreState> {
  const theme = await context.store.getTheme(siteId);
  const pages = await context.store.listPageDrafts(siteId);
  return {
    themeVersion: theme.version,
    activeReleaseId: await context.store.getActiveReleaseId(siteId),
    draftVersions: pages.map((page) => `${page.id}:${page.draftVersion}`).join(","),
  };
}

// Round-trip verification of the assignment: deriving the draft must not touch
// the stored theme, the active release or the drafts ("Anwenden aendert den
// bestehenden Bake nicht").
export async function verifyReferenceApply(
  context: ReferenceContext,
  siteId: string,
): Promise<{ unchanged: boolean; checks: { name: string; ok: boolean; detail: string }[] }> {
  const before = await storeState(context, siteId);
  await referenceThemeDraft(context, siteId);
  const after = await storeState(context, siteId);
  const checks = [
    {
      name: "theme-unveraendert",
      ok: before.themeVersion === after.themeVersion,
      detail: `Theme-Version ${before.themeVersion} (vorher/nachher gleich)`,
    },
    {
      name: "release-unveraendert",
      ok: before.activeReleaseId === after.activeReleaseId,
      detail: `Aktives Release ${before.activeReleaseId ?? "keins"} bleibt aktiv`,
    },
    {
      name: "drafts-unveraendert",
      ok: before.draftVersions === after.draftVersions,
      detail: "Seiten-Drafts bleiben auf ihrer Version (kein Re-Bake)",
    },
  ];
  return { unchanged: checks.every((check) => check.ok), checks };
}

export async function deleteReference(
  context: ReferenceContext,
  input: { referenceId: string; force?: boolean },
): Promise<{ deleted: string; usedInProjects: string[] }> {
  const reference = await context.store.getReference(input.referenceId);
  if (reference.usedInProjects.length > 0 && input.force !== true) {
    throw new SenifyError(
      "conflict",
      `Reference "${reference.name}" is used in ${reference.usedInProjects.length} project(s)`,
      {
        field: "referenceId",
        suggestion:
          "Remove the assignment in the project settings first, or pass force=true to delete anyway.",
      },
    );
  }
  await context.store.deleteReference(input.referenceId);
  return { deleted: input.referenceId, usedInProjects: reference.usedInProjects };
}

// Soft adherence hint for review/submit/publish (artifacts/28 §3, "weich").
export async function referenceAdherenceForSite(
  context: ReferenceContext,
  siteId: string,
  theme: Theme,
): Promise<CheckIssue[]> {
  const inputs = await assignmentInputs(context, siteId);
  return inputs.flatMap((input) =>
    referenceAdherenceIssues({
      referenceId: input.referenceId,
      referenceName: input.name,
      profile: input.profile,
      theme,
      scales: input.scales,
    }),
  );
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
