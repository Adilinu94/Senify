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

function specFor(sample: IrMotionSample, preset: MotionSpec["preset"]): MotionSpec {
  const duration = numberParam(sample, "duration");
  const delay = numberParam(sample, "delay");
  const stagger = numberParam(sample, "stagger");
  const tokens = {
    ...(duration === undefined ? {} : { durationScale: Math.max(0.1, duration / 300) }),
    ...(stagger === undefined ? {} : { stagger: Math.max(0.1, stagger) }),
  };
  return {
    preset,
    ...(sample.library === "framer" && sample.trigger === "appear" ? { intensity: appearIntensity(sample) } : {}),
    ...(delay === undefined ? {} : { delay: Math.round(delay) }),
    ...(Object.keys(tokens).length === 0 ? {} : { tokens }),
    trigger: sample.trigger === "inview" || sample.trigger === "scroll" ? "viewport" : sample.trigger === "hover" ? "hover" : "load",
    reducedMotion: "static",
  };
}

export function mapFramerMotion(document: FramerIrDocument): MotionMappingResult {
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
      spec: specFor(sample, preset),
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
