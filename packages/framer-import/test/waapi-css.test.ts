import { describe, expect, it } from "vitest";
import { compileWaapiRules } from "../src/waapi-css.ts";
import type { IrMotionSample } from "../src/ir.ts";

// U5e (Live-Messung 26.10.2026): Die echte Seite hat 7 WAAPI-Effekte, davon 4
// Wort-Einblendungen mit Delay 0/50/100/150 ms. Der Import hat daraus VIER
// Presets gemacht ("fade-up") und damit genau das verworfen, was die Bewegung
// ausmacht: die Staffelung, die Dauer und die Feder.
//
// Diese Suite prueft den Compiler, der die gemessenen Werte als echte
// `@keyframes` schreibt. Er ist der 1:1-Weg: was der Browser bekommen hat,
// steht danach im gebackenen CSS.

const sample = (params: Record<string, string | number | boolean>, extra: Partial<IrMotionSample> = {}): IrMotionSample => ({
  nodeKey: "n1",
  library: "waapi",
  trigger: "appear",
  params,
  raw: JSON.stringify(params),
  ...extra,
});

const NODE_IDS: Record<string, string> = { n1: "fi1" };

describe("U5e: gemessene Keyframes als CSS", () => {
  it("schreibt eine Wort-Einblendung mit Delay und Easing", () => {
    const result = compileWaapiRules({
      samples: [
        sample({
          duration: 400,
          durationUnit: "ms",
          delay: 50,
          easing: "cubic-bezier(0.44, 0, 0.56, 1)",
          fromOpacity: 0.001,
          toOpacity: 1,
        }),
      ],
      nodeIdByIrKey: NODE_IDS,
      scope: "p1",
      startOrder: 0,
    });
    expect(result.rules).toHaveLength(1);
    const rule = result.rules[0]!;
    // Die Keyframes tragen den Start- und den Endwert.
    expect(rule.keyframes).toContain("opacity:0.001");
    expect(rule.keyframes).toContain("opacity:1");
    // Die Deklaration traegt Dauer, Easing und — entscheidend — den Delay.
    expect(rule.animation).toContain("400ms");
    expect(rule.animation).toContain("cubic-bezier(0.44, 0, 0.56, 1)");
    expect(rule.animation).toContain("50ms");
    // `both`: der Startwert haelt waehrend des Delays, der Endwert danach.
    expect(rule.animation).toContain("both");
    expect(rule.nodeKey).toBe("n1");
  });

  it("erhaelt die Staffelung: vier Effekte behalten ihre vier Delays", () => {
    const result = compileWaapiRules({
      samples: [
        sample({ duration: 400, delay: 0, fromOpacity: 0.001, toOpacity: 1 }, { nodeKey: "n1" }),
        sample({ duration: 400, delay: 50, fromOpacity: 0.001, toOpacity: 1 }, { nodeKey: "n2" }),
        sample({ duration: 400, delay: 100, fromOpacity: 0.001, toOpacity: 1 }, { nodeKey: "n3" }),
        sample({ duration: 400, delay: 150, fromOpacity: 0.001, toOpacity: 1 }, { nodeKey: "n4" }),
      ],
      nodeIdByIrKey: { n1: "fi1", n2: "fi2", n3: "fi3", n4: "fi4" },
      scope: "p1",
      startOrder: 0,
    });
    expect(result.rules).toHaveLength(4);
    // Die Deklaration lautet `<name> <dauer>ms <easing> <delay>ms both`: die
    // Delay-Zahl ist die LETZTE vor `both`. Ein Regex auf die erste ms-Zahl
    // liest die Dauer — genau dieser Fehler stand hier zuerst.
    const delays = result.rules.map((rule) => /(\d+(?:\.\d+)?)ms both$/.exec(rule.animation)?.[1]);
    // Vorher stand hier 4× "fade-up" ohne Delay; jetzt die echte Kaskade.
    expect(delays).toEqual(["0", "50", "100", "150"]);
  });

  it("uebernimmt die abgetastete linear()-Kurve einer geloesten Feder", () => {
    const curve = "linear(0, 0.0089, 0.0315, 0.0684, 0.5, 0.9316, 1)";
    const result = compileWaapiRules({
      samples: [sample({ duration: 1050, easing: curve, fromOpacity: 0, toOpacity: 1 })],
      nodeIdByIrKey: NODE_IDS,
      scope: "p1",
      startOrder: 0,
    });
    expect(result.rules[0]?.animation).toContain(curve);
  });

  it("schreibt eine Verschiebung als transform in beide Frames", () => {
    const result = compileWaapiRules({
      samples: [
        sample({ duration: 400, easing: "ease-out", fromOpacity: 0, toOpacity: 1, fromY: 28, toY: 0 }),
      ],
      nodeIdByIrKey: NODE_IDS,
      scope: "p1",
      startOrder: 0,
    });
    const rule = result.rules[0]!;
    expect(rule.keyframes).toContain("translateY(28px)");
    // Der Endframe muss den Transform AUCH nennen, sonst interpoliert der
    // Browser von `none` und die Bewegung ist eine andere.
    expect((rule.keyframes.match(/transform:/g) ?? []).length).toBe(2);
  });

  it("nennt keinen Transform, wenn keiner animiert wurde", () => {
    const result = compileWaapiRules({
      samples: [sample({ duration: 400, fromOpacity: 0, toOpacity: 1 })],
      nodeIdByIrKey: NODE_IDS,
      scope: "p1",
      startOrder: 0,
    });
    // Ein `transform:none` auf einem Frame, das nie einen Transform animierte,
    // wuerde einen Hover-Transform des Elements zuruecksetzen.
    expect(result.rules[0]?.keyframes).not.toContain("transform");
  });

  it("meldet einen Effekt ohne Zielelement, statt ihn zu verschweigen", () => {
    const result = compileWaapiRules({
      samples: [sample({ duration: 400, fromOpacity: 0, toOpacity: 1 }, { nodeKey: "n999" })],
      nodeIdByIrKey: NODE_IDS,
      scope: "p1",
      startOrder: 0,
    });
    expect(result.rules).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain("Vorfahren");
  });

  it("vergibt einem Element nur einen Effekt", () => {
    const result = compileWaapiRules({
      samples: [
        sample({ duration: 400, fromOpacity: 0, toOpacity: 1 }),
        sample({ duration: 800, fromOpacity: 0, toOpacity: 1 }),
      ],
      nodeIdByIrKey: NODE_IDS,
      scope: "p1",
      startOrder: 0,
    });
    expect(result.rules).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain("bereits");
  });

  it("laesst Loops und Scroll-Samples liegen", () => {
    const result = compileWaapiRules({
      samples: [
        sample({ duration: 400, fromOpacity: 0, toOpacity: 1 }, { trigger: "time" }),
        sample({ duration: 400, fromOpacity: 0, toOpacity: 1 }, { trigger: "scroll" }),
      ],
      nodeIdByIrKey: NODE_IDS,
      scope: "p1",
      startOrder: 0,
    });
    expect(result.rules).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
  });

  it("weist ein Easing ab, das die Deklaration aufbrechen koennte", () => {
    const result = compileWaapiRules({
      samples: [
        sample({
          duration: 400,
          easing: "ease-out; background: red",
          fromOpacity: 0,
          toOpacity: 1,
        }),
      ],
      nodeIdByIrKey: NODE_IDS,
      scope: "p1",
      startOrder: 0,
    });
    // Kein Durchreichen: die Deklaration faellt auf den Standard zurueck.
    expect(result.rules[0]?.animation).not.toContain("background");
    expect(result.rules[0]?.animation).toContain("ease-out");
  });
});
