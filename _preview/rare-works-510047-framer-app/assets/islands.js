(function () {
  "use strict";
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
  // Imported foreign code (ADR-0010): the payload is a self-contained module
  // written by this bake. It loads only when its host scrolls near the
  // viewport, never from a foreign URL, and every failure stays visible — the
  // host keeps its poster, or its plate when there is no poster at all.
  (function () {
    var urls = {"rel-payload-1":"/assets/payloads/rel-payload-1.e94ba458.js"};
    var hosts = document.querySelectorAll('[data-island="payload"]');
    if (hosts.length === 0) return;
    var mount = function (host) {
      if (host.getAttribute("data-payload-state") === "mounted") return;
      var id = host.getAttribute("data-payload-id") || "";
      var url = Object.prototype.hasOwnProperty.call(urls, id) ? urls[id] : "";
      if (url === "") {
        // No payload in this build: the poster (or the plate) is the answer.
        host.setAttribute("data-payload-state", host.getAttribute("data-payload-poster") === "1" ? "failed" : "plate");
        return;
      }
      import(url).then(function (module) {
        var fn = module && (typeof module.mount === "function" ? module.mount : (module.default && typeof module.default.mount === "function" ? module.default.mount : null));
        var stage = host.querySelector("[data-payload-stage]") || host;
        if (typeof fn !== "function") {
          host.setAttribute("data-payload-state", host.getAttribute("data-payload-poster") === "1" ? "failed" : "plate");
          return;
        }
        try {
          fn(stage, { id: id, host: host });
          host.setAttribute("data-payload-state", "mounted");
        } catch (error) {
          host.setAttribute("data-payload-state", host.getAttribute("data-payload-poster") === "1" ? "failed" : "plate");
        }
      }).catch(function () {
        host.setAttribute("data-payload-state", host.getAttribute("data-payload-poster") === "1" ? "failed" : "plate");
      });
    };
    if (typeof IntersectionObserver !== "function") {
      for (var index = 0; index < hosts.length; index += 1) mount(hosts[index]);
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      for (var index = 0; index < entries.length; index += 1) {
        if (!entries[index].isIntersecting) continue;
        observer.unobserve(entries[index].target);
        mount(entries[index].target);
      }
    }, { rootMargin: "300px" });
    for (var index = 0; index < hosts.length; index += 1) observer.observe(hosts[index]);
  })();
  });
})();
