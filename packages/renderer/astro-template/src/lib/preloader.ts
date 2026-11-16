// Der native Seiten-Loader (Origin: `Preloader (Show Once content)`).
//
// Diese Datei liegt bewusst im Astro-Template-Ordner: der Bake kopiert den
// Ordner in eine Staging-Umgebung, ein relativer Import in `../src` würde dort
// ins Leere zeigen. Bake-Template und Editor-Live teilen Markup, CSS und
// Script; die Renderer-Fassade `@senify/renderer/motion` re-exportiert sie.
//
// Aufbau nach der Origin-Quelle (`Navigation/Preloader.tsx`, 14.11.2026):
// zwei Flächen (oben/unten), die beim Öffnen wie ein Verschluss auseinander
// fahren, dazwischen Wortmarke, Linie, Ort und Prozentzähler. Der Fortschritt
// steigt mindestens bis `durationMs` und springt dann auf 100 %.
export type PageLoader = {
  // Die Wortmarke (`Origin®`).
  label: string;
  // Der Ort unter der Wortmarke (`Brand Studio, Dubai`).
  place: string;
  durationMs: number;
  // Wie lange nach dem ersten Anzeigen der Loader nicht wieder erscheint.
  showOnceMs: number;
  showOnce: boolean;
  counter: boolean;
  background: string;
  color: string;
  // Zusätzliche Farben der Origin-Vorlage.
  muted: string;
  count: string;
};

const SHUTTER_MS = 950;

export const PRELOADER_CSS = [
  ".senify-preloader{position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;isolation:isolate;}",
  ".senify-preloader[data-phase=done]{display:none;}",
  ".senify-preloader__panel{position:absolute;left:0;right:0;height:calc(50% + 1px);background:var(--senify-loader-bg,#141414);will-change:transform;}",
  ".senify-preloader__panel--top{top:0;}",
  ".senify-preloader__panel--bottom{bottom:0;}",
  ".senify-preloader[data-phase=out] .senify-preloader__panel--top{transform:translateY(-100%);transition:transform " +
    `${SHUTTER_MS}ms cubic-bezier(.76,0,.24,1) 250ms;}`,
  ".senify-preloader[data-phase=out] .senify-preloader__panel--bottom{transform:translateY(100%);transition:transform " +
    `${SHUTTER_MS}ms cubic-bezier(.76,0,.24,1) 250ms;}`,
  ".senify-preloader__content{position:absolute;left:40px;right:40px;top:50%;}",
  // Die Origin-Vorlage skaliert die Wortmarke mit der Flächenbreite
  // (80 px bei 1333, 40 px bei 667); hier ist es die Viewport-Breite.
  ".senify-preloader__brand{position:absolute;left:0;bottom:24px;white-space:nowrap;font-size:clamp(40px,6vw,80px);line-height:1;letter-spacing:-.04em;color:var(--senify-loader-fg,#f2f2f2);}",
  ".senify-preloader__line{height:1px;background:var(--senify-loader-track,rgba(255,255,255,.12));position:relative;overflow:hidden;}",
  ".senify-preloader__line::after{content:'';position:absolute;inset:0;transform-origin:left center;transform:scaleX(var(--senify-loader-progress,0));background:var(--senify-loader-tint,#8a8f5a);transition:transform .12s linear;}",
  ".senify-preloader__row{position:absolute;left:0;right:0;top:16px;display:flex;justify-content:space-between;gap:16px;font-size:13px;white-space:nowrap;}",
  ".senify-preloader__place{color:var(--senify-loader-muted,#8e8e8e);overflow:hidden;text-overflow:ellipsis;min-width:0;}",
  ".senify-preloader__count{color:var(--senify-loader-count,#b8b8b8);font-variant-numeric:tabular-nums;flex-shrink:0;}",
  "@media (max-width:1199px){.senify-preloader__content{left:24px;right:24px;}}",
  "@media (max-width:720px){.senify-preloader__content{left:16px;right:16px;}}",
  "@media (prefers-reduced-motion: reduce){.senify-preloader[data-phase=out] .senify-preloader__panel{transition:opacity 300ms ease;transform:none;}",
  ".senify-preloader__brand,.senify-preloader__row{opacity:1;transform:none;filter:none;}",
  ".senify-preloader__line::after{transition:none;}}",
  "html.senify-preloader-open,html.senify-preloader-open body{overflow:hidden!important;}",
].join("");

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function preloaderMarkup(loader: PageLoader): string {
  const place = escapeHtml(loader.place);
  const short = escapeHtml((loader.place.split(",").pop() ?? loader.place).trim());
  const counter = loader.counter
    ? '<div class="senify-preloader__count" data-preloader-counter aria-hidden="true">0%</div>'
    : "";
  return [
    `<div class="senify-preloader" data-preloader data-phase="wait" role="status" aria-label="Loading" `,
    `style="--senify-loader-bg:${escapeHtml(loader.background)};--senify-loader-fg:${escapeHtml(loader.color)};`,
    `--senify-loader-muted:${escapeHtml(loader.muted)};--senify-loader-count:${escapeHtml(loader.count)};">`,
    '<div class="senify-preloader__panel senify-preloader__panel--top"></div>',
    '<div class="senify-preloader__panel senify-preloader__panel--bottom"></div>',
    '<div class="senify-preloader__content">',
    `<span class="senify-preloader__brand">${escapeHtml(loader.label)}</span>`,
    '<div class="senify-preloader__line" data-preloader-line></div>',
    '<div class="senify-preloader__row">',
    `<span class="senify-preloader__place" title="${place}">${short}</span>`,
    counter,
    "</div></div></div>",
  ].join("");
}

// Das Zeitverhalten der Origin-Vorlage: ShowOnce-Fenster prüfen, Scroll sperren,
// Fortschritt bis `durationMs` steigern, dann Verschluss öffnen. Das Script
// läuft inline vor dem ersten Paint und ist bewusst ES5-nah: es darf nur
// `document`, `window` und `localStorage` benutzen.
export function preloaderScript(loader: PageLoader, key: string): string {
  const config = JSON.stringify({
    durationMs: loader.durationMs,
    showOnce: loader.showOnce,
    showOnceMs: loader.showOnceMs,
    counter: loader.counter,
  });
  const shutterMs = SHUTTER_MS;
  return `(function(){var cfg=${config};var key=${JSON.stringify(key)};var root=document.querySelector("[data-preloader]");if(!root)return;var doc=document.documentElement;
function remove(){if(root.parentNode)root.parentNode.removeChild(root);doc.classList.remove("senify-preloader-open");}
function skip(){root.setAttribute("data-phase","done");remove();}
var seen=false;
if(cfg.showOnce){try{var last=Number(window.localStorage.getItem(key));seen=Number.isFinite(last)&&Date.now()-last<cfg.showOnceMs&&last>0;}catch(e){seen=false;}}
var reduce=false;try{reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;}catch(e){}
if(reduce){try{window.localStorage.setItem(key,String(Date.now()));}catch(e){}skip();root=null;return;}
doc.classList.add("senify-preloader-open");
var panelTop=root.querySelector(".senify-preloader__panel--top");
var panelBottom=root.querySelector(".senify-preloader__panel--bottom");
var counter=root.querySelector("[data-preloader-counter]");
var line=root.querySelector("[data-preloader-line]");
var started=performance.now();
var opening=false;
function paint(p){if(!root)return;root.style.setProperty("--senify-loader-progress",String(p));if(line)line.style.setProperty("--senify-loader-progress",String(p));if(counter)counter.textContent=Math.round(p*100)+"%";}
function open(){if(opening||!root)return;opening=true;try{window.localStorage.setItem(key,String(Date.now()));}catch(e){}paint(1);root.setAttribute("data-phase","out");doc.classList.remove("senify-preloader-open");if(panelTop)panelTop.style.transform="";if(panelBottom)panelBottom.style.transform="";window.setTimeout(remove,${shutterMs}+300);}
function tick(now){if(!root)return;var p=Math.min(1,(now-started)/cfg.durationMs);paint(p);if(p>=1){open();return;}window.requestAnimationFrame(tick);}
if(seen){skip();return;}
paint(0);window.requestAnimationFrame(tick);
window.setTimeout(function(){if(!opening)open();},cfg.durationMs+8000);
window.addEventListener("pagehide",function(){try{window.localStorage.setItem(key,String(Date.now()));}catch(e){}});})();`;
}
