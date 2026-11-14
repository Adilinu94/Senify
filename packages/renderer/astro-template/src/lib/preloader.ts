// Der native Seiten-Loader (Origin: `Preloader (Show Once content)`).
//
// Diese Datei liegt bewusst im Astro-Template-Ordner: der Bake kopiert den
// Ordner in eine Staging-Umgebung, ein relativer Import in `../src` würde dort
// ins Leere zeigen. Bake-Template und Editor-Live teilen Markup, CSS und
// Script; die Renderer-Fassade `@senify/renderer/motion` re-exportiert sie.
export type PageLoader = {
  label: string;
  durationMs: number;
  showOnce: boolean;
  counter: boolean;
  background: string;
  color: string;
};

export const PRELOADER_CSS = [
  ".senify-preloader{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:var(--bg-base,#ffffff);transition:opacity .45s ease;pointer-events:none;}",
  ".senify-preloader__inner{display:flex;flex-direction:column;align-items:center;gap:18px;}",
  ".senify-preloader__label{font-size:14px;letter-spacing:.08em;text-transform:uppercase;}",
  ".senify-preloader__counter{font-variant-numeric:tabular-nums;font-size:14px;opacity:.7;}",
  "@media (prefers-reduced-motion: reduce){.senify-preloader{display:none !important;}}",
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
  const label = escapeHtml(loader.label);
  const counter = loader.counter
    ? '<div class="senify-preloader__counter" data-preloader-counter>0%</div>'
    : "";
  return `<div class="senify-preloader" data-preloader style="background:${escapeHtml(loader.background)};color:${escapeHtml(loader.color)}"><div class="senify-preloader__inner"><div class="senify-preloader__label">${label}</div>${counter}</div></div>`;
}

export function preloaderScript(loader: PageLoader, key: string): string {
  const config = JSON.stringify({
    durationMs: loader.durationMs,
    showOnce: loader.showOnce,
    counter: loader.counter,
  });
  return `(function(){var cfg=${config};var key=${JSON.stringify(key)};var preloader=document.querySelector("[data-preloader]");if(!preloader)return;var reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;var remove=function(){if(preloader.parentNode)preloader.parentNode.removeChild(preloader);};if(cfg.showOnce){try{if(localStorage.getItem(key)){remove();return;}}catch(e){}}if(reduce){try{localStorage.setItem(key,"1");}catch(e){}remove();return;}var counter=preloader.querySelector("[data-preloader-counter]");var started=performance.now();var finish=function(){try{localStorage.setItem(key,"1");}catch(e){}preloader.style.opacity="0";setTimeout(remove,450);};var tick=function(now){var progress=Math.min(1,(now-started)/cfg.durationMs);if(counter)counter.textContent=Math.round(progress*100)+"%";if(progress<1)requestAnimationFrame(tick);else finish();};requestAnimationFrame(tick);setTimeout(function(){if(preloader.parentNode)finish();},cfg.durationMs+1500);})();`;
}
