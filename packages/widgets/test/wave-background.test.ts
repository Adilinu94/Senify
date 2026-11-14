import { describe, expect, it } from "vitest";
import { waveOptsFromProps } from "../src/wave-background.ts";

describe("wave-background props mapping", () => {
  it("applies the source defaults (bildgleich zur Quelle)", () => {
    const opts = waveOptsFromProps({});
    expect(opts).toEqual({
      speed: 1,
      amplitude: 1,
      glow: 1,
      phase: 0,
      saturation: 1,
      steps: 22,
      zoom: 1,
    });
  });
  it("maps flat widget props to WaveOpts", () => {
    const opts = waveOptsFromProps({
      speed: 2,
      amplitude: 0.5,
      glow: 2.5,
      phase: 3.14,
      saturation: 0.4,
      steps: 16,
      zoom: 1.5,
    });
    expect(opts.speed).toBe(2);
    expect(opts.amplitude).toBe(0.5);
    expect(opts.glow).toBe(2.5);
    expect(opts.phase).toBeCloseTo(3.14);
    expect(opts.saturation).toBeCloseTo(0.4);
    expect(opts.steps).toBe(16);
    expect(opts.zoom).toBe(1.5);
  });
  it("clamps to safe ranges and rounds the iteration count", () => {
    const opts = waveOptsFromProps({
      speed: -1,
      amplitude: -2,
      glow: -1,
      saturation: 5,
      steps: 99,
      zoom: 0,
    });
    expect(opts.speed).toBe(0);
    expect(opts.amplitude).toBe(0);
    expect(opts.glow).toBe(0);
    expect(opts.saturation).toBe(1);
    expect(opts.steps).toBe(32);
    expect(opts.zoom).toBeCloseTo(0.1);
    expect(waveOptsFromProps({ steps: 2 }).steps).toBe(4);
    expect(waveOptsFromProps({ steps: 12.7 }).steps).toBe(13);
  });
  it("ignores non-number props and falls back to defaults", () => {
    const opts = waveOptsFromProps({ speed: "schnell", steps: null, zoom: undefined });
    expect(opts.speed).toBe(1);
    expect(opts.steps).toBe(22);
    expect(opts.zoom).toBe(1);
  });
});