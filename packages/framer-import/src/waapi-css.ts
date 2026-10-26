// Die im Browser GEMESSENEN Keyframes als CSS backen.
//
// Warum das der 1:1-Weg ist und ein Preset es nicht sein kann:
//
// Framer rechnet seine Federn selbst aus und uebergibt dem Browser **fertige
// Zwischenwerte als CSS-Strings** (`translateY(28px)`, `blur(12px)`) plus eine
// abgetastete `linear(...)`-Kurve. Diese Werte sind bereits das, was eine
// `@keyframes`-Regel braucht - es gibt nichts zu uebersetzen und nichts zu
// raten. Ein Senify-Preset (`fade-up`, `scroll-reveal`) ist dagegen ein
// Naeherungsbegriff: er kennt nur "von unten einblenden", nicht die
// Staffelung, nicht den Weichzeichner, nicht die Feder.
//
// Gemessen am 26.10.2026 auf `concerned-circumstances-187935`: 7 WAAPI-Effekte,
// davon 4 Wort-Einblendungen mit Delay 0/50/100/150 ms, 400 ms Dauer und
// `cubic-bezier(0.44, 0, 0.56, 1)`, dazu 2 Effekte mit 1050 ms und einer
// abgetasteten `linear(...)`-Kurve. Alle 7 tragen jetzt ihren Startwert.
//
// Was hier NICHT passiert: eine Feder nachrechnen. Was der Browser bekommen
// hat, wird aufgeschrieben; was er nicht bekommen hat, wird nicht erfunden.

import type { IrMotionSample } from "./ir.ts";

export type WaapiFrame = Record<string, string>;

export type CompiledMotionRule = {
  // Rule id and class name, scoped to the page like every imported rule.
  id: string;
  name: string;
  // One `@keyframes` block. `rawCss` accepts exactly one (ADR-0005).
  keyframes: string;
  // The `animation` shorthand for the node's style.
  animation: string;
  // The IR key of the node the effect belongs to.
  nodeKey: string;
};

export type CompileWaapiResult = {
  rules: CompiledMotionRule[];
  // Samples that produced nothing, with the reason. The report shows them
  // instead of dropping them silently.
  skipped: { nodeKey: string | null; reason: string }[];
};

const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

// The offset of a frame as a percentage: a two-frame effect is 0 % / 100 %, a
// three-frame one 0 / 50 / 100. Framer hands over end states, not sampled
// timelines, so an even distribution is the honest reading.
const offsetOf = (index: number, total: number): string => {
  if (total <= 1) return "0%";
  return `${round((index / (total - 1)) * 100, 2)}%`;
};

// A CSS timing function, or the fallback. `linear(0, 0.0034, …)` and
// `cubic-bezier(…)` are both valid CSS values and are carried verbatim; the
// `linear(0, 1)` that Framer writes for a plain fade is valid too.
function easingOf(sample: IrMotionSample): string {
  const ease = sample.params["easing"];
  if (typeof ease !== "string" || ease.trim() === "") return "ease-out";
  const text = ease.trim();
  // The value goes into the `animation` shorthand, so it must not be able to
  // break out of the declaration.
  if (/[;{}<>@]/.test(text)) return "ease-out";
  if (!/^(cubic-bezier|linear)\([-0-9eE.,+%\s]+\)$/.test(text)) return "ease-out";
  return text;
}

export type CompileWaapiInput = {
  samples: readonly IrMotionSample[];
  // The page scope of the rule ids, so a re-import replaces its own rules.
  scope: string;
  // IR key → the `data-node-id` of the mapped node. Absent for an element that
  // was folded into markup (a word span): its rule still applies, because the
  // mapper puts the class into the span itself. Absent AND no class means the
  // element is gone — that one is reported.
  nodeIdByIrKey?: Readonly<Record<string, string>>;
  // IR keys that received the class in the markup. A sample whose key is here
  // gets a rule even without a node of its own.
  classByIrKey?: Readonly<Record<string, string>>;
  // The `animation` start offset in rule order.
  startOrder: number;
};

// The class name a sample's rule will carry. Pure function of the sample's
// position and the page scope, so the mapper can put the class into the markup
// BEFORE the walk creates the nodes — the word span is rendered as inline HTML
// during the walk, and the class has to be there at that moment.
export function motionClassName(scope: string, sampleIndex: number): string {
  return `fi-${scope}-waapi-${sampleIndex + 1}`;
}

// The samples that can become a rule at all, in document order. Shared by the
// mapper (to assign classes) and the compiler (to emit rules), so both agree on
// which index a sample has.
export function mappableMotionSamples(samples: readonly IrMotionSample[]): { sample: IrMotionSample; index: number }[] {
  const out: { sample: IrMotionSample; index: number }[] = [];
  for (const [index, sample] of samples.entries()) {
    if (sample.trigger !== "appear") continue;
    if (sample.nodeKey === null) continue;
    if (framesFromParams(sample).length < 2) continue;
    out.push({ sample, index });
  }
  return out;
}

export function compileWaapiRules(input: CompileWaapiInput): CompileWaapiResult {
  const rules: CompiledMotionRule[] = [];
  const skipped: CompileWaapiResult["skipped"] = [];
  // One animation per element: two `animation` declarations on the same node do
  // not add up, the second replaces the first. The first measured effect wins
  // and the rest is reported (same rule as the appear compiler).
  const seen = new Set<string>();

  for (const [index, sample] of input.samples.entries()) {
    // Only appearance effects. A loop is the ticker's marquee (its own preset),
    // a scroll sample is the sensor's observation, not a keyframe animation.
    if (sample.trigger !== "appear") {
      skipped.push({ nodeKey: sample.nodeKey, reason: `Auslöser "${sample.trigger}" ist keine Einblendung.` });
      continue;
    }
    if (sample.nodeKey === null) {
      skipped.push({ nodeKey: null, reason: "Der Effekt hat kein Zielelement (die Sonde fand keinen IR-Schlüssel)." });
      continue;
    }
    const nodeId = input.nodeIdByIrKey?.[sample.nodeKey];
    const className = input.classByIrKey?.[sample.nodeKey];
    // Neither a node nor a class in the markup: the element really is gone.
    if (nodeId === undefined && className === undefined) {
      skipped.push({ nodeKey: sample.nodeKey, reason: "Das Zielelement wurde beim Falten zu einem Vorfahren gezogen." });
      continue;
    }
    const target = nodeId ?? className ?? sample.nodeKey;
    if (seen.has(target)) {
      skipped.push({ nodeKey: sample.nodeKey, reason: "Ein anderer Effekt gilt bereits für dieses Element." });
      continue;
    }
    const duration = sample.params["duration"];
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
      skipped.push({ nodeKey: sample.nodeKey, reason: "Der Effekt nennt keine Dauer." });
      continue;
    }
    const frames = framesFromParams(sample);
    if (frames.length < 2) {
      skipped.push({ nodeKey: sample.nodeKey, reason: "Der Effekt hat keinen Anfangs- und keinen Endzustand." });
      continue;
    }
    const name = motionClassName(input.scope, index);
    const body = frames
      .map((frame, frameIndex) => {
        const declarations = Object.entries(frame)
          .map(([property, value]) => `${property}:${value}`)
          .join(";");
        return `${offsetOf(frameIndex, frames.length)}{${declarations}}`;
      })
      .join("");
    const delay = typeof sample.params["delay"] === "number" ? Math.max(0, sample.params["delay"]) : 0;
    const iterations = sample.params["iterations"];
    const repeat = iterations === "endless" ? " infinite" : "";
    rules.push({
      id: name,
      name,
      keyframes: `@keyframes ${name}{${body}}`,
      animation: `${name} ${round(duration, 2)}ms ${easingOf(sample)} ${round(delay, 2)}ms${repeat} both`,
      nodeKey: sample.nodeKey,
    });
    seen.add(target);
  }

  return { rules, skipped };
}

// The start and end state as the browser got them. The params carry the values
// the capture read from the keyframes (`fromOpacity`, `toOpacity`, `fromY`,
// `toY`, `fromScale`, `toScale`); a missing pair means the property was not
// animated and must not appear in the frame (a `transform:none` on a frame
// that never animated a transform would reset a hover transform).
function framesFromParams(sample: IrMotionSample): WaapiFrame[] {
  const number = (key: string): number | undefined => {
    const value = sample.params[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
  const fromOpacity = number("fromOpacity");
  const toOpacity = number("toOpacity");
  const fromY = number("fromY");
  const toY = number("toY");
  const fromX = number("fromX");
  const toX = number("toX");
  const fromScale = number("fromScale");
  const toScale = number("toScale");

  const start: WaapiFrame = {};
  const end: WaapiFrame = {};
  if (fromOpacity !== undefined) start["opacity"] = String(round(fromOpacity));
  if (toOpacity !== undefined) end["opacity"] = String(round(toOpacity));

  const moved = fromX !== undefined || fromY !== undefined || fromScale !== undefined;
  if (moved) {
    const parts = (x?: number, y?: number, scale?: number): string => {
      const out: string[] = [];
      if (x !== undefined && x !== 0) out.push(`translateX(${round(x)}px)`);
      if (y !== undefined && y !== 0) out.push(`translateY(${round(y)}px)`);
      if (scale !== undefined && scale !== 1) out.push(`scale(${round(scale)})`);
      return out.length === 0 ? "none" : out.join(" ");
    };
    start["transform"] = parts(fromX, fromY, fromScale);
    end["transform"] = parts(toX ?? fromX, toY ?? fromY, toScale ?? fromScale);
  }
  // Both frames must carry the same properties, or the browser interpolates
  // the missing one from `none` — a different animation.
  if (Object.keys(start).length === 0) return [];
  for (const property of Object.keys(start)) {
    if (end[property] === undefined) end[property] = defaultEndOf(property, start[property] ?? "");
  }
  const frames: WaapiFrame[] = [start, end];
  return frames;
}

// The resting value of a property: the value an element has when its effect is
// over. Reading it from the start value would leave the element at its start
// state forever.
function defaultEndOf(property: string, start: string): string {
  if (property === "opacity") return "1";
  if (property === "transform") {
    // The start transform with every translation/scale removed: the element
    // rests at its own place.
    return start === "none" ? "none" : start.replace(/(translateX|translateY|scale)\([^)]*\)\s*/g, "").trim() || "none";
  }
  return "initial";
}
