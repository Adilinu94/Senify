import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ImageProviderError,
  validateImageRequest,
  type ImageGenerateOptions,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ImageProvider,
  type ImageProviderHealth,
} from "./image-provider.ts";
import { imageDimensions } from "./media.ts";

// image-use (leeguooooo) drives the operator's logged-in ChatGPT browser
// through chrome-use and returns one image per run (S6, ADR-0008): the default
// provider of the chain. ComfyUI + Qwen stays the local fallback.
//
// ToS: this path runs on the operator's personal ChatGPT subscription. Local
// operator use only — never expose it as a service for end users.

export type ImageUseConfig = {
  // Absolute path of the image-use CLI (a pure-stdlib Python file).
  cliPath: string;
  timeoutMinutes: number;
  maxPixels: number;
  // The interpreter; defaults to `python` on Windows and `python3` elsewhere.
  pythonPath?: string;
};

export type ImageUseProcessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  // The interpreter/CLI could not be started (ENOENT/EACCES).
  spawnError?: string;
  // The hard timeout killed the process.
  timedOut?: boolean;
};

// Injectable so the tests drive the wrapper without spawning Python.
export type ImageUseProcess = (
  file: string,
  args: string[],
  options: { timeoutMs: number; env: NodeJS.ProcessEnv },
) => Promise<ImageUseProcessResult>;

export type ImageUseProviderDeps = {
  process?: ImageUseProcess;
};

const HEALTH_TIMEOUT_MS = 60_000;
// The CLI keeps a small margin below the engine budget, so its own "timed out"
// message wins over the hard kill.
const CLI_TIMEOUT_MARGIN_SECONDS = 20;
const KILL_MARGIN_MS = 15_000;
const MAX_OUTPUT_CHARS = 400;

// Failure signatures of the CLI (see the image-use error table): each maps to
// a kind of the provider chain (S2).
const QUOTA_PATTERN =
  /HTTP 429|too many requests|rate.?limit|daily (image )?(cap|limit)|quota|kontingent/i;
const TIMEOUT_PATTERN = /\btimed out\b|\bstalled\b/i;
const UNAVAILABLE_PATTERN =
  /not installed|not on PATH|isn't installed|no logged-in|not logged in|sign in|relay (is )?(down|not|disconnected)|chrome-use|ENOENT|no such file/i;
const REFUSAL_PATTERN = /no image returned|declined|refus/i;

function tail(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= MAX_OUTPUT_CHARS
    ? trimmed
    : `…${trimmed.slice(-MAX_OUTPUT_CHARS)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function imageUseError(
  kind: ImageProviderError["kind"],
  message: string,
  suggestion?: string,
): ImageProviderError {
  return new ImageProviderError(
    "image-use",
    kind,
    message,
    suggestion === undefined ? {} : { suggestion },
  );
}

const defaultProcess: ImageUseProcess = (file, args, options) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        timeout: options.timeoutMs,
        env: options.env,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const out = stdout ?? "";
        const err = stderr ?? "";
        if (error === null) {
          resolve({ code: 0, stdout: out, stderr: err });
          return;
        }
        const code = (error as { code?: unknown }).code;
        const killed = (error as { killed?: boolean }).killed === true;
        const signal = (error as { signal?: unknown }).signal;
        if (typeof code === "string") {
          // ENOENT/EACCES: the interpreter itself never started.
          resolve({ code: null, stdout: out, stderr: err, spawnError: errorMessage(error) });
          return;
        }
        resolve({
          code: typeof code === "number" ? code : null,
          stdout: out,
          stderr: err,
          ...(killed || typeof signal === "string" ? { timedOut: true } : {}),
        });
      },
    );
  });

// Map a finished (or failed) CLI run onto the provider failure kinds.
function classifyRun(result: ImageUseProcessResult): ImageProviderError | null {
  const text = `${result.stderr}\n${result.stdout}`;
  if (result.spawnError !== undefined) {
    return imageUseError(
      "unavailable",
      `image-use konnte nicht gestartet werden: ${result.spawnError}`,
      "Python ≥ 3.10 installieren und image.cliPath in den Einstellungen prüfen.",
    );
  }
  if (result.timedOut === true) {
    return imageUseError(
      "timeout",
      "image-use lief in das harte Zeitlimit der Engine",
      "image.timeoutMinutes erhöhen oder erneut versuchen.",
    );
  }
  if (result.code === 0) return null;
  if (QUOTA_PATTERN.test(text)) {
    return imageUseError(
      "quota",
      `image-use: Kontingent/Rate-Limit — ${tail(text)}`,
      "Die Kette wechselt automatisch auf den lokalen Fallback; in ein paar Minuten erneut versuchen.",
    );
  }
  if (TIMEOUT_PATTERN.test(text)) {
    return imageUseError(
      "timeout",
      `image-use: Zeitüberschreitung — ${tail(text)}`,
      "Erneut versuchen; bei Wiederholung image.timeoutMinutes erhöhen.",
    );
  }
  if (UNAVAILABLE_PATTERN.test(text)) {
    return imageUseError(
      "unavailable",
      `image-use nicht verfügbar — ${tail(text)}`,
      "Chrome/Relay starten (image-use doctor) oder image.cliPath prüfen.",
    );
  }
  if (REFUSAL_PATTERN.test(text)) {
    return imageUseError(
      "refusal",
      `image-use lieferte kein Bild — ${tail(text)}`,
      "Prompt umformulieren; das Modell hat den Auftrag nicht ausgeführt.",
    );
  }
  return imageUseError(
    "generation",
    `image-use brach ab (Exit ${result.code ?? "?"}) — ${tail(text)}`,
    "image-use doctor prüfen und den Lauf wiederholen.",
  );
}

export function createImageUseProvider(
  config: ImageUseConfig,
  deps: ImageUseProviderDeps = {},
): ImageProvider {
  const run = deps.process ?? defaultProcess;
  const python = config.pythonPath ?? (process.platform === "win32" ? "python" : "python3");
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: "utf-8" };

  return {
    async health(): Promise<ImageProviderHealth> {
      if (!existsSync(config.cliPath)) {
        return {
          ok: false,
          built: true,
          detail:
            `image-use-CLI nicht gefunden (${config.cliPath}) — image.cliPath in den ` +
            "Einstellungen prüfen oder die Skill-Installation reparieren.",
        };
      }
      const result = await run(python, [config.cliPath, "doctor"], {
        timeoutMs: HEALTH_TIMEOUT_MS,
        env,
      });
      if (result.spawnError !== undefined) {
        return {
          ok: false,
          built: true,
          detail: `Python (${python}) ist nicht startbar: ${result.spawnError}`,
        };
      }
      if (result.timedOut === true) {
        return {
          ok: false,
          built: true,
          detail: "image-use doctor antwortete nicht innerhalb des Zeitlimits.",
        };
      }
      const text = `${result.stdout}\n${result.stderr}`;
      const chromeUse = /\[ok\]\s+chrome-use/.test(text);
      const relay = /\[ok\]\s+relay/.test(text);
      const autoWeb = /auto would use:\s*web/.test(text);
      const profileFail = /\[fail\]\s+profiles/.test(text);
      const version = text.match(/version\s+(\S+)/)?.[1];
      const label = version === undefined ? "image-use" : `image-use ${version}`;
      const ok = autoWeb || (chromeUse && relay);
      if (ok) {
        return {
          ok: true,
          built: true,
          detail:
            `${label} bereit (web-Backend)` +
            (profileFail
              ? " · Hinweis: die Profil-Erkennung meldet offline „none detected“ (bekannt); als Health zählt der Lauf."
              : ""),
        };
      }
      const fails = [...text.matchAll(/\[fail\]\s+(.+)/g)]
        .map((match) => (match[1] ?? "").trim())
        .filter((line) => line !== "");
      return {
        ok: false,
        built: true,
        detail:
          `${label} nicht bereit: ${fails.length === 0 ? tail(text) : fails.join("; ")} — ` +
          "Chrome mit Relay starten und bei chatgpt.com angemeldet sein.",
      };
    },

    async generate(
      req: ImageGenerationRequest,
      opts: ImageGenerateOptions,
    ): Promise<ImageGenerationResult> {
      validateImageRequest("image-use", req, config.maxPixels);
      const dir = await mkdtemp(join(tmpdir(), "senify-image-use-"));
      const target = join(dir, `bild-${randomUUID()}.png`);
      try {
        const budgetSeconds = Math.round(opts.timeoutMs / 1000);
        const cliTimeout = Math.max(
          60,
          Math.min(3600, budgetSeconds - CLI_TIMEOUT_MARGIN_SECONDS),
        );
        const args = [
          config.cliPath,
          req.prompt,
          "-o",
          target,
          "--size",
          `${req.width}x${req.height}`,
          "--backend",
          "web",
          "--format",
          "png",
          "--timeout",
          String(cliTimeout),
          "--quiet",
        ];
        const result = await run(python, args, {
          timeoutMs: opts.timeoutMs + KILL_MARGIN_MS,
          env,
        });
        const failure = classifyRun(result);
        if (failure !== null) throw failure;
        let bytes: Buffer;
        try {
          bytes = await readFile(target);
        } catch {
          throw imageUseError(
            "generation",
            "image-use meldete Erfolg, schrieb aber keine Bilddatei",
            "image-use doctor prüfen und den Lauf wiederholen.",
          );
        }
        // The web surface decides the real pixel size; report what arrived.
        const dimensions = imageDimensions(bytes, "image/png");
        return {
          bytes,
          mime: "image/png",
          width: dimensions?.width ?? req.width,
          height: dimensions?.height ?? req.height,
          seed: req.seed ?? 0,
        };
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}
