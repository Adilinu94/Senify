import type { MotionSpec } from "@senify/section-sdk";
import type { FramerIrDocument, IrMotionSample } from "./ir.ts";

export type MotionMapping = {
  sampleIndex: number;
  nodeKey: string | null;
  preset: MotionSpec["preset"];
  spec: MotionSpec;
  reason: string;
};

export type MotionMappingResult = {
  mappings: MotionMapping[];
  findings: {
    sample: IrMotionSample;
    reason: string;
  }[];
  measured: number;
  mapped: number;
  documented: number;
};

const numberParam = (sample: IrMotionSample, key: string): number | undefined => {
  const value = sample.params[key];
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return undefined;
};

// A duration is only a number relative to its unit, and the two capture paths
// write different ones: the WAAPI probe reads `AnimationEffect.getTiming()`
// (milliseconds, the platform's unit) while the appear channel reads Framer's
// own spec (seconds, the unit of `delay` right beside it). The old code divided
// every duration by 300 — correct for a WAAPI millisecond value, off by a
// factor of ~47 for an appear second value: a 1.4 s reveal was baked as 30 ms.
// The sample therefore names its unit (`durationUnit`) and the mapping converts
// to seconds; a sample without the field is milliseconds, the older convention.
type DurationUnit = "ms" | "s";

function durationSeconds(sample: IrMotionSample): number | undefined {
  const duration = numberParam(sample, "duration");
  if (duration === undefined) return undefined;
  const unit: DurationUnit = sample.params["durationUnit"] === "s" ? "s" : "ms";
  // Milliseconds arrive as floats from `getTiming()` (`40000`, `139733`).
  return unit === "s" ? duration : duration / 1000;
}

// A Framer appear effect (start state, end state, spring) against the closed
// registry. `fade-up` is the one entry preset that reveals with opacity plus a
// vertical offset, so an effect maps onto it only when its movement IS vertical
// (or absent: a plain fade). A horizontal slide, a scale-in or a rotation has
// no preset; mapping it to `fade-up` would play a different animation than the
// source, so it stays a documented finding instead.
function appearPreset(sample: IrMotionSample): MotionSpec["preset"] | null {
  const x = Math.abs(numberAny(sample, "fromX") ?? 0);
  const y = numberAny(sample, "fromY") ?? 0;
  const scale = numberAny(sample, "fromScale") ?? 1;
  // `fade-up` rises from below. An element that starts ABOVE its place (the nav
  // dropping in, a negative offset) would play the wrong way round.
  if (x > 0 || scale !== 1 || y < 0) return null;
  return "fade-up";
}

const numberAny = (sample: IrMotionSample, key: string): number | undefined => {
  const value = sample.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

// The vertical start offset of an appear effect as the 1–10 intensity of the
// preset (about 10 px per step; Framer's 50 px reveal is a 5).
function appearIntensity(sample: IrMotionSample): number {
  const y = Math.abs(numberAny(sample, "fromY") ?? 0);
  return Math.min(10, Math.max(1, Math.round(y / 10)));
}

function presetFor(sample: IrMotionSample): MotionSpec["preset"] | null {
  if (sample.trigger === "inview") return "scroll-reveal";
  if (sample.trigger === "appear") return sample.library === "framer" ? appearPreset(sample) : "fade-up";
  if (sample.trigger === "hover") return "hover-lift";
  if (sample.trigger === "scroll") {
    const delta = numberParam(sample, "delta");
    return delta === undefined || Math.abs(delta) <= 12 ? "scroll-reveal" : "parallax-subtle";
  }
  if (sample.trigger === "time") {
    const name = typeof sample.params.name === "string" ? sample.params.name : "";
    return /translate|ticker|marquee|slide/i.test(name) ? "marquee" : null;
  }
  return null;
}

function specFor(sample: IrMotionSample, preset: MotionSpec["preset"], baseDurationMs: number): MotionSpec {
  const duration = durationSeconds(sample);
  const delay = numberParam(sample, "delay");
  const stagger = numberParam(sample, "stagger");
  const tokens = {
    // `durationScale` is relative to the site's base duration (`baseDurationMs`,
    // 300 in the default theme), so the absolute seconds of the source only
    // become a scale through that base. The import therefore needs the base of
    // the theme the page lands in — passing the default here would bake a 1.4 s
    // reveal as 1.4 s only in a theme whose base happens to be 300 ms.
    ...(duration === undefined || baseDurationMs <= 0
      ? {}
      : { durationScale: Math.max(0.1, Math.round((duration / (baseDurationMs / 1000)) * 1000) / 1000) }),
    ...(stagger === undefined ? {} : { stagger: Math.max(0.1, stagger) }),
  };
  return {
    preset,
    ...(sample.library === "framer" && sample.trigger === "appear" ? { intensity: appearIntensity(sample) } : {}),
    // Framer's delay is already in seconds with a fraction (0.3); rounding it to
    // an integer would drop every sub-second delay.
    ...(delay === undefined
      ? {}
      : { delay: sample.library === "framer" ? Math.round(delay * 100) / 100 : Math.round(delay) }),
    ...(Object.keys(tokens).length === 0 ? {} : { tokens }),
    trigger: sample.trigger === "inview" || sample.trigger === "scroll" ? "viewport" : sample.trigger === "hover" ? "hover" : "load",
    reducedMotion: "static",
  };
}

export type MotionMappingOptions = {
  // The base duration of the theme the page lands in. `durationScale` is
  // relative to it, so the source's absolute seconds can only become a scale
  // through this number. Default 300: the default theme's `motion.duration.base`
  // (`packages/tokens/src/default-theme.ts`), used when the caller has no theme.
  baseDurationMs?: number;
};

export function mapFramerMotion(
  document: FramerIrDocument,
  options: MotionMappingOptions = {},
): MotionMappingResult {
  const baseDurationMs = options.baseDurationMs ?? 300;
  const mappings: MotionMapping[] = [];
  const findings: MotionMappingResult["findings"] = [];
  document.motion.forEach((sample, sampleIndex) => {
    const preset = presetFor(sample);
    if (preset === null) {
      findings.push({
        sample,
        reason:
          sample.library === "framer" && sample.trigger === "appear"
            ? `Framer-Effekt (Start x ${numberAny(sample, "fromX") ?? 0}, y ${numberAny(sample, "fromY") ?? 0}, Skalierung ${numberAny(sample, "fromScale") ?? 1}) hat kein passendes Senify-Preset: nur Einblendungen von unten (ohne Seitwärtsbewegung oder Skalierung) sind abbildbar.`
            : `Sample ${sample.library}/${sample.trigger} wird durch die geschlossene Senify-Motion-Registry nicht abgebildet.`,
      });
      return;
    }
    mappings.push({
      sampleIndex,
      nodeKey: sample.nodeKey,
      preset,
      spec: specFor(sample, preset, baseDurationMs),
      reason: `Framer-Sample ${sample.library}/${sample.trigger} auf "${preset}" abgebildet.`,
    });
  });
  return {
    mappings,
    findings,
    measured: document.motion.length,
    mapped: mappings.length,
    documented: findings.length,
  };
}
