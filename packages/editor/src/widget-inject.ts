// Widget-Live-Mount im Editor (Spec 2026-11-12, Task 9): dieselbe Bruecke, die
// der Bake als Island-Script schreibt, nur gegen den Editor-Endpoint statt
// gegen eine gebackene Datei.
//
// Der Bake mountet jeden Host genau einmal (`renderIslandsScript`,
// IntersectionObserver). Im Editor rendert React bei einem In-Place-Refresh
// neu: die Hosts bleiben stehen, ihre Attribute aendern sich. Der Live-Modus
// des Canvas baut das iframe bei Store-Aenderungen dagegen neu auf (Release-
// Treue), dort mountet der Kern frisch. Diese Injection deckt beide Faelle ab:
// ein Handle je Host (`window.__senifyWidgetHandles`) bevorzugt `setProps` —
// ein Remount wuerde WebGL-Kontext und Animation verlieren —, ein neuer Host
// mountet, entfernte Hosts werden destroyed.

import type { DomDocument, DomElement } from "./dom.ts";

// Die Engine-Route liefert den gebuendelten Widget-Kern als ESM
// (`widgetVendorCode`); das lokale Programm proxyt `/api/` mit Operator-Token.
export const WIDGET_MODULE_BASE = "/api/widget-module";

// True, sobald das Frame-Dokument die Injection traegt.
export function widgetInjected(doc: DomDocument): boolean {
  return doc.querySelector("script[data-senify-widget]") !== null;
}

export type InjectWidgetOptions = {
  doc: DomDocument;
  body: DomElement;
  moduleBase?: string;
};

// The handles live on the frame window (the script's cache), not in this
// module: the frame document and its window belong to the iframe. The slice
// below is all the injector needs to release a handle whose host is gone.
type WidgetHandle = { destroy?(): void };
type WidgetWindow = {
  __senifyWidgetHandles?: Record<string, WidgetHandle>;
  __senifyWidgetPending?: Record<string, boolean>;
};

function widgetWindow(doc: DomDocument): WidgetWindow | undefined {
  return (doc as unknown as { defaultView?: WidgetWindow }).defaultView;
}

// Synchronous cleanup before the next script runs: a removed host must not
// leave a WebGL context and a rAF loop behind. The script repeats the cleanup
// for hosts that vanish between two injector calls; doing it here covers the
// last host, where no script is appended at all.
function cleanupWidgetHandles(doc: DomDocument, live: ReadonlySet<string>): void {
  const win = widgetWindow(doc);
  const handles = win?.__senifyWidgetHandles;
  if (!handles) return;
  for (const [id, handle] of Object.entries(handles)) {
    if (live.has(id)) continue;
    try {
      handle.destroy?.();
    } catch {
      /* a broken handle must not block the others */
    }
    delete handles[id];
    if (win?.__senifyWidgetPending) delete win.__senifyWidgetPending[id];
  }
}

// Haengt das Runtime-Script an den Body. Jeder Aufruf ersetzt das vorherige
// Script (Re-Render-Pfad): der Handle-Cache im Fenster entscheidet, ob ein Host
// `setProps` bekommt oder zum ersten Mal mountet. Ohne Hosts bleibt nichts
// stehen — das Script entfernt sich selbst.
export function injectWidgetRuntime(options: InjectWidgetOptions): void {
  const { doc, body } = options;
  const hosts = body.querySelectorAll('[data-island="widget"]');
  const previous = doc.querySelector("script[data-senify-widget]");
  const live = new Set<string>();
  for (const [index, host] of hosts.entries()) {
    const type = host.getAttribute("data-widget-type") ?? "";
    live.add(host.getAttribute("data-node-id") || `${type}:${index}`);
  }
  cleanupWidgetHandles(doc, live);
  if (hosts.length === 0) {
    previous?.remove();
    return;
  }
  previous?.remove();

  const base = options.moduleBase ?? WIDGET_MODULE_BASE;
  const script = doc.createElement("script");
  script.setAttribute("type", "module");
  script.setAttribute("data-senify-widget", "runtime");
  script.textContent = `
    var base = ${JSON.stringify(base)};
    var handles = window.__senifyWidgetHandles || (window.__senifyWidgetHandles = {});
    var pending = window.__senifyWidgetPending || (window.__senifyWidgetPending = {});
    var hosts = document.querySelectorAll('[data-island="widget"]');
    var live = {};
    for (var index = 0; index < hosts.length; index += 1) {
      var host = hosts[index];
      var type = host.getAttribute("data-widget-type") || "";
      // Der Markup-Root traegt data-node-id; ein Host ohne Id bekommt eine
      // stabile Kennung aus Typ und Position.
      var id = host.getAttribute("data-node-id") || (type + ":" + index);
      live[id] = true;
      var props = {};
      try { props = JSON.parse(host.getAttribute("data-props") || "{}"); } catch (e) { props = {}; }
      if (props === null || typeof props !== "object" || Array.isArray(props)) props = {};
      var handle = handles[id];
      if (handle) {
        // Re-Render: die Props aendern sich, der Kern bleibt stehen. Ein Kern
        // ohne setProps wird nicht neu gemountet (zwei Instanzen auf einem Host
        // waeren schlimmer als veraltete Props).
        if (typeof handle.setProps === "function") {
          try { handle.setProps(props); } catch (e) {}
        }
        if (host.getAttribute("data-widget-state") !== "failed") {
          host.setAttribute("data-widget-state", "mounted");
        }
        continue;
      }
      // Ein laufender Import wuerde beim naechsten Render doppelt mounten.
      if (pending[id]) continue;
      pending[id] = true;
      (function (target, key, payload, widgetType) {
        import(base + "?type=" + encodeURIComponent(widgetType)).then(function (module) {
          delete pending[key];
          // Der Host kann waehrend des Imports aus dem Baum gefallen sein.
          if (target.isConnected === false) return;
          var mount = module && (typeof module.mount === "function" ? module.mount : (module.default && typeof module.default.mount === "function" ? module.default.mount : null));
          if (typeof mount !== "function") { target.setAttribute("data-widget-state", "failed"); return; }
          try {
            handles[key] = mount(target, payload);
            if (target.getAttribute("data-widget-state") !== "failed") {
              target.setAttribute("data-widget-state", "mounted");
            }
          } catch (e) { target.setAttribute("data-widget-state", "failed"); }
        }).catch(function () {
          delete pending[key];
          target.setAttribute("data-widget-state", "failed");
        });
      })(host, id, props, type);
    }
    // Cleanup: Handles ohne Host in diesem Render freigeben (WebGL-Kontext,
    // Listener, rAF-Schleife).
    for (var stale in handles) {
      if (!Object.prototype.hasOwnProperty.call(handles, stale)) continue;
      if (live[stale]) continue;
      try {
        if (handles[stale] && typeof handles[stale].destroy === "function") handles[stale].destroy();
      } catch (e) {}
      delete handles[stale];
      delete pending[stale];
    }
  `;
  body.appendChild(script);
}
