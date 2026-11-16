// Ribbon-Gallery-Kern: WebGL-Renderer fuer den Widget-Island.
//
// Der Kern (Geometrie, Shader, Bild-Pipeline, Ticker, Klasse Ribbon) ist
// verbatim aus `.scratch/Ribbon_Gallery.tsx` (Zeilen 6-1180) uebernommen; nur
// die Komponenten-Huelle ist durch `ribbonOptsFromProps` + `mount` ersetzt.
// Abweichungen sind ausschliesslich Typen (noUncheckedIndexedAccess, kein any)
// und zwei Kommentare, die die alte Huelle nannten.
import type { WidgetMount, WidgetProps } from "./contract.ts";

// ---------------------------------------------------------------------------
// Measured reference geometry (Origin hero). The ribbon is defined for the
// LEFT side; Side = Right is the same picture rotated 180 degrees about the
// box centre (flow direction, image orientation and phase all follow).
// ---------------------------------------------------------------------------

// Centreline deviation from the mid-height x, in box heights, at y/h = 0.04, 0.06 ... 0.50 (symmetric about 0.5).
const DEV = [
    0.06966, 0.08263, 0.09279, 0.09922, 0.10171, 0.1003, 0.09541, 0.08755, 0.07784, 0.06771, 0.05813, 0.04937, 0.04138,
    0.03419, 0.02764, 0.02176, 0.01668, 0.01224, 0.0085, 0.00547, 0.00307, 0.00144, 0.00042, 0,
]
// Silhouette width relative to the mid-height width (it grows with the lens magnification near the ends).
const WR = [
    1.0535, 1.1052, 1.1721, 1.218, 1.2161, 1.174, 1.109, 1.0421, 0.9962, 0.9809, 0.9771, 0.9732, 0.9732, 0.9732,
    0.9751, 0.9771, 0.9809, 0.9866, 0.9943, 0.9962, 0.9981, 1, 1.0019, 1,
]
const DEV_SLOPE = (DEV[1]! - DEV[0]!) / 0.02
const X_MID = 0.233125 // mid-height centre x as a fraction of the canonical box (hero x 9 %, width 16 %)
const CARD_LEN = 0.4238 // card length along the path, in box heights
const PHASE_REF = -0.01176 // card 0 centre at t = 0, relative to the path point at y = 0.035 h
const CARD_RATIO = 1.2 // image cover-crop aspect (long axis along the path)
const LAYER_W = 1024 // texels along the path
const LAYER_H = 256 // texels across
const LAYER_LEVELS = 11
const MAX_IMAGES = 12
const PATH_EXT = 0.06 // path extension past the top and bottom edges, in box heights
const LENS_Z = 0.215265 // fitted lens onset (arc from the edge, box heights) at End zone 18.5 %
const ROWS = 240
const FLOATS = 5 // x, y, s, q, half


function tableAt(T: number[], m: number) {
    const f = (m - 0.04) / 0.02
    const i = Math.max(0, Math.min(T.length - 2, Math.floor(f)))
    const t = f - i
    const p0 = i > 0 ? T[i - 1]! : 2 * T[0]! - T[1]!
    const p1 = T[i]!
    const p2 = T[i + 1]!
    const p3 = i + 2 < T.length ? T[i + 2]! : T[T.length - 2]!
    const t2 = t * t
    return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t2 * t)
}
function devAt(yn: number) {
    const m = yn <= 0.5 ? yn : 1 - yn
    return m >= 0.04 ? tableAt(DEV, m) : DEV[0]! - DEV_SLOPE * (0.04 - m)
}
function widthAt(yn: number) {
    const m = yn <= 0.5 ? yn : 1 - yn
    return m >= 0.04 ? tableAt(WR, m) : WR[0]!
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// ---------------------------------------------------------------------------
// Shaders: one program, one triangle strip, one draw call per frame.
// Along-path quantities are in box heights, across quantities in CSS px.
// ---------------------------------------------------------------------------
const VS = `#version 300 es
in vec2 aPos;
in vec3 aData;
uniform vec2 uBox;
out float vS;
out float vQ;
out float vHalf;
void main() {
    vec2 c = aPos / uBox * 2.0 - 1.0;
    gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
    vS = aData.x;
    vQ = aData.y;
    vHalf = aData.z;
}`

const FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in float vS;
in float vQ;
in float vHalf;
uniform sampler2DArray uTex;
uniform float uFlow;
uniform float uAppearT;
uniform vec4 uEnds;   // sTop, sBot, zone scale, unused
uniform vec4 uCard;   // sigma0, period, half length, radius px
uniform vec4 uOpt;    // dispersion, bloom, fringe, smear
uniform vec4 uAp;     // delay, stagger, duration, lead card
uniform vec4 uMisc;   // h px, dpr, layers, rank direction
uniform vec2 uMisc2;  // rank cap, unused
uniform float uReady[12];
out vec4 outColor;
const float PI = 3.14159265;
// Fold lens (box heights of arc from the end, at End zone 18.5 %). Content distance c(d) is C1 with a smooth
// minimum at the fold (c'(LF) = 0): approaching content is magnified, turns round on a parabola at the fold and
// runs back out mirrored. Both branches are quintics fitted (< 0.3 px) to the round-2 measured content map
// outside +-0.02 h of the fold; inside it they replace the old cusp by the zero-slope turnaround the Ref B
// kymographs show. Identity (c = d, c' = 1) from the onset LZ.
const float LZ = 0.215265;
const float LF = 0.138769;
const float LX = 0.076496;      // LZ - LF
const float LC0 = 0.16977429;
const float A2 = 23.82462;
const float A3 = -547.29955;
const float A4 = 6503.4911;
const float A5 = -27345.221;
const float B2 = 15.018817;
const float B3 = -130.65019;
const float B4 = 975.43437;
const float B5 = -2522.5825;
// beyond the hero edge (y > LF) the outer branch continues linearly (C1)
const float BYC = 0.34176526;      // c(y = LF)
const float BYG = 2.3697975;       // c'(y = LF)
// Curved fold (2-D map, same for colour and coverage). The fold line stays fixed on screen; the content that
// turns round on it varies across the ribbon through a C1 bump (1 on the fold, 0 beyond +-BUMP_W):
//   c(d, q) = lens(d) + (FOLD_OFF[_X] + FOLD_TILT q/halfW + FOLD_DISP per channel) * bump(d)
// FOLD_TILT < 0: the inner edge (q > 0, toward the hero centre) turns round on the lowest content, so a gap
// notches in from the inner side at the entry end (Ref B 3.6-4.0 s, both ribbons) and a departing card
// lingers there as a vertical almond / the arriving card reaches the fold first on the outer side as an
// hourglass neck at the exit end (t0.9 / t1.3). Exit end (s-top) holds content slightly longer (FOLD_OFF_X).
// FOLD_DISP: each channel turns round on slightly different content (G 0.4, B 1 x Dispersion).
const float BUMP_W = 0.08;
const float FOLD_TILT = -0.04;
const float FOLD_OFF = 0.002;
const float FOLD_OFF_X = 0.008;
const float FOLD_DISP = -0.002;
const float SPEC_G = 0.15;       // spectral position of G's first tap (R 0, B SPEC_B)
const float SPEC_B = 0.85;
const float SPEC_STEP = 0.15;    // second tap per channel: this much further along the spectrum
const float SPEC_RAMP = 0.3;    // zone factor over which the second tap ramps in
const float BLUR_R = 1.0;
const float ACROSS_DISP = 0.3;  // how much of the per-channel smear width also applies across
const float WASH = 0.6;         // wash toward white at the very end (x Bloom)
const float WASH_IN = 0.3;
const float BLUR_G = 1.5;       // per-channel smear width (dispersion): R 1, G, B
const float BLUR_B = 3.0;
const float ACROSS_SPLIT = 1.0;  // zone across split (mid zone keeps round 4's 0.48 px)
const float FRINGE_SPILL = 0.28;
// content-space blur radius at the very end (box heights, x Smear), ramped over the zone; mip-filtered
const float CBLUR = 0.003;
const float BLUR_ACROSS_ZONE = 7.0;
const float G_MAX = 1.5;
const float LOD_BIAS = -0.5;
const float A_IN = 0.007;
const float A_OUT = 0.022;
const float OUT_HOLD = 0.8;

// content distance from the end for screen distance d (both / zone scale); g = dc/dd
float lensC(float d, out float g) {
    float x = d - LF;
    if (x >= LX) { g = 1.0; return d; }
    if (x >= 0.0) {
        g = x * (2.0 * A2 + x * (3.0 * A3 + x * (4.0 * A4 + x * 5.0 * A5)));
        return LC0 + x * x * (A2 + x * (A3 + x * (A4 + x * A5)));
    }
    float y = min(-x, LF);
    float e = -x - y;
    float gy = y * (2.0 * B2 + y * (3.0 * B3 + y * (4.0 * B4 + y * 5.0 * B5)));
    float cy = LC0 + y * y * (B2 + y * (B3 + y * (B4 + y * B5)));
    g = -mix(gy, BYG, step(0.0, e - 1e-6));
    return e > 0.0 ? BYC + BYG * e : cy;
}

// along-path channel displacement: toward the centre inside the fold, toward the edge beyond it
float shiftAlong(float d) {
    if (d >= LZ) return 0.0;
    if (d >= LF) return A_IN * sin(PI * (d - LF) / LX);
    // beyond the fold: rises from 0 at the fold, peaks and holds OUT_HOLD of the peak at the very end
    float x = clamp(d / LF, 0.0, 1.0);
    return -A_OUT * max(sin(PI * x), OUT_HOLD * smoothstep(1.0, 0.5, x));
}

// One colour channel: (value, coverage x appear alpha). dd = screen distance from the end (box heights).
// Rounded-rect card SDF in feather units at card-local (aa, qq).
float cardSD(float aa, float qq, float halfW, float fAc, float fQ) {
    vec2 pn = vec2(abs(aa) / fAc, abs(qq) / fQ);
    vec2 bn = vec2(uCard.z / fAc, halfW / fQ);
    float rn = min(min(uCard.w, halfW) / fQ, min(bn.x, bn.y));
    vec2 dq = pn - (bn - rn);
    return length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - rn;
}

// One texture tap: (value, coverage x appear alpha). The coverage is the mean of two copies of the card edge:
// the tap's own and one displaced by dsp (along content, box heights; across, CSS px) = the next "wavelength"
// of the sampled spectrum, so edges stack into thin parallel streaks at the cost of one extra SDF (no second
// map, appear or fetch). ag = map compression for the feather / footprint.
vec2 tap(int ch, float pc, float q, float halfW, float ag, float rB, float bQ, float fq0, vec2 dsp) {
    float hPx = uMisc.x;
    float dpr = uMisc.y;
    float k = floor(pc / uCard.y + 0.5);
    float a = pc - k * uCard.y;
    float layer = mod(k, uMisc.z);
    float rank = min(max((k - uAp.w) * uMisc.w, 0.0), uMisc2.x);
    float onset = max(uAp.x + uAp.y * rank, uReady[int(layer + 0.5)]);
    float tau = uAppearT - onset;
    float ex = exp(-3.0 * max(tau, 0.0) / uAp.z);
    float alpha = tau > 0.0 ? 1.0 - ex : 0.0;
    float sc = 1.0 - 0.3 * ex;
    float qq = q / sc;
    float aa = a / sc;
    // the along feather lives in content space (one device px through the map, or the content blur), so a
    // card end crossing the magnified fold softens naturally
    float fAc = max(ag * 0.6 / (dpr * hPx), rB);
    float fQ = fq0 + bQ;
    float sd0 = cardSD(aa, qq, halfW, fAc, fQ);
    // second edge copy only where it is displaced (end zones; a geometric branch, coherent per warp)
    float sd1 = dsp == vec2(0.0) ? sd0 : cardSD(aa + dsp.x / sc, qq + dsp.y / sc, halfW, fAc, fQ);
    float cov = 0.5 * ((1.0 - smoothstep(-1.0, 1.0, sd0)) + (1.0 - smoothstep(-1.0, 1.0, sd1)));
    // isotropic mip footprint (texels): along = map footprint or content blur, across = pixel + soft edge
    float tu = 0.5 - aa / (2.0 * uCard.z);
    float tv = 0.5 - 0.5 * qq / halfW;
    float tAlong = max(ag / (dpr * hPx), 2.0 * rB) * ${(LAYER_W / CARD_LEN).toFixed(3)} / sc;
    float tAcross = (1.0 + bQ * dpr) * ${LAYER_H}.0 / (2.0 * halfW * dpr * sc);
    float lod = log2(max(tAlong, tAcross)) + LOD_BIAS;
    float v = textureLod(uTex, vec3(tu, tv, layer), lod)[ch];
    return vec2(v, cov * alpha);
}

// One colour channel = a stretch of a sampled spectrum. Spectral position k (0 = red end, 1 = violet end) sets
// the along displacement k*sh, the fold dispersion k*fdisp and the across offset (0.5 - k)*e. In the zone the
// channel's second edge copy sits SPEC_STEP further along the spectrum (ramped in by st: no seam at the onset).
vec2 channel(int ch, float k, float d, float sh, float fdisp, float e, float e4, float sEdge, float endSign, float foldOff, float halfW, float rB, float bQ, float fq0, float st) {
    float lam = uEnds.z;
    // the red end keeps round 4's across offset (+0.5 e4, so the fold motion it shows is unchanged); the wider
    // zone split is spent toward the violet end
    float q = vQ + 0.5 * e4 - k * e;
    float qn = clamp(q / halfW, -1.3, 1.3);
    // curved fold: content at the fold shifts with the column (see FOLD_TILT); a card end crossing the fold
    // becomes a rounded notch / neck centred on it, and the map is the plain lens everywhere else
    float sig = foldOff + k * fdisp + FOLD_TILT * qn;
    float g;
    float dl = (d - k * sh) / lam;
    float c = lensC(dl, g);
    float bx = clamp((dl - LF) / BUMP_W, -1.0, 1.0);
    float b1 = 1.0 - bx * bx;
    float bump = b1 * b1;
    c = (c + sig * bump) * lam;
    g += sig * (-4.0 * bx * b1 / BUMP_W);
    float ag = clamp(abs(g), 1e-3, G_MAX);
    float pc = sEdge + endSign * c + uFlow - uCard.x;
    // the next wavelength, linearised through the map: along -g dk sh + dk fdisp bump, across -dk e
    // (blue only: the most dispersed channel carries the halo and the stacked outer streaks; R and G keep one
    // edge, which keeps the GPU cost inside budget)
    float dk = ch == 2 ? SPEC_STEP * st : 0.0;
    vec2 dsp = vec2(endSign * dk * (fdisp * bump * lam - g * sh), -dk * e);
    return tap(ch, pc, q, halfW, ag, rB, bQ, fq0, dsp);
}

void main() {
    float dTop = vS - uEnds.x;
    float dBot = uEnds.y - vS;
    bool top = dTop < dBot;
    float d = top ? dTop : dBot;
    float sEdge = top ? uEnds.x : uEnds.y;
    float endSign = top ? 1.0 : -1.0;
    float hPx = uMisc.x;
    float hn = hPx / 978.0;
    float lam = uEnds.z;
    // fold content offset: the exit end (s-top, content leaving) holds content longer than the entry end
    float foldOff = endSign > 0.0 ? FOLD_OFF_X : FOLD_OFF;
    // dispersion at the fold: each channel turns round on slightly different content (G 0.4, B 1 x)
    float fdisp = FOLD_DISP * uOpt.x;
    float zf = clamp(1.0 - d / (LZ * lam), 0.0, 1.0);
    float zb = pow(zf, 1.2);
    float sh = shiftAlong(d / lam) * lam * uOpt.x;
    float zf15 = pow(zf, 1.5);
    float e = uOpt.z * (0.48 + ACROSS_SPLIT * 16.0 * zf15) * hn;
    float e4 = uOpt.z * (0.48 + 9.6 * zf15) * hn;   // round 4's split (0.6 x (0.8 + 16 zf^1.5))
    // content-space blur (box heights) and the across soft edge (CSS px), both ramped over the zone
    float rB = uOpt.w * CBLUR * zb;
    float bQ = uOpt.w * hn * BLUR_ACROSS_ZONE * zb;
    float fq0 = 0.6 / uMisc.y + uOpt.y * 8.0 * pow(zf, 1.8) * hPx / 1123.0;
    // streak spread (x Dispersion) and wash toward white (x Bloom): both grow over the zone, most beyond the fold
    float past = clamp((LF * lam - d) / (LF * lam), 0.0, 1.0);
    float st = min(1.0, uOpt.x * smoothstep(0.0, SPEC_RAMP, zf));
    float wash = uOpt.y * WASH * zf * (WASH_IN + (1.0 - WASH_IN) * sqrt(past));
    vec2 R = channel(0, 0.0, d, sh, fdisp, e, e4, sEdge, endSign, foldOff, vHalf, rB * BLUR_R, bQ * mix(1.0, BLUR_R, ACROSS_DISP), fq0, st);
    vec2 G = channel(1, SPEC_G, d, sh, fdisp, e, e4, sEdge, endSign, foldOff, vHalf, rB * BLUR_G, bQ * mix(1.0, BLUR_G, ACROSS_DISP), fq0, st);
    vec2 B = channel(2, SPEC_B, d, sh, fdisp, e, e4, sEdge, endSign, foldOff, vHalf, rB * BLUR_B, bQ * mix(1.0, BLUR_B, ACROSS_DISP), fq0, st);
    vec3 col = vec3(R.x, G.x, B.x);
    vec3 al = vec3(R.y, G.y, B.y);
    vec3 absorb = al * (1.0 - col);
    // fringes in the zone carry some of the content's darkness (the reference's yellow is ~205,193,64, not pure)
    absorb = mix(absorb, vec3(max(absorb.r, max(absorb.g, absorb.b))), FRINGE_SPILL * sqrt(zf));
    // wash toward white: light/mid content goes pale (transparent over white) while dark detail keeps its depth,
    // so the inverted content reads pale but the per-channel dark streaks stay saturated
    absorb *= mix(vec3(1.0), absorb, clamp(wash, 0.0, 1.0));
    float A = max(max(absorb.r, max(absorb.g, absorb.b)), min(al.r, min(al.g, al.b)));
    outColor = vec4(A - absorb, A);
}`

// ---------------------------------------------------------------------------
// Shared image cache: one decode per URL for every instance on the page.
// ---------------------------------------------------------------------------
type CacheEntry = { refs: number; bitmap: ImageBitmap | null; failed: boolean; promise: Promise<ImageBitmap | null> }
const CACHE = new Map<string, CacheEntry>()

async function decodeLayer(url: string): Promise<ImageBitmap> {
    const res = await fetch(url, { mode: "cors", credentials: "omit" })
    if (!res.ok) throw new Error("image " + res.status)
    const blob = await res.blob()
    const probe = await createImageBitmap(blob)
    const iw = probe.width
    const ih = probe.height
    probe.close()
    let sw = iw
    let sh = ih
    if (iw / ih > CARD_RATIO) sw = Math.round(ih * CARD_RATIO)
    else sh = Math.round(iw / CARD_RATIO)
    const sx = Math.round((iw - sw) / 2)
    const sy = Math.round((ih - sh) / 2)
    let out: ImageBitmap | null = null
    try {
        out = await createImageBitmap(blob, sx, sy, sw, sh, { resizeWidth: LAYER_W, resizeHeight: LAYER_H, resizeQuality: "high" })
    } catch {
        out = null
    }
    if (out && out.width === LAYER_W && out.height === LAYER_H) return out
    if (out) out.close()
    // Fallback for engines without resize options: one small 2D draw.
    const full = await createImageBitmap(blob)
    const cv: HTMLCanvasElement | OffscreenCanvas =
        typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(LAYER_W, LAYER_H) : Object.assign(document.createElement("canvas"), { width: LAYER_W, height: LAYER_H })
    const ctx = cv.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) throw new Error("2d")
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(full, sx, sy, sw, sh, 0, 0, LAYER_W, LAYER_H)
    full.close()
    return createImageBitmap(cv)
}

function acquireImage(url: string): CacheEntry {
    let e = CACHE.get(url)
    if (!e) {
        const entry: CacheEntry = { refs: 0, bitmap: null, failed: false, promise: Promise.resolve(null) }
        entry.promise = decodeLayer(url).then(
            (bmp) => {
                if (entry.refs <= 0 && CACHE.get(url) !== entry) {
                    bmp.close()
                    return null
                }
                entry.bitmap = bmp
                return bmp
            },
            () => {
                entry.failed = true
                return null
            }
        )
        CACHE.set(url, entry)
        e = entry
    }
    e.refs++
    return e
}

function releaseImage(url: string) {
    const e = CACHE.get(url)
    if (!e) return
    e.refs--
    if (e.refs > 0) return
    // keep the decode for a moment so a remount (breakpoint switch, Strict Mode) does not decode again
    setTimeout(() => {
        if (e.refs > 0 || CACHE.get(url) !== e) return
        if (e.bitmap) e.bitmap.close()
        CACHE.delete(url)
    }, 2000)
}

// ---------------------------------------------------------------------------
// Shared ticker: one requestAnimationFrame loop for every instance.
// ---------------------------------------------------------------------------
const LIVE = new Set<Ribbon>()
let rafId = 0
function tick(now: number) {
    rafId = 0
    // hidden tab: stop; setDocVisible() wakes the loop again
    if (document.visibilityState === "hidden") return
    // offscreen instances only finish pending uploads; they leave the set once idle
    LIVE.forEach((r) => r.frame(now, r.inView))
    if (LIVE.size > 0) rafId = requestAnimationFrame(tick)
}
function wake(r: Ribbon) {
    LIVE.add(r)
    if (!rafId) rafId = requestAnimationFrame(tick)
}
function rest(r: Ribbon) {
    LIVE.delete(r)
    if (LIVE.size === 0 && rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
    }
}

// ---------------------------------------------------------------------------
// Renderer (plain class; the shell only forwards props and observer events).
// ---------------------------------------------------------------------------
type Mode = "live" | "canvas" | "static" | "fixed"
type Trigger = "layerInView" | "appear" | "none"
interface RibbonOpts {
    mode: Mode
    fixedT: number
    urls: string[]
    side: 1 | -1
    flowSign: 1 | -1
    speed: number
    curve: number
    twist: number
    width: number
    gap: number
    radius: number
    phase: number
    dispersion: number
    smear: number
    fringe: number
    bloom: number
    zone: number
    trigger: Trigger
    start: "top" | "center" | "bottom"
    replay: boolean
    delay: number
    stagger: number
    duration: number
    previewKey: number
    editKey: string
}

type U = Record<string, WebGLUniformLocation | null>
// Minimal shapes of the two WebGL extensions the core touches (narrow, so no any is needed).
type ParallelCompile = { COMPLETION_STATUS_KHR: number }
type GpuTimer = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
const OWNER = new WeakMap<HTMLCanvasElement, Ribbon>()

class Ribbon {
    host: HTMLDivElement
    canvas: HTMLCanvasElement
    o: RibbonOpts
    gl: WebGL2RenderingContext | null = null
    prog: WebGLProgram | null = null
    vs: WebGLShader | null = null
    fs: WebGLShader | null = null
    vao: WebGLVertexArrayObject | null = null
    buf: WebGLBuffer | null = null
    tex: WebGLTexture | null = null
    texLayers = 0
    u: U = {}
    compiling = false
    parallel: ParallelCompile | null = null
    lost = false
    destroyed = false
    w = 0
    h = 0
    dpr = 1
    verts = 0
    rowSigma = 0
    geo = { sTop: 0, sBot: 1, zone: 0.2, fold: 0.13, sigma0: 0 }
    geoKey = ""
    sizeKey = ""
    // visibility / time
    inView = false
    docVisible = true
    reduced = false
    triggered = false
    rearm = false
    flowT = 0
    appearStart = 0
    last = 0
    kLead = 0
    leadSent = NaN
    broken = false
    rankDir = 1
    rankCap = 3
    editUntil = 0
    dirty = true
    uniformsDirty = true
    // images
    urls: string[] = []
    layerReady = new Float32Array(MAX_IMAGES).fill(1e9)
    layerState: number[] = [] // 0 pending, 1 uploaded, 2 failed
    uploadQueue: number[] = []
    // context restore: appear stamps of layers already shown, held back until the layer is uploaded again
    restoreStamp = new Float32Array(MAX_IMAGES).fill(NaN)
    drainUploads = false
    // debug
    cpuMs = new Float32Array(120)
    cpuIdx = 0
    frames = 0
    drawCalls = 0
    maxUploadMs = 0
    uploadMs: number[] = []
    loaded = false
    gpuTimer: GpuTimer | null = null
    gpuQuery: WebGLQuery | null = null
    gpuMs = new Float32Array(120)
    gpuIdx = 0

    constructor(host: HTMLDivElement, canvas: HTMLCanvasElement, o: RibbonOpts) {
        this.host = host
        this.canvas = canvas
        this.o = o
        this.docVisible = typeof document === "undefined" || document.visibilityState !== "hidden"
        this.onLost = this.onLost.bind(this)
        this.onRestored = this.onRestored.bind(this)
        this.setImages(o.urls)
        this.installHandle()
    }

    // ---- lifecycle ----
    setSize(w: number, h: number) {
        if (this.destroyed) return
        this.w = w
        this.h = h
        if (w <= 0 || h <= 0) {
            this.schedule()
            return
        }
        if (!this.gl && !this.lost) this.createContext()
        if (!this.gl) return
        const key = w + "x" + h
        if (key !== this.sizeKey) {
            this.sizeKey = key
            const bw = Math.max(1, Math.round(w * this.dpr))
            const bh = Math.max(1, Math.round(h * this.dpr))
            if (this.canvas.width !== bw) this.canvas.width = bw
            if (this.canvas.height !== bh) this.canvas.height = bh
            this.geoKey = ""
            this.uniformsDirty = true
            this.dirty = true
        }
        this.schedule()
    }

    createContext() {
        const gl = this.canvas.getContext("webgl2", {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: "default",
        }) as WebGL2RenderingContext | null
        if (!gl || gl.isContextLost()) return
        OWNER.set(this.canvas, this)
        this.gl = gl
        this.dpr = Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, 2)
        this.canvas.addEventListener("webglcontextlost", this.onLost)
        this.canvas.addEventListener("webglcontextrestored", this.onRestored)
        this.initGL()
    }

    initGL() {
        const gl = this.gl
        if (!gl) return
        this.parallel = gl.getExtension("KHR_parallel_shader_compile")
        const mk = (type: number, src: string) => {
            const s = gl.createShader(type)!
            gl.shaderSource(s, src)
            gl.compileShader(s)
            return s
        }
        this.vs = mk(gl.VERTEX_SHADER, VS)
        this.fs = mk(gl.FRAGMENT_SHADER, FS)
        const p = gl.createProgram()!
        gl.attachShader(p, this.vs)
        gl.attachShader(p, this.fs)
        gl.bindAttribLocation(p, 0, "aPos")
        gl.bindAttribLocation(p, 1, "aData")
        gl.linkProgram(p)
        this.prog = p
        this.compiling = true
        this.vao = gl.createVertexArray()
        this.buf = gl.createBuffer()
        gl.bindVertexArray(this.vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, FLOATS * 4, 0)
        gl.enableVertexAttribArray(1)
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, FLOATS * 4, 8)
        gl.bindVertexArray(null)
        this.texLayers = 0
        this.tex = null
        this.geoKey = ""
        this.sizeKey = ""
        this.uniformsDirty = true
        this.dirty = true
        if ((window as Window & { __RIBBON_GPU_TIMER?: unknown }).__RIBBON_GPU_TIMER) this.gpuTimer = gl.getExtension("EXT_disjoint_timer_query_webgl2")
        // every layer that already has a bitmap is uploaded again (context creation or restore)
        this.uploadQueue = []
        for (let i = 0; i < this.urls.length; i++) {
            if (this.layerState[i] === 1) {
                this.layerState[i] = 0
                // the fresh texture is zero until this layer is uploaded again: hide its cards (alpha 0) and give
                // the old stamp back on upload, so they neither draw black nor fade in again
                if (this.layerReady[i]! < 1e8) {
                    this.restoreStamp[i] = this.layerReady[i]!
                    this.layerReady[i] = 1e9
                    this.drainUploads = true
                }
            }
            if (this.layerState[i] === 0) this.uploadQueue.push(i)
        }
        if (this.w > 0 && this.h > 0) {
            this.sizeKey = ""
            this.setSize(this.w, this.h)
        }
    }

    finishProgram(): boolean {
        const gl = this.gl!
        const p = this.prog!
        if (this.parallel && !gl.getProgramParameter(p, this.parallel.COMPLETION_STATUS_KHR)) return false
        this.compiling = false
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.warn("[Ribbon Gallery]", gl.getShaderInfoLog(this.fs!) || gl.getProgramInfoLog(p))
            this.broken = true
            return false
        }
        const names = ["uBox", "uTex", "uFlow", "uAppearT", "uEnds", "uCard", "uOpt", "uAp", "uMisc", "uMisc2", "uReady"]
        for (const n of names) this.u[n] = gl.getUniformLocation(p, n)
        gl.useProgram(p)
        gl.uniform1i(this.u.uTex!, 0)
        gl.disable(gl.BLEND)
        gl.disable(gl.DEPTH_TEST)
        gl.clearColor(0, 0, 0, 0)
        this.uniformsDirty = true
        this.dirty = true
        return true
    }

    onLost(e: Event) {
        e.preventDefault()
        this.lost = true
        this.gl = null
        this.prog = this.vs = this.fs = this.vao = this.buf = this.tex = null
        this.gpuQuery = null
        this.compiling = false
        this.texLayers = 0
        // time spent lost is not flow time: the next frame after restore starts a fresh interval
        this.last = 0
        rest(this)
    }

    onRestored() {
        if (this.destroyed) return
        this.lost = false
        const gl = this.canvas.getContext("webgl2") as WebGL2RenderingContext | null
        if (!gl) return
        this.gl = gl
        this.initGL()
    }

    destroy() {
        this.destroyed = true
        rest(this)
        const gl = this.gl
        if (gl) {
            if (this.tex) gl.deleteTexture(this.tex)
            if (this.buf) gl.deleteBuffer(this.buf)
            if (this.vao) gl.deleteVertexArray(this.vao)
            if (this.prog) gl.deleteProgram(this.prog)
            if (this.vs) gl.deleteShader(this.vs)
            if (this.fs) gl.deleteShader(this.fs)
            const lose = gl.getExtension("WEBGL_lose_context")
            const canvas = this.canvas
            OWNER.delete(canvas)
            // A remount on the same canvas reuses the live context; otherwise release it.
            if (lose) setTimeout(() => { if (!OWNER.has(canvas)) lose.loseContext() }, 0)
        }
        this.canvas.removeEventListener("webglcontextlost", this.onLost)
        this.canvas.removeEventListener("webglcontextrestored", this.onRestored)
        this.gl = null
        for (const u of this.urls) releaseImage(u)
        this.urls = []
    }

    // ---- props ----
    setOpts(o: RibbonOpts) {
        const prev = this.o
        this.o = o
        if (o.urls.join("\n") !== this.urls.join("\n")) this.setImages(o.urls)
        if (o.mode !== prev.mode || o.fixedT !== prev.fixedT) {
            this.layerReady.fill(1e9)
            this.restoreStamp.fill(NaN)
            for (let i = 0; i < this.urls.length; i++) if (this.layerState[i] === 1) this.layerReady[i] = this.readyStamp()
        }
        if (o.previewKey !== prev.previewKey && o.mode === "canvas") {
            this.appearStart = this.flowT
            this.computeLead()
        }
        if (o.editKey !== prev.editKey && o.mode === "canvas") this.editUntil = performance.now() + 15000
        if (o.trigger !== prev.trigger || o.flowSign !== prev.flowSign) this.computeLead()
        this.uniformsDirty = true
        this.dirty = true
        this.schedule()
    }

    setImages(list: string[]) {
        const next = list.slice(0, MAX_IMAGES)
        const old = this.urls
        const sameCount = next.length === old.length
        const states: number[] = []
        for (let i = 0; i < next.length; i++) {
            if (sameCount && old[i] === next[i]) {
                states.push(this.layerState[i] ?? 0)
                continue
            }
            states.push(0)
            this.layerReady[i] = 1e9
            this.restoreStamp[i] = NaN
        }
        for (const u of next) acquireImage(u)
        for (const u of old) releaseImage(u)
        this.urls = next
        this.layerState = states
        if (!sameCount) {
            this.layerReady.fill(1e9)
            this.restoreStamp.fill(NaN)
            for (let i = 0; i < next.length; i++) this.layerState[i] = 0
            if (this.gl && this.tex) {
                this.gl.deleteTexture(this.tex)
                this.tex = null
                this.texLayers = 0
            }
        }
        this.uploadQueue = []
        this.loaded = false
        next.forEach((url, i) => {
            if (this.layerState[i] !== 0) return
            const e = CACHE.get(url)!
            e.promise.then(() => {
                if (this.destroyed || this.urls[i] !== url) return
                if (e.failed || !e.bitmap) {
                    this.layerState[i] = 2
                } else if (!this.uploadQueue.includes(i)) this.uploadQueue.push(i)
                this.schedule()
            })
        })
        this.uniformsDirty = true
        this.dirty = true
    }

    readyStamp() {
        const m = this.o.mode
        if (m !== "live") return -1e3
        if (!this.triggered) return -1e3
        return this.flowT - this.appearStart
    }

    // ---- visibility and scheduling ----
    setInView(v: boolean, startReached: boolean) {
        this.inView = v
        if (!v && this.triggered && this.o.replay) this.rearm = true
        if (v && startReached && this.o.mode === "live" && this.o.trigger === "layerInView" && (!this.triggered || this.rearm)) this.trigger()
        this.schedule()
    }
    setDocVisible(v: boolean) {
        this.docVisible = v
        this.schedule()
    }
    setReduced(v: boolean) {
        this.reduced = v
        this.dirty = true
        this.schedule()
    }
    trigger() {
        this.triggered = true
        this.rearm = false
        this.appearStart = this.flowT
        for (let i = 0; i < this.urls.length; i++) if (this.layerState[i] === 1) this.layerReady[i] = -1e3
        this.computeLead()
        this.uniformsDirty = true
        this.dirty = true
    }
    mount() {
        if (this.o.mode === "live" && this.o.trigger !== "layerInView") this.trigger()
        this.schedule()
    }

    /** Leading visible card at the trigger moment (appear rank 0) and the number of visible cards. */
    computeLead() {
        const g = this.geo
        const P = CARD_LEN + this.o.gap
        const off = this.o.flowSign * this.o.speed * (this.o.mode === "fixed" ? 0 : this.appearStart)
        const half = CARD_LEN / 2
        let first = Infinity
        let lastK = -Infinity
        const k0 = Math.floor((g.sTop - off - g.sigma0 - half) / P) - 1
        for (let k = k0; k < k0 + 40; k++) {
            const c = g.sigma0 + k * P - off
            if (c + half > g.sTop && c - half < g.sBot) {
                if (k < first) first = k
                if (k > lastK) lastK = k
            }
            if (c - half > g.sBot) break
        }
        if (!isFinite(first)) {
            first = 0
            lastK = 0
        }
        this.rankDir = this.o.flowSign
        this.kLead = this.o.flowSign > 0 ? first : lastK
        this.rankCap = Math.max(1, lastK - first + 1)
        this.uniformsDirty = true
    }

    animating() {
        const m = this.o.mode
        if (this.reduced && m === "live") return false
        if (m === "live") return this.triggered || this.o.trigger === "layerInView"
        if (m === "canvas") return performance.now() < this.editUntil
        return false
    }

    running() {
        return this.animating() && this.inView && this.docVisible && this.w > 0 && this.h > 0 && !!this.gl && !this.lost
    }

    schedule() {
        if (this.destroyed) return
        const pending = this.compiling || this.uploadQueue.length > 0 || this.dirty
        if (this.gl && !this.lost && this.w > 0 && this.h > 0 && (this.running() || pending)) wake(this)
        else {
            rest(this)
            this.last = 0
        }
    }

    // ---- per frame ----
    frame(now: number, inView: boolean) {
        const t0 = performance.now()
        const gl = this.gl
        if (!gl || this.lost || this.destroyed) {
            rest(this)
            return
        }
        if (this.compiling && !this.finishProgram()) {
            if (this.broken) rest(this)
            return
        }
        if (this.broken) {
            rest(this)
            return
        }
        const run = this.running()
        if (run) {
            if (this.last) this.flowT += Math.min(now - this.last, 1000) / 1000
            this.last = now
            this.dirty = true
        } else this.last = 0
        if (this.uploadQueue.length) {
            // after a restore every cached layer goes up in one frame (8 x <= 0.6 ms, once) so no card is missing
            if (this.drainUploads) while (this.uploadQueue.length) this.uploadOne()
            else this.uploadOne()
            if (!this.uploadQueue.length) this.drainUploads = false
        }
        if (this.dirty && this.w > 0 && this.h > 0 && (inView || !run)) this.draw()
        this.cpuMs[this.cpuIdx] = performance.now() - t0
        this.cpuIdx = (this.cpuIdx + 1) % this.cpuMs.length
        if (!run && !this.compiling && this.uploadQueue.length === 0 && !this.dirty) {
            rest(this)
            this.last = 0
        }
    }

    ensureTexture() {
        const gl = this.gl!
        const n = Math.max(1, this.urls.length)
        if (this.tex && this.texLayers === n) return
        if (this.tex) gl.deleteTexture(this.tex)
        this.tex = gl.createTexture()
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex)
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, LAYER_LEVELS, gl.RGBA8, LAYER_W, LAYER_H, n)
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        // streaked smear along the path where available; without it the same gradients filter isotropically
        const aniso = gl.getExtension("EXT_texture_filter_anisotropic")
        if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)))
        this.texLayers = n
    }

    uploadOne() {
        const gl = this.gl!
        const i = this.uploadQueue.shift()!
        const e = CACHE.get(this.urls[i]!)
        if (!e || !e.bitmap) return
        const t0 = performance.now()
        this.ensureTexture()
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex)
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, LAYER_W, LAYER_H, 1, gl.RGBA, gl.UNSIGNED_BYTE, e.bitmap)
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY)
        const ms = performance.now() - t0
        if (this.uploadMs.length < 64) this.uploadMs.push(Math.round(ms * 100) / 100)
        if (ms > this.maxUploadMs) this.maxUploadMs = ms
        this.layerState[i] = 1
        // a layer that was already shown (context restore) gets its stamp back, so its cards do not fade in again
        if (!Number.isNaN(this.restoreStamp[i]!)) {
            this.layerReady[i] = this.restoreStamp[i]!
            this.restoreStamp[i] = NaN
        } else if (this.layerReady[i]! >= 1e8) this.layerReady[i] = this.readyStamp()
        this.uniformsDirty = true
        this.dirty = true
    }

    buildGeometry() {
        const gl = this.gl!
        const o = this.o
        const w = this.w
        const h = this.h
        const key = [w, h, o.side, o.curve, o.twist, o.width, o.phase, o.zone, o.bloom, o.fringe].join("|")
        if (key === this.geoKey) return
        this.geoKey = key
        // dense centreline samples
        const M = 1400
        const ys = new Float64Array(M + 1)
        const xs = new Float64Array(M + 1)
        const ss = new Float64Array(M + 1)
        const y0 = -PATH_EXT * h
        const y1 = (1 + PATH_EXT) * h
        // Curve amplitude vs hero aspect (two-point fit to Ref A and Ref B, clamped): the hero aspect is
        // read from the canonical box (16 % of the hero width), so it is 1 at Ref B.
        const heroAspect = w / 0.16 / h
        const amp = o.curve * Math.min(1.15, Math.max(0.85, Math.pow(1.681 / heroAspect, 1.4)))
        const xAt = (y: number) => X_MID * w + amp * devAt(y / h - o.phase) * h
        for (let i = 0; i <= M; i++) {
            const y = y0 + ((y1 - y0) * i) / M
            ys[i] = y
            xs[i] = xAt(y)
            ss[i] = i === 0 ? 0 : ss[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!)
        }
        const sAtY = (y: number) => {
            const f = ((y - y0) / (y1 - y0)) * M
            const i = Math.max(0, Math.min(M - 1, Math.floor(f)))
            return ss[i]! + (ss[i + 1]! - ss[i]!) * (f - i)
        }
        const yAtS = (s: number) => {
            let lo = 0
            let hi = M
            while (hi - lo > 1) {
                const mid = (lo + hi) >> 1
                if (ss[mid]! < s) lo = mid
                else hi = mid
            }
            const t = (s - ss[lo]!) / Math.max(1e-9, ss[hi]! - ss[lo]!)
            return ys[lo]! + (ys[hi]! - ys[lo]!) * t
        }
        const sTop = sAtY(0)
        const sBot = sAtY(h)
        // End zone scales the fitted lens (fold at 0.1428 h of arc, onset 0.2103 h at the default 18.5 %)
        const lam = o.zone / 0.185
        const zonePx = LENS_Z * lam * h
        this.geo = { sTop: sTop / h, sBot: sBot / h, zone: lam, fold: 0, sigma0: sAtY(0.035 * h) / h + PHASE_REF }
        const halfMid = (o.width / 100) * w * 0.5
        const L = ss[M]!
        const data = new Float32Array(ROWS * 2 * FLOATS)
        const eps = 0.5
        // per row: centre, tangent angle (from vertical), half-width and the outer extent (silhouette + pad)
        const cx = new Float64Array(ROWS)
        const cy = new Float64Array(ROWS)
        const th = new Float64Array(ROWS)
        const hw = new Float64Array(ROWS)
        const ex = new Float64Array(ROWS)
        for (let r = 0; r < ROWS; r++) {
            const s = (L * r) / (ROWS - 1)
            const y = yAtS(s)
            cx[r] = xAt(y)
            cy[r] = y
            th[r] = Math.atan2(xAt(y + eps) - xAt(y - eps), 2 * eps)
            const yn = y / h
            const tw = o.twist > 0 ? Math.max(0.12, Math.abs(Math.cos(Math.PI * o.twist * (yn - 0.5)))) : 1
            hw[r] = halfMid * widthAt(yn) * tw
            const dEdge = Math.max(0, Math.min(s - sTop, sBot - s))
            const zf = clamp01(1 - dEdge / Math.max(1, zonePx))
            const halo = o.bloom * 8 * Math.pow(zf, 1.8) * (h / 1123) + 0.6
            // must cover the shader's across split (0.48 px + 1.0 x 16 zf^1.5) and the widest channel's across
            // feather (blue: 1 + 0.3 x (3 - 1) = 1.6 x the shared one)
            const fr = o.fringe * (0.48 + 16 * Math.pow(zf, 1.5)) * (h / 978)
            const blurQ = o.smear * (h / 978) * 7 * Math.pow(zf, 1.2) * 1.6
            ex[r] = hw[r]! + (halo + blurQ) * 1.1 + fr * 0.5 + 2
        }
        // Rows perpendicular to the path cross on the concave side of a turn once the extent exceeds the radius
        // of curvature (wide Width / high Curve). Instead of clamping the extent (which cut the silhouette into
        // a sawtooth), smooth the rows' direction field just enough that no row quad folds over: sigma 0 (exact
        // perpendicular rows) whenever that is already clean, as at the defaults.
        const ang = new Float64Array(ROWS)
        const folds = (a: Float64Array) => {
            for (let r = 0; r + 1 < ROWS; r++) {
                const dx = cx[r + 1]! - cx[r]!
                const dy = cy[r + 1]! - cy[r]!
                const d2 = dx * dx + dy * dy
                for (let side = -1; side <= 1; side += 2) {
                    const q0 = side * ex[r]!
                    const q1 = side * ex[r + 1]!
                    const ox = cx[r + 1]! + Math.cos(a[r + 1]!) * q1 - cx[r]! - Math.cos(a[r]!) * q0
                    const oy = cy[r + 1]! - Math.sin(a[r + 1]!) * q1 - cy[r]! + Math.sin(a[r]!) * q0
                    if (ox * dx + oy * dy < 0.2 * d2) return true
                }
            }
            return false
        }
        const SIGMAS = [0, 1, 1.5, 2, 3, 4, 6, 8, 11, 16, 22, 32, 45]
        for (const sg of SIGMAS) {
            if (sg === 0) ang.set(th)
            else {
                const R = Math.ceil(3 * sg)
                for (let r = 0; r < ROWS; r++) {
                    let acc = 0
                    let wt = 0
                    for (let k = -R; k <= R; k++) {
                        const j = Math.min(ROWS - 1, Math.max(0, r + k))
                        const w8 = Math.exp((-0.5 * k * k) / (sg * sg))
                        acc += w8 * th[j]!
                        wt += w8
                    }
                    ang[r] = acc / wt
                }
            }
            this.rowSigma = sg
            if (!folds(ang)) break
        }
        for (let r = 0; r < ROWS; r++) {
            const s = (L * r) / (ROWS - 1)
            // row direction: the normal of the (smoothed) tangent, t = (sin a, cos a), n = (cos a, -sin a)
            const nx = Math.cos(ang[r]!)
            const ny = -Math.sin(ang[r]!)
            const sH = s / h
            for (let side = 0; side < 2; side++) {
                const q = side === 0 ? -ex[r]! : ex[r]!
                let px = cx[r]! + nx * q
                let py = cy[r]! + ny * q
                if (o.side < 0) {
                    px = w - px
                    py = h - py
                }
                const j = (r * 2 + side) * FLOATS
                data[j] = px
                data[j + 1] = py
                data[j + 2] = sH
                data[j + 3] = q
                data[j + 4] = hw[r]!
            }
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
        this.verts = ROWS * 2
        this.computeLead()
        this.uniformsDirty = true
    }

    applyUniforms() {
        const gl = this.gl!
        const o = this.o
        const u = this.u
        const g = this.geo
        const P = CARD_LEN + o.gap
        gl.uniform2f(u.uBox!, this.w, this.h)
        gl.uniform4f(u.uEnds!, g.sTop, g.sBot, g.zone, g.fold)
        gl.uniform4f(u.uCard!, g.sigma0, P, CARD_LEN / 2, Math.max(0, o.radius))
        gl.uniform4f(u.uOpt!, o.dispersion, o.bloom, o.fringe, o.smear)
        this.leadSent = NaN
        gl.uniform4f(u.uMisc!, this.h, this.dpr, Math.max(1, this.urls.length), this.rankDir)
        const dev = this.dpr
        const ra = LAYER_W / Math.max(1, CARD_LEN * this.h * dev)
        const halfW = (o.width / 100) * this.w * 0.5
        const rc = LAYER_H / Math.max(1, 2 * halfW * dev)
        gl.uniform2f(u.uMisc2!, this.rankCap, Math.max(0, Math.log2(Math.max(ra, rc)) - 0.5))
        gl.uniform1fv(u.uReady!, this.layerReady)
        this.uniformsDirty = false
    }

    draw() {
        const gl = this.gl!
        if (!this.prog || this.compiling || this.broken) return
        this.buildGeometry()
        if (!this.tex) this.ensureTexture()
        if (this.uniformsDirty) this.applyUniforms()
        const o = this.o
        let flowT = this.flowT
        let appearT = this.flowT - this.appearStart
        if (o.mode === "fixed") {
            flowT = o.fixedT
            appearT = o.fixedT
        } else if (o.mode === "static") appearT = 1e4
        else if (o.mode === "canvas") appearT = o.previewKey > 0 ? appearT : 1e4
        else if (this.reduced || o.trigger === "none") appearT = 1e4
        else if (!this.triggered) appearT = -1
        // wrap the flow offset by whole image cycles to keep float precision on long runs
        const P = CARD_LEN + o.gap
        const n = Math.max(1, this.urls.length)
        let off = o.flowSign * o.speed * flowT
        const cycle = n * P * Math.max(1, Math.ceil(8 / n))
        const wraps = Math.floor(off / cycle)
        off -= wraps * cycle
        const lead = this.kLead - wraps * Math.round(cycle / P)
        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        gl.uniform1f(this.u.uFlow!, off)
        gl.uniform1f(this.u.uAppearT!, appearT)
        if (lead !== this.leadSent) {
            this.leadSent = lead
            gl.uniform4f(this.u.uAp!, o.delay, o.stagger, Math.max(0.05, o.duration), lead)
        }
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.bindVertexArray(this.vao)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex)
        const timer = this.gpuTimer
        if (timer && !this.gpuQuery) {
            const query = gl.createQuery()
            if (query) {
                this.gpuQuery = query
                gl.beginQuery(timer.TIME_ELAPSED_EXT, query)
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.verts)
                gl.endQuery(timer.TIME_ELAPSED_EXT)
            } else gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.verts)
        } else gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.verts)
        if (timer && this.gpuQuery && gl.getQueryParameter(this.gpuQuery, gl.QUERY_RESULT_AVAILABLE)) {
            if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
                this.gpuMs[this.gpuIdx] = gl.getQueryParameter(this.gpuQuery, gl.QUERY_RESULT) / 1e6
                this.gpuIdx = (this.gpuIdx + 1) % this.gpuMs.length
            }
            gl.deleteQuery(this.gpuQuery)
            this.gpuQuery = null
        }
        gl.bindVertexArray(null)
        this.frames++
        this.drawCalls++
        this.dirty = false
        if (!this.loaded && this.uploadQueue.length === 0 && this.layerState.every((s) => s !== 0)) this.loaded = true
    }

    installHandle() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the handle's getters re-bind this to the handle, not the instance
        const self = this
        const handle = {
            get loaded() { return self.loaded },
            get cpuMs() { return self.cpuMs },
            get gpuMs() { return self.gpuTimer ? self.gpuMs : null },
            get frames() { return self.frames },
            get drawCalls() { return self.drawCalls },
            get dpr() { return self.dpr },
            get size() { return [self.canvas.width, self.canvas.height, self.w, self.h] },
            get rowSigma() { return self.rowSigma },
            get layersReady() { return self.layerState.filter((s) => s === 1).length },
            get layersFailed() { return self.layerState.filter((s) => s === 2).length },
            get maxUploadMs() { return Math.round(self.maxUploadMs * 100) / 100 },
            get uploadMs() { return self.uploadMs.slice() },
            get running() { return self.running() },
            get ticking() { return LIVE.has(self) },
            get triggered() { return self.triggered },
            get hasContext() { return !!self.gl },
            get geo() { return { ...self.geo, period: CARD_LEN + self.o.gap, cardLen: CARD_LEN, speed: self.o.speed, flowSign: self.o.flowSign, kLead: self.kLead, rankCap: self.rankCap } },
            clock: () => self.flowT,
            appearClock: () => self.flowT - self.appearStart,
            pin: (t: number) => {
                self.o = { ...self.o, mode: "fixed", fixedT: t }
                self.layerReady.fill(-1e3)
                self.dirty = true
                self.schedule()
            },
        }
        try {
            Object.defineProperty(this.canvas, "__ribbon", { value: handle, enumerable: false, configurable: true })
        } catch {
            /* debug handle only */
        }
    }
}

// ---------------------------------------------------------------------------
// Vanilla-Huelle: flache Widget-Props -> RibbonOpts, Mount, Lebenszyklus.
// ---------------------------------------------------------------------------

// Flache Widget-Props -> RibbonOpts (die Defaults der Quell-Komponente).
export function ribbonOptsFromProps(props: WidgetProps): RibbonOpts {
  const num = (k: string, d: number): number => (typeof props[k] === "number" ? (props[k] as number) : d);
  const str = (k: string, d: string): string => (typeof props[k] === "string" ? (props[k] as string) : d);
  const side = str("side", "left") === "right" ? -1 : 1;
  const direction = str("direction", "auto");
  const screenUp = direction === "auto" ? side === 1 : direction === "up";
  const flowSign: 1 | -1 = (screenUp ? 1 : -1) * side > 0 ? 1 : -1;
  const images = Array.isArray(props["images"]) ? (props["images"] as unknown[]) : [];
  const urls = images
    .map((entry) => {
      // Bake und Editor reichen blanke URLs durch; die Registry liefert { image }.
      if (typeof entry === "string") return entry;
      if (!entry || typeof entry !== "object") return "";
      const media = (entry as Record<string, unknown>)["image"];
      if (typeof media === "string") return media;
      if (media && typeof media === "object") {
        const record = media as Record<string, unknown>;
        if (typeof record["src"] === "string") return record["src"];
        if (typeof record["url"] === "string") return record["url"];
        // Eine unresolved assetId wird verworfen: die Registry loest Media-Refs
        // vor dem data-props-Attribut zu URLs auf.
      }
      return "";
    })
    .filter((u) => u !== "");
  const radius = props["radius"];
  const parsedRadius = typeof radius === "object" && radius !== null
    ? Number.parseFloat(String((radius as Record<string, unknown>)["top"] ?? "5"))
    : Number.NaN;
  const radiusPx = typeof radius === "object" && radius !== null ? (Number.isFinite(parsedRadius) ? parsedRadius : 5) : typeof radius === "number" ? radius : 5;
  return {
    mode: "live",
    fixedT: 0,
    urls,
    side: side as 1 | -1,
    flowSign,
    speed: Math.max(0, num("speed", 8.28)) / 100,
    curve: num("curve", 1),
    twist: Math.max(0, num("twist", 0)),
    width: Math.max(0.5, num("ribbonWidth", 32.7)),
    gap: Math.max(0, num("gap", 6.8)) / 100,
    radius: radiusPx,
    phase: num("phase", 0) / 100,
    dispersion: Math.max(0, num("dispersion", 1)),
    smear: Math.max(0, num("smear", 1)),
    fringe: Math.max(0, num("fringe", 1)),
    bloom: Math.max(0, num("bloom", 1)),
    zone: Math.min(0.45, Math.max(0.02, num("endZone", 18.5) / 100)),
    trigger: str("trigger", "layerInView") as Trigger,
    start: str("start", "top") as "top" | "center" | "bottom",
    replay: props["replay"] === true,
    delay: Math.max(0, num("delay", 0.8)),
    stagger: Math.max(0, num("stagger", 0.075)),
    duration: Math.max(0.05, num("duration", 0.85)),
    previewKey: 0,
    editKey: "",
  };
}

export const mount: WidgetMount = (host, props) => {
  // Canvas aus dem Markup (Task 4) nutzen; nie einen zweiten Host erzeugen.
  let canvas = host.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.appendChild(canvas);
  }
  let startMode: RibbonOpts["start"] = "top";
  const initial = ribbonOptsFromProps(props);
  startMode = initial.start;
  if (initial.urls.length > 0) host.setAttribute("data-widget-ready", "1");
  const ribbon = new Ribbon(host as HTMLDivElement, canvas, initial);
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  ribbon.setReduced(reduced);
  const syncSize = (): void => {
    ribbon.setSize(host.offsetWidth, host.offsetHeight);
    if (
      host.offsetWidth > 0 &&
      host.offsetHeight > 0 &&
      ribbon.gl === null &&
      !ribbon.lost
    ) {
      host.setAttribute("data-widget-state", "failed");
      host.removeAttribute("data-widget-ready");
    }
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(syncSize) : null;
  ro?.observe(host);
  const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const onMq = (): void => ribbon.setReduced(!!mq && mq.matches);
  mq?.addEventListener?.("change", onMq);
  const onVis = (): void => ribbon.setDocVisible(document.visibilityState !== "hidden");
  document.addEventListener("visibilitychange", onVis);
  // Der Bake-Island mountet erst, wenn der Host in die Naehe des Viewports
  // kommt; dieser Observer entscheidet, wann die Startlinie (top/center/bottom)
  // erreicht ist — dieselbe Logik wie die Quell-Huelle.
  const io = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (entry === undefined) return;
        const rb = entry.rootBounds;
        const bb = entry.boundingClientRect;
        const point = startMode === "center" ? bb.top + bb.height / 2 : startMode === "bottom" ? bb.bottom : bb.top;
        const reached = !rb || point <= rb.bottom + 0.5;
        ribbon.setInView(entry.isIntersecting, entry.isIntersecting && reached);
      }, { threshold: [0, 0.5, 1] })
    : null;
  io?.observe(host);
  if (io === null) ribbon.setInView(true, true);
  syncSize();
  ribbon.mount();
  let destroyed = false;
  return {
    setProps(next: WidgetProps): void {
      if (destroyed) return;
      const options = ribbonOptsFromProps(next);
      startMode = options.start;
      if (options.urls.length > 0) host.setAttribute("data-widget-ready", "1");
      else host.removeAttribute("data-widget-ready");
      ribbon.setOpts(options);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      ro?.disconnect();
      io?.disconnect();
      mq?.removeEventListener?.("change", onMq);
      document.removeEventListener("visibilitychange", onVis);
      ribbon.destroy();
    },
  };
};
