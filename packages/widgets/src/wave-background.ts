// WaveBackground-Kern: vollflaechiger Raymarching-Shader, portiert aus Framer
// WaveBackground.tsx. Framework-neutral wie der Ribbon-Kern: rohes WebGL2, ein
// Fullscreen-Dreieck, ein Draw-Call pro Frame. Die Three.js-Huelle der Quelle
// (OrthographicCamera + PlaneGeometry + CDN-Load) entfaellt; die Shader-
// Mathematik bleibt unveraendert, damit das Bild dem Original entspricht.
// Steuerbar werden Zeitfaktor, Wellenhoehe, Leuchten, Farbphase, Saettigung und
// Iterationszahl — bei Defaults bildgleich zur Quelle.

import type { WidgetMount, WidgetProps } from "./contract.ts";

export type WaveOpts = {
  speed: number;
  amplitude: number;
  glow: number;
  phase: number;
  saturation: number;
  steps: number;
  zoom: number;
};

const VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmp;
uniform float uGlow;
uniform float uPhase;
uniform float uSat;
uniform float uSteps;
uniform float uZoom;
out vec4 outColor;

float noise(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 8.6231);
    p3 += dot(p3, p3.yzx + 67.92);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = ((2.0 * fragCoord - iResolution.xy) / iResolution.y) / uZoom;
    vec3 rayDir = normalize(vec3(uv, 1.0));
    vec3 acc = vec3(0.0);
    float totalDistance = 0.0;
    float t = iTime * 0.5 * uSpeed;
    float pixelNoise = noise(fragCoord) * 0.004;
    for (int i = 0; i < 32; i++) {
        if (float(i) >= uSteps) break;
        vec3 p = rayDir * totalDistance;
        p.z -= 2.0;
        float waveHeight = (
            sin(p.x * 4.8 + t) * 0.038 +
            sin(p.z * 0.3 - t * 0.6) * -0.09 +
            sin(p.x * -0.6 - p.z * -0.7 + t * 1.6) * 0.12
        ) * uAmp;
        float distToWave = abs(p.y - waveHeight);
        p /= 9.291;
        float stepSize = min(distToWave - 0.08, pixelNoise) + 0.146;
        totalDistance += stepSize;
        float px = sin(p.x + cos(p.y) * cos(p.z));
        float py = sin(p.z + sin(p.y) * cos(p.x + t));
        float base = smoothstep(0.5, 0.7, px * py);
        float blend = 0.15 / (distToWave * distToWave + 0.01);
        float glow = (0.0085 / (5.1 + stepSize)) * uGlow;
        float fade = smoothstep(36.5, 7.3, totalDistance);
        vec3 col = 1.0 + cos(totalDistance * 3.0 + vec3(0.0, 1.0, 2.0) + uPhase);
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(luma), col, uSat);
        acc += glow * mix(base, 1.0, blend) * fade * col;
    }
    acc += vec3((noise(fragCoord + vec2(12.34, 56.78)) - 0.5) / 128.0);
    outColor = vec4(acc, 1.0);
}`;

const FRAME_INTERVAL = 1000 / 30;
const UNIFORMS = ["iResolution", "iTime", "uSpeed", "uAmp", "uGlow", "uPhase", "uSat", "uSteps", "uZoom"] as const;

type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

class Wave {
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private vs: WebGLShader | null = null;
  private fs: WebGLShader | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private u: Uniforms = Object.fromEntries(UNIFORMS.map((name) => [name, null])) as Uniforms;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private lastFrame = 0;
  private frames = 0;
  private startTime = 0;
  private destroyed = false;
  private lost = false;
  private reduced = false;
  private opts: WaveOpts;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, opts: WaveOpts) {
    this.canvas = canvas;
    this.opts = opts;
    this.createContext();
  }

  get ready(): boolean {
    return this.gl !== null;
  }

  get contextLost(): boolean {
    return this.lost;
  }

  private createContext(): void {
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    }) as WebGL2RenderingContext | null;
    if (!gl || gl.isContextLost()) return;
    this.gl = gl;
    // Die Quelle deckelt die Pixel-Ratio auf 1 (low-power); wir halten das.
    this.dpr = Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, 1);
    this.canvas.addEventListener("webglcontextlost", this.onLost);
    this.canvas.addEventListener("webglcontextrestored", this.onRestored);
    this.initGL();
  }

  private initGL(): void {
    const gl = this.gl;
    if (!gl) return;
    const mk = (type: number, src: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };
    this.vs = mk(gl.VERTEX_SHADER, VS);
    this.fs = mk(gl.FRAGMENT_SHADER, FS);
    const prog = gl.createProgram();
    if (!prog || !this.vs || !this.fs) return;
    gl.attachShader(prog, this.vs);
    gl.attachShader(prog, this.fs);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    this.prog = prog;
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[Wave Background]", gl.getShaderInfoLog(this.fs) || gl.getProgramInfoLog(prog));
      this.gl = null;
      return;
    }
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    for (const name of UNIFORMS) this.u[name] = gl.getUniformLocation(prog, name);
    gl.useProgram(prog);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    this.applyOpts();
    if (this.w > 0 && this.h > 0) this.setSize(this.w, this.h);
    this.render(0);
    this.installHandle();
  }

  private applyOpts(): void {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    gl.useProgram(this.prog);
    gl.uniform1f(this.u.uSpeed, this.opts.speed);
    gl.uniform1f(this.u.uAmp, this.opts.amplitude);
    gl.uniform1f(this.u.uGlow, this.opts.glow);
    gl.uniform1f(this.u.uPhase, this.opts.phase);
    gl.uniform1f(this.u.uSat, this.opts.saturation);
    gl.uniform1f(this.u.uSteps, this.opts.steps);
    gl.uniform1f(this.u.uZoom, this.opts.zoom);
  }

  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const gl = this.gl;
    if (!gl) return;
    const bw = Math.max(1, Math.round(w * this.dpr));
    const bh = Math.max(1, Math.round(h * this.dpr));
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    gl.viewport(0, 0, bw, bh);
    gl.uniform3f(this.u.iResolution, bw, bh, 1);
    if (this.reduced) this.render(0);
  }

  private render(time: number): void {
    const gl = this.gl;
    if (!gl || !this.prog || this.lost) return;
    gl.useProgram(this.prog);
    gl.uniform1f(this.u.iTime, time);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.frames += 1;
  }

  private tick = (now: number): void => {
    if (this.destroyed || this.lost || this.reduced) return;
    this.raf = requestAnimationFrame(this.tick);
    if (typeof document !== "undefined" && document.hidden) return;
    if (now - this.lastFrame < FRAME_INTERVAL) return;
    this.lastFrame = now;
    this.render((now - this.startTime) / 1000);
  };

  play(): void {
    if (this.destroyed || this.reduced || this.raf) return;
    this.startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.lastFrame = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) {
      if (this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
      // Reduced Motion: ein einziges Standbild statt der Laufzeit-Animation.
      this.render(0);
    } else {
      this.play();
    }
  }

  setOpts(opts: WaveOpts): void {
    this.opts = opts;
    this.applyOpts();
    if (this.reduced) this.render(0);
  }

  private onLost = (event: Event): void => {
    event.preventDefault();
    this.lost = true;
    this.gl = null;
    this.prog = this.vs = this.fs = this.vao = this.buf = null;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  };

  private onRestored = (): void => {
    if (this.destroyed) return;
    this.lost = false;
    const gl = this.canvas.getContext("webgl2") as WebGL2RenderingContext | null;
    if (!gl) return;
    this.gl = gl;
    this.initGL();
    if (!this.reduced) this.play();
  };

  // Debug-/Test-Hook (Vorbild Ribbon `__ribbon`): der Browser-Test liest Frames,
  // Kontext und die aktuellen Opts, ohne in die Klasse einzudringen.
  private installHandle(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the handle's getters re-bind this to the handle, not the instance
    const self = this;
    const handle = {
      get frames() { return self.frames; },
      get hasContext() { return !!self.gl; },
      get running() { return self.raf !== 0; },
      get reduced() { return self.reduced; },
      get opts() { return { ...self.opts }; },
      get size() { return [self.canvas.width, self.canvas.height, self.w, self.h]; },
    };
    try {
      Object.defineProperty(this.canvas, "__wave", { value: handle, enumerable: false, configurable: true });
    } catch {
      /* Debug-Hook only */
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    const gl = this.gl;
    if (gl) {
      if (this.buf) gl.deleteBuffer(this.buf);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.prog) gl.deleteProgram(this.prog);
      if (this.vs) gl.deleteShader(this.vs);
      if (this.fs) gl.deleteShader(this.fs);
    }
    this.gl = null;
  }
}

export function waveOptsFromProps(props: WidgetProps): WaveOpts {
  const num = (key: string, fallback: number): number =>
    typeof props[key] === "number" ? (props[key] as number) : fallback;
  return {
    speed: Math.max(0, num("speed", 1)),
    amplitude: Math.max(0, num("amplitude", 1)),
    glow: Math.max(0, num("glow", 1)),
    phase: num("phase", 0),
    saturation: Math.min(1, Math.max(0, num("saturation", 1))),
    steps: Math.min(32, Math.max(4, Math.round(num("steps", 22)))),
    zoom: Math.max(0.1, num("zoom", 1)),
  };
}

export const mount: WidgetMount = (host, props) => {
  // Canvas aus dem Markup nutzen; nie einen zweiten Host erzeugen.
  let canvas = host.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.appendChild(canvas);
  }
  const wave = new Wave(canvas, waveOptsFromProps(props));
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const syncSize = (): void => {
    wave.setSize(host.offsetWidth, host.offsetHeight);
    if (host.offsetWidth > 0 && host.offsetHeight > 0 && !wave.ready && !wave.contextLost) {
      host.setAttribute("data-widget-state", "failed");
    }
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(syncSize) : null;
  ro?.observe(host);
  const mq =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  const onMq = (): void => wave.setReduced(!!mq && mq.matches);
  mq?.addEventListener?.("change", onMq);
  syncSize();
  wave.setReduced(reduced);
  let destroyed = false;
  return {
    setProps(next: WidgetProps): void {
      if (destroyed) return;
      wave.setOpts(waveOptsFromProps(next));
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      ro?.disconnect();
      mq?.removeEventListener?.("change", onMq);
      wave.destroy();
    },
  };
};