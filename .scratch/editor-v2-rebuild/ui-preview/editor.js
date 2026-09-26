/* =====================================================================
   Senify — Prototyp, Editor
   =====================================================================

   Werkzeugprofil: eckig, dicht, 28/32 px. Canvas mit drei Geräten oder
   Solo; Auswahlrahmen mit Doppelkante, Griffen, Plus-Griff, Aktionsleiste
   und Abstandsbändern; Inspektor mit Zustands- und Geräteumschaltung;
   Motion-Panel; Agent mit Freigabe; Verlauf als Blatt.

   Der Editor ist ein Prototyp: er zeigt die Mechanik, nicht die Engine.
   Wo eine Aktion keine echte Entsprechung hat, sagt er das als Satz.
   ===================================================================== */

(() => {
  "use strict";

  const P = window.PROTO;
  const A = () => window.SENIFY_APP;
  const I = (n, s) => window.ICONS.get(n, s);
  const esc = (s) => window.SENIFY_APP.esc(s);

  /* ------------------------------------------------------------- Zustand */
  const S = {
    nodes: [],                       // flache Baumliste (abgeleitet)
    tree: JSON.parse(JSON.stringify(P.tree)),
    open: { n1: true, n2: true, n9: true },
    selected: "n3",
    mode: "design",                  // design | live
    solo: null,                      // null | "desktop" | "tablet" | "mobile"
    zoom: null,                      // null = anpassen
    grid: false, ruler: false, bands: true, snap: true,
    tab: "Style",                    // Content | Style | Interactions | Advanced
    state: "base",                   // base | hover | focus | active | disabled
    device: "desktop",
    sections: JSON.parse(JSON.stringify(P.inspector)),
    values: {},                      // key -> Wert (Basis)
    styles: {},                      // key -> { v, unit } — angewandte Vorschau
    removed: [],                     // ausgeblendete Knoten-IDs
    deviceValues: {},                // key -> { tablet, mobile }
    stateValues: {},                 // state -> { key: Wert }
    motion: { preset: "fade-up", intensity: 5, trigger: "Sichtbar", delay: 0 },
    inserted: [],
    agentOpen: false,
    historyOpen: false,
    dirty: false,
    saveState: "saved",              // saved | dirty | busy
    message: "Bereit",
    undos: [],
  };
  const STATES = ["base", "hover", "focus", "active", "disabled"];
  const STATE_LABEL = { base: "Basis", hover: "Hover", focus: "Fokus", active: "Aktiv", disabled: "Gesperrt" };
  const DEVICES = [
    { id: "desktop", label: "Desktop", w: 1440, icon: "monitor" },
    { id: "tablet", label: "Tablet", w: 1024, icon: "tablet" },
    { id: "mobile", label: "Mobil", w: 390, icon: "phone" },
  ];

  /* ------------------------------------------------------------ Ableitung */
  function flatten(nodes, depth = 0, out = []) {
    for (const n of nodes) {
      out.push({ node: n, depth });
      if (n.children && S.open[n.id]) flatten(n.children, depth + 1, out);
    }
    return out;
  }
  function findNode(id, nodes = S.tree) {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const hit = findNode(id, n.children); if (hit) return hit; }
    }
    return null;
  }
  function findParent(id, nodes = S.tree, parent = null) {
    for (const n of nodes) {
      if (n.id === id) return parent;
      if (n.children) { const hit = findParent(id, n.children, n); if (hit !== null) return hit; }
    }
    return null;
  }
  const selectedNode = () => findNode(S.selected) || S.tree[0];
  const nodeLabel = (n) => n ? `${n.tag}${n.classes ? " ." + n.classes.split(" ")[0] : ""}` : "–";

  /* -------------------------------------------------------------- Rahmen */
  const frameHeight = 980;

  function sitePage(device) {
    const ins = S.inserted.map((s) => `
      <section class="site__section" data-node="${s.id}">
        <h2 class="site__h2" data-node="${s.id}-h">${s.label}</h2>
        <p class="muted" style="margin-top:8px;font-size:13px">Neu eingefügte Sektion aus dem Katalog.</p>
      </section>`).join("");
    return `
      <div class="site ${device === "mobile" ? "site--mobile" : ""}" data-node="root">
        <div class="site__nav" data-node="n1-nav">
          <span class="site__brand" data-node="n1-brand">Nick Webdesign</span>
          <span class="site__links" data-node="n1-links"><span>Leistungen</span><span>Referenzen</span><span>Bewertungen</span><span>Kontakt</span></span>
        </div>
        <section class="site__hero" data-node="n1">
          <div data-node="n2">
            <p class="site__kicker" data-node="n1-kicker">Dein WordPress Webdesign Profi</p>
            <h1 class="site__h1" data-node="n3">Ich kümmere mich um deine Webseite</h1>
            <p class="site__lead" data-node="n4">Ich gestalte einzigartige Webseiten, die deine Sichtbarkeit im Internet steigern und den optimalen ersten Eindruck vermitteln.</p>
            <div class="site__cta" data-node="n5">
              <a class="site__btn" data-node="n6">Projekt anfragen</a>
              <a class="site__btn site__btn--quiet" data-node="n7">Leistungen ansehen</a>
            </div>
          </div>
          <div class="site__media site__media--hero" style="margin:32px 0 0" data-node="n8"><span>hero-werkstatt.png · 1536×1024</span></div>
        </section>
        <section class="site__section" data-node="n9">
          <h2 class="site__h2" data-node="n10">Meine Leistungen im Überblick</h2>
          <div class="site__cards" data-node="n11">
            <article class="site__card" data-node="n12"><h3>Webdesign</h3><p>Klare Layouts, ruhige Farben, saubere Strukturen. Modern, ohne aufdringlich zu sein.</p></article>
            <article class="site__card" data-node="n13"><h3>Website Relaunches</h3><p>Bestehende Seiten auf einen aktuellen Stand: neues Design, bessere Struktur, saubere Technik.</p></article>
            <article class="site__card" data-node="n14"><h3>SEO</h3><p>Klare Texte, saubere Struktur, schnelle Ladezeiten — mehr passende Besucher.</p></article>
          </div>
        </section>
        <section class="site__quote" data-node="n15">
          <blockquote data-node="n16">„Schnell, sauber, direkt. Die Seite fühlt sich an wie meine Arbeit.“</blockquote>
          <cite data-node="n15-cite">Kundin, Projekt 2026</cite>
        </section>
        ${ins}
        <section class="site__section" data-node="n17">
          <h2 class="site__h2" data-node="n18">Bereit für eine Seite, die passt?</h2>
          <div class="site__cta"><a class="site__btn" data-node="n19">Jetzt anfragen</a></div>
        </section>
        <footer class="site__footer" data-node="n20">
          <span data-node="n21">© 2026 Nick Webdesign</span>
          <span>Impressum · Datenschutz</span>
        </footer>
      </div>`;
  }

  /* --------------------------------------------------------------- Render */
  function render(root) {
    root.innerHTML = `
      <div class="ed ${S.grid ? "grid-on" : ""} ${S.ruler ? "ruler-on" : ""} ${S.snap ? "snap-on" : ""}">
        ${topbar()}
        ${toolbar()}
        <div class="ed-main">
          ${explorer()}
          ${stage()}
          ${inspector()}
        </div>
        ${statusbar()}
        ${S.agentOpen ? agentPanel() : ""}
        ${S.historyOpen ? historyPanel() : ""}
      </div>`;
    afterRender();
  }

  function topbar() {
    return `
      <header class="ed-topbar">
        <button class="ed-back" data-eact="to-program" title="Zum Programm">${I("arrowLeft", 15)} Programm</button>
        <span style="width:1px;height:20px;background:var(--ui-line)"></span>
        <div class="ed-doc">
          <span class="crumb">${esc(P.site.name)} /</span>
          <input class="title" value="Home" data-eact="rename-page" aria-label="Seitentitel">
        </div>
        <span class="save-state ${S.saveState === "dirty" ? "save-state--dirty" : S.saveState === "busy" ? "save-state--busy" : ""}">
          <span class="dot"></span>${S.saveState === "saved" ? "Gespeichert 14:26" : S.saveState === "busy" ? "Speichert …" : "Nicht gespeichert"}
        </span>
        <div class="ed-seg" role="group" aria-label="Modus">
          <button aria-pressed="${S.mode === "design"}" data-eact="mode" data-mode="design">Design</button>
          <button aria-pressed="${S.mode === "live"}" data-eact="mode" data-mode="live">Live</button>
        </div>
        <span class="spacer"></span>
        <div class="group">
          <button class="btn btn--icon btn--quiet" data-eact="undo" title="Rückgängig (Ctrl+Z)" aria-label="Rückgängig">${I("undo", 16)}</button>
          <button class="btn btn--icon btn--quiet" data-eact="redo" title="Wiederholen (Ctrl+Shift+Z)" aria-label="Wiederholen">${I("redo", 16)}</button>
          <button class="btn btn--icon btn--quiet" data-eact="history" title="Verlauf" aria-label="Verlauf">${I("clock", 16)}</button>
        </div>
        <span style="width:1px;height:20px;background:var(--ui-line)"></span>
        <button class="ed-zoom" data-eact="zoom-menu">${I("search", 13)} ${Math.round((S.zoom || fitZoom()) * 100)}% ${I("chevronDown", 10)}</button>
        <button class="btn btn--icon btn--quiet ed-agent-btn" data-eact="agent" title="Agent" aria-label="Agent">${I("agent", 16)}<span class="live"></span></button>
        <button class="btn btn--primary" data-eact="publish">${I("upload", 15)} Veröffentlichen</button>
      </header>`;
  }

  function toolbar() {
    const tool = (act, icon, label, pressed, chev) =>
      `<button class="btn ed-tool" data-eact="${act}" ${pressed !== undefined ? `aria-pressed="${pressed}"` : ""}>${I(icon, 15)} ${label} ${chev ? I("chevronDown", 10) : ""}</button>`;
    return `
      <div class="ed-toolbar" role="toolbar" aria-label="Werkzeuge">
        ${tool("insert-section", "plus", "Einfügen", undefined, true)}
        <span class="sep"></span>
        ${tool("wrap", "box", "Umformen")}
        ${tool("duplicate", "copy", "Duplizieren")}
        ${tool("delete", "trash", "Löschen")}
        <span class="sep"></span>
        ${tool("state-menu", "component", `Zustand: ${STATE_LABEL[S.state]}`, undefined, true)}
        <span class="sep"></span>
        ${tool("device-menu", "monitor", DEVICES.find((d) => d.id === (S.solo || S.device)).label, undefined, true)}
        ${tool("solo", "box", "Solo", !!S.solo)}
        <span class="sep"></span>
        ${tool("grid", "grid", "Raster", S.grid)}
        ${tool("ruler", "ruler", "Lineal", S.ruler)}
        ${tool("bands", "box", "Bänder", S.bands)}
        ${tool("snap", "magnet", "Einrasten", S.snap)}
        <span class="spacer"></span>
        <button class="btn ed-tool" data-eact="zoom-out" aria-label="Kleiner">${I("minus", 14)}</button>
        <button class="btn ed-tool" data-eact="zoom-in" aria-label="Größer">${I("plus", 14)}</button>
      </div>`;
  }

  function explorer() {
    const rows = flatten(S.tree);
    const kindIcon = { section: "layers", container: "box", text: "text", image: "media", component: "component" };
    return `
      <aside class="ed-explorer" aria-label="Ebenen">
        <div class="ed-tabs" role="tablist">
          <button class="ed-tab" aria-selected="true" role="tab">Ebenen <span class="count">${countNodes(S.tree)}</span></button>
          <button class="ed-tab" role="tab" data-eact="tab-pages">Seiten</button>
          <button class="ed-tab" role="tab" data-eact="tab-components">Komponenten</button>
        </div>
        <div class="ed-search">
          <span class="field">${I("search", 13)}<input placeholder="Ebenen durchsuchen …" aria-label="Ebenen durchsuchen"></span>
        </div>
        <div class="tree" role="tree">
          ${rows.map(({ node, depth }) => `
            <div class="tree-row" role="treeitem" aria-selected="${node.id === S.selected}" data-id="${node.id}" data-eact="select"
                 data-hidden="${node.hidden ? "true" : "false"}" style="padding-left:${8 + depth * 16}px">
              <span class="twist" data-eact="twist" data-id="${node.id}">${node.children && node.children.length ? I(S.open[node.id] ? "chevronDown" : "chevronRight", 12) : ""}</span>
              ${I(kindIcon[node.kind] || "box", 14)}
              <span class="label" data-eact="rename" data-id="${node.id}">${esc(node.label)}</span>
              <span class="kind">${esc(node.tag)}</span>
              ${node.classes ? `<span class="cls">.${esc(node.classes.split(" ")[0])}</span>` : ""}
              <span class="grow"></span>
              <span class="flags">
                <span class="icon" data-eact="toggle-hidden" data-id="${node.id}" title="${node.hidden ? "Einblenden" : "Ausblenden"}">${I(node.hidden ? "eyeOff" : "eye", 13)}</span>
                <span class="icon" data-eact="toggle-lock" data-id="${node.id}" title="${node.locked ? "Entsperren" : "Sperren"}">${I(node.locked ? "lock" : "unlock", 13)}</span>
              </span>
            </div>`).join("")}
        </div>
      </aside>`;
  }

  function countNodes(nodes) {
    let n = 0;
    for (const x of nodes) { n += 1; if (x.children) n += countNodes(x.children); }
    return n;
  }

  function stage() {
    const devs = visibleDevices();
    const z = S.zoom || fitZoom();
    S.drawnZoom = z;   /* welcher Zoom wirklich gezeichnet wurde */
    return `
      <section class="ed-stage" aria-label="Bühne">
        <div class="device-bar">
          <span class="spacer"></span>
          ${S.mode === "live" ? `<span class="solo-note">Live — echte Größe, native Scroll</span>` : S.solo ? `<span class="solo-note">Solo — ${esc(S.solo)}</span>` : `<span class="solo-note">3 Geräte · auf Breite eingepasst</span>`}
          <span class="solo-note">Zoom ${Math.round(z * 100)} %</span>
        </div>
        <div class="canvas" id="canvas">
          ${devs.map((d) => `
            <div class="frame-wrap" data-frame="${d.id}" style="width:${Math.round(d.w * z)}px;height:${Math.round(frameHeight * z)}px;position:relative;flex:none">
              <div class="frame-label">${I(d.icon, 12)} ${esc(d.label)} <span class="w">${d.w} px</span></div>
              <div class="frame" data-frame-content="${d.id}" style="width:${d.w}px;height:${frameHeight}px;transform:scale(${z});transform-origin:top left;overflow:hidden">
                <div class="grid-overlay" style="--grid-step:${gridStep(z)}px"></div>
                <div class="frame__content" style="height:100%;overflow:hidden">${sitePage(d.id)}</div>
              </div>
              <div class="ruler" aria-hidden="true">${rulerTicks(d.w, z)}</div>
              <div data-overlay="${d.id}"></div>
            </div>`).join("")}
          <div class="snap-line snap-line--v" data-snap-v style="left:0"></div>
          <div class="snap-line snap-line--h" data-snap-h style="top:0"></div>
          <div class="marquee" data-marquee></div>
        </div>
      </section>`;
  }

  /* Lineal und Raster sind Messinstrumente: sie gehören ins Bildschirmmaß,
     sonst wird aus 10 px Schrift bei 26 % Zoom 2,6 px. Das Lineal beschriftet
     Dokumentwerte, seine Teilstriche sitzen auf den Bildschirmpositionen. */
  function rulerTicks(docW, z) {
    const step = z >= 0.45 ? 100 : z >= 0.25 ? 200 : 400;
    const out = [];
    for (let v = step; v * z < docW * z - 4; v += step) out.push(`<span style="left:${(v * z).toFixed(1)}px">${v}</span>`);
    return out.join("");
  }

  /* Der 4-px-Takt bleibt erhalten, wird aber nie feiner als ~4 Bildschirm-px
     gezeichnet (bei 26 % wären 4 Dokument-px sonst 1 px Flimmern). Der Wert
     ist ein DOKUMENTmaß: das Raster liegt im skalierten Rahmen und wird dort
     noch einmal mit dem Zoom multipliziert. */
  function gridStep(z) {
    return 4 * Math.max(1, Math.ceil(0.9 / z));
  }

  /* --------------------------------------------------------------- Zoom
     Der Zoom wird gemessen, nicht geraten: die drei Rahmen müssen mit
     ihren Abständen in die Bühnenfläche passen, sonst liegt der erste
     hinter dem Ebenen-Panel und der letzte hinter dem Inspektor. */
  let stageW = 0, stageH = 0, stageGap = 0, fitPass = 0;

  const visibleDevices = () => (S.solo ? DEVICES.filter((d) => d.id === S.solo) : DEVICES);

  function measureCanvas() {
    const c = document.querySelector(".ed-stage .canvas");
    if (!c) return false;
    const cs = getComputedStyle(c);
    const w = c.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const h = c.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    const gap = (parseFloat(cs.columnGap) || 0) || (parseFloat(cs.gap) || 0) || 32;
    const changed = Math.abs(w - stageW) > 1 || Math.abs(h - stageH) > 1 || Math.abs(gap - stageGap) > 1;
    stageW = w; stageH = h; stageGap = gap;
    return changed;
  }

  function fitZoom() {
    if (S.mode === "live") return 1;
    const devs = visibleDevices();
    const sumW = devs.reduce((a, d) => a + d.w, 0);
    const gaps = Math.max(0, devs.length - 1) * (stageGap || 32);
    if (!stageW) return S.solo ? 0.6 : 0.26;   /* erster Durchlauf; danach wird gemessen */
    const zw = (stageW - gaps) / sumW;
    const zh = stageH ? stageH / frameHeight : 1;
    return Math.min(1, Math.max(0.15, Math.min(zw, zh)));
  }

  /* ------------------------------------------------------------- Inspektor */
  function inspector() {
    const n = selectedNode();
    const tabs = ["Content", "Style", "Interactions", "Advanced"];
    let body = "";
    if (S.tab === "Style") body = styleTab();
    else if (S.tab === "Content") body = contentTab(n);
    else if (S.tab === "Interactions") body = interactionsTab();
    else body = advancedTab(n);

    return `
      <aside class="ed-inspector" aria-label="Inspektor">
        <div class="insp-head">
          <span class="crumb" title="${esc(n.label)}">${esc(nodeLabel(n))}</span>
          <span class="spacer"></span>
          <button class="btn btn--icon btn--quiet btn--sm" data-eact="node-menu" aria-label="Ebenen-Menü">${I("more", 14)}</button>
          <button class="btn btn--icon btn--quiet btn--sm" data-eact="insp-close" aria-label="Inspektor schließen">${I("x", 14)}</button>
        </div>
        <div class="insp-device">
          <div class="seg" role="group" aria-label="Gerät">
            ${DEVICES.map((d) => `<button data-eact="device" data-device="${d.id}" aria-pressed="${S.device === d.id}" title="${esc(d.label)}" aria-label="Gerät ${esc(d.label)}">${I(d.icon, 14)}</button>`).join("")}
          </div>
          <button class="link" data-eact="show-all">Alle anzeigen</button>
        </div>
        <div class="ed-tabs" role="tablist">
          ${tabs.map((t) => `<button class="ed-tab" role="tab" aria-selected="${S.tab === t}" data-eact="insp-tab" data-tab="${t}">${esc(t)}</button>`).join("")}
        </div>
        <div class="insp-body">${body}</div>
      </aside>`;
  }

  function stateRow() {
    return `
      <div class="insp-state" role="group" aria-label="Zustand">
        ${STATES.map((s) => {
          const has = s === "base" ? true : Object.keys(S.stateValues[s] || {}).length > 0;
          return `<button data-eact="state" data-state="${s}" aria-pressed="${S.state === s}">${esc(STATE_LABEL[s])}${has && s !== "base" ? '<span class="dirty" title="Werte gesetzt"></span>' : ""}</button>`;
        }).join("")}
      </div>`;
  }

  function fieldValue(f) {
    if (S.state !== "base" && S.stateValues[S.state] && f.key in S.stateValues[S.state]) return S.stateValues[S.state][f.key];
    if (S.device !== "desktop" && S.deviceValues[f.key] && S.deviceValues[f.key][S.device] !== undefined) return S.deviceValues[f.key][S.device];
    return f.value;
  }
  const isSet = (f) => S.state !== "base"
    ? !!(S.stateValues[S.state] && f.key in S.stateValues[S.state])
    : S.device !== "desktop"
      ? !!(S.deviceValues[f.key] && S.deviceValues[f.key][S.device] !== undefined)
      : !!(S.values[f.key] !== undefined);

  function field(f) {
    const v = fieldValue(f);
    const set = isSet(f);
    const devMark = f.device && S.device !== "desktop" && S.deviceValues[f.key] && S.deviceValues[f.key][S.device] !== undefined;
    const label = `<span class="p-field__label">${esc(f.label)}${f.device ? '<span class="inherited" title="je Gerät">·G</span>' : ""}${devMark ? '<span class="dev" title="Hier gesetzt"></span>' : ""}
      <button class="p-reset" data-eact="reset" data-key="${f.key}" title="Zurücksetzen">Zurücksetzen</button></span>`;
    let control = "";
    if (f.kind === "number") control = `
      <span class="p-input" data-set="${set}">
        <input value="${esc(v)}" data-eact="value" data-key="${f.key}" inputmode="decimal">
        <span class="unit">${esc(f.unit || "")}</span>
        <span class="step"><button data-eact="step" data-key="${f.key}" data-dir="1" aria-label="Erhöhen">${I("chevronUp", 8)}</button><button data-eact="step" data-key="${f.key}" data-dir="-1" aria-label="Verringern">${I("chevronDown", 8)}</button></span>
      </span>`;
    else if (f.kind === "select") control = `
      <span class="p-input p-select" data-set="${set}">
        <select data-eact="value" data-key="${f.key}">${f.options.map((o) => `<option ${String(o) === String(v) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
      </span>`;
    else if (f.kind === "color") control = `
      <span class="p-color" data-eact="color" data-key="${f.key}" data-set="${set}">
        <span class="swatch" style="background:${esc(v)}"></span>
        <span class="hex">${esc(v)}</span>
        ${f.token ? `<span class="token">${esc(f.token)}</span>` : ""}
      </span>`;
    else if (f.kind === "slider") control = `
      <span class="p-slider" data-set="${set}">
        <input type="range" min="0" max="100" value="${esc(v)}" data-eact="slider" data-key="${f.key}">
        <span class="val">${esc(v)}${esc(f.unit || "")}</span>
      </span>`;
    else if (f.kind === "quad") control = `
      <span class="p-quad" data-set="${set}">
        ${["O", "R", "U", "L"].map((side, i) => `<span class="p-input"><span class="unit" style="width:10px">${side}</span><input value="${esc(v[i])}" data-eact="quad" data-key="${f.key}" data-i="${i}"><span class="unit">px</span></span>`).join("")}
      </span>`;
    return `<div class="p-field" data-set="${set}" data-field="${f.key}">${label}${control}</div>`;
  }

  function styleTab() {
    return `
      ${stateRow()}
      ${S.sections.map((sec) => `
        <section class="panel-section" data-open="${sec.open}">
          <button class="panel-section__head" data-eact="section" data-id="${sec.id}">
            ${I("chevronDown", 12)}<span class="t">${esc(sec.title)}</span>
            <span class="count">${sec.fields.filter(isSet).length || ""}</span>
          </button>
          <div class="panel-section__body">
            <div class="p-row">
              ${sec.fields.map(field).join("")}
            </div>
            ${sec.id === "motion" ? "" : ""}
          </div>
        </section>`).join("")}
      <div style="padding:12px">
        <button class="btn btn--sm" data-eact="open-property">${I("plus", 13)} Eigenschaft hinzufügen</button>
      </div>`;
  }

  function contentTab(n) {
    return `
      <div class="panel-section" data-open="true">
        <div class="panel-section__head" style="cursor:default"><span class="t">Inhalt</span></div>
        <div class="panel-section__body">
          <div class="p-row p-row--full">
            <div class="p-field"><span class="p-field__label">Text</span>
              <span class="p-input" style="height:auto;padding:8px"><input value="${esc(n.label)}" data-eact="node-text"></span></div>
          </div>
          <div class="p-row">
            <div class="p-field"><span class="p-field__label">Tag</span>
              <span class="p-input p-select"><select data-eact="node-tag"><option>${esc(n.tag)}</option><option>h1</option><option>h2</option><option>p</option><option>div</option></select></span></div>
            <div class="p-field"><span class="p-field__label">Rolle</span>
              <span class="p-input p-select"><select><option>Standard</option><option>Überschrift</option><option>Text</option><option>Bild</option></select></span></div>
          </div>
          <div class="p-row p-row--full">
            <div class="p-field"><span class="p-field__label">Link</span>
              <span class="p-input">${I("link", 12)}<input placeholder="https://…" value="${n.kind === "component" ? "#kontakt" : ""}"></span></div>
          </div>
          ${n.kind === "image" ? `
          <div class="p-row p-row--full">
            <div class="p-field"><span class="p-field__label">Bild</span>
              <span class="p-media"><span class="thumb">${I("media", 14)}</span><span class="name">hero-werkstatt.png · 1536×1024</span></span></div>
          </div>
          <div class="p-row p-row--full">
            <div class="p-field"><span class="p-field__label">Alt-Text</span>
              <span class="p-input"><input placeholder="Was zeigt das Bild?"></span></div>
          </div>` : ""}
        </div>
      </div>
      <div class="panel-section" data-open="true">
        <div class="panel-section__head" style="cursor:default"><span class="t">Herkunft</span></div>
        <div class="panel-section__body">
          <p class="muted" style="font-size:var(--ui-text-12)">Zuletzt geändert von Mensch · Heute, 14:26 · Entwurf v43</p>
        </div>
      </div>`;
  }

  function interactionsTab() {
    return `
      ${stateRow()}
      <section class="panel-section" data-open="true">
        <div class="panel-section__head" style="cursor:default"><span class="t">Bewegung</span><span class="count">${esc(S.motion.preset)}</span></div>
        <div class="panel-section__body">
          <div class="motion-preview ${""}" data-motion-preview><div class="box" data-motion-box>${esc(S.motion.intensity)}</div></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn--sm" data-eact="motion-play">${I("play", 13)} Abspielen</button>
            <button class="btn btn--sm" data-eact="motion-scrub">Scrub</button>
          </div>
          <div class="p-row p-row--full" style="margin-top:8px">
            <div class="p-field"><span class="p-field__label">Preset</span>
              <span class="p-input p-select"><select data-eact="motion-preset">
                ${P.motionPresets.map((p) => `<option value="${p.id}" ${S.motion.preset === p.id ? "selected" : ""}>${esc(p.name)} — ${esc(p.detail)}</option>`).join("")}
              </select></span></div>
          </div>
          <div class="p-row p-row--full">
            <div class="p-field"><span class="p-field__label">Intensität (Profil: showcase · max 10)</span>
              <span class="p-slider"><input type="range" min="1" max="10" value="${S.motion.intensity}" data-eact="motion-intensity"><span class="val">${S.motion.intensity}</span></span></div>
          </div>
          <div class="p-row">
            <div class="p-field"><span class="p-field__label">Auslöser</span>
              <span class="p-input p-select"><select data-eact="motion-trigger"><option>Sichtbar</option><option>Scrollen</option><option>Zeiger</option><option>Laden</option></select></span></div>
            <div class="p-field"><span class="p-field__label">Reduced Motion</span>
              <span class="p-input p-select"><select><option>Statisch</option><option>Fade</option><option>Aus</option></select></span></div>
          </div>
          <p class="field-hint">Presets sind profilgebunden: „showcase“ erlaubt 10, inklusive 3D (1× je Seite).</p>
        </div>
      </section>
      <section class="panel-section" data-open="false">
        <button class="panel-section__head" data-eact="section" data-id="ix"><span class="t">Interaktion</span><span class="count">0</span></button>
        <div class="panel-section__body">
          <p class="muted" style="font-size:var(--ui-text-12)">Auslöser → Ziel → Aktion, auf Preset-Basis. Noch keine Interaktion gesetzt.</p>
        </div>
      </section>`;
  }

  function advancedTab(n) {
    return `
      <section class="panel-section" data-open="true">
        <div class="panel-section__head" style="cursor:default"><span class="t">Klassen</span></div>
        <div class="panel-section__body">
          <div style="display:flex;gap:4px;flex-wrap:wrap">${(n.classes || "").split(" ").filter(Boolean).map((c) => `<span class="chip chip--sm">.${esc(c)}</span>`).join("")}</div>
          <div class="p-input" style="margin-top:6px">${I("plus", 12)}<input placeholder="Klasse hinzufügen"></div>
        </div>
      </section>
      <section class="panel-section" data-open="true">
        <div class="panel-section__head" style="cursor:default"><span class="t">Bedingung</span></div>
        <div class="panel-section__body">
          <div class="p-condition">
            <div class="row"><span class="join">Wenn</span><span class="p-input p-select" style="flex:1"><select><option>Collection-Feld</option><option>Seiten-Pfad</option><option>Breakpoint</option></select></span></div>
            <div class="row"><span class="join">gleich</span><span class="p-input" style="flex:1"><input placeholder="Wert"></span></div>
          </div>
          <button class="btn btn--sm" style="margin-top:6px">${I("plus", 12)} Bedingung</button>
        </div>
      </section>
      <section class="panel-section" data-open="true">
        <div class="panel-section__head" style="cursor:default"><span class="t">Fortgeschritten</span></div>
        <div class="panel-section__body">
          <div class="p-row"><div class="p-field"><span class="p-field__label">ID</span><span class="p-input"><input placeholder="—"></span></div>
            <div class="p-field"><span class="p-field__label">Sichtbarkeit</span><span class="p-input p-select"><select><option>Alle Geräte</option><option>Nur Desktop</option><option>Nur Mobil</option></select></span></div></div>
          <div class="p-row p-row--full"><div class="p-field"><span class="p-field__label">Rohes CSS (Mensch)</span>
            <span class="p-input" style="height:auto;padding:8px;font-family:var(--ui-font-mono);font-size:var(--ui-text-10)"><input placeholder=".hero-title { … }"></span></div></div>
        </div>
      </section>
      <section class="panel-section" data-open="true">
        <div class="panel-section__head" style="cursor:default"><span class="t">Instanz</span></div>
        <div class="panel-section__body">
          <div class="tool-card"><div class="head">${I("component", 13)}<span class="name">component.card</span><span class="status">v3</span></div>
            <div class="result">4 Instanzen · keine Drift · Overrides: 2</div></div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn btn--sm" data-eact="component-edit">Definition öffnen</button>
            <button class="btn btn--sm" data-eact="component-detach">Lösen</button>
          </div>
        </div>
      </section>`;
  }

  /* ------------------------------------------------------------ Statuszeile */
  function statusbar() {
    const n = selectedNode();
    return `
      <footer class="ed-status">
        <span class="sel">${esc(nodeLabel(n))}</span>
        <span>Zoom ${Math.round((S.zoom || fitZoom()) * 100)}%</span>
        <span>${esc(DEVICES.find((d) => d.id === S.device).label)}</span>
        <span>${S.saveState === "saved" ? "Pause aus" : "Pause — nicht gespeichert"}</span>
        <span class="spacer"></span>
        <span class="msg">${esc(S.message)}</span>
        <span>${P.jobs.filter((j) => j.status === "running" || j.status === "queued").length} offene Aufträge</span>
      </footer>`;
  }

  /* ---------------------------------------------------------------- Agent */
  function agentPanel() {
    return `
      <aside class="agent" aria-label="Agent">
        <div class="agent__head">
          <span class="t">Agent</span>
          <span class="agent__live"><span class="dot"></span>Live-Follow</span>
          <button class="btn btn--icon btn--quiet btn--sm" data-eact="agent-close" aria-label="Agent schließen">${I("x", 14)}</button>
        </div>
        <div class="agent__body" id="agent-body">
          ${P.chat.map((m, i) => message(m, i)).join("")}
        </div>
        <div class="agent__foot">
          <span class="field">${I("agent", 14)}<input placeholder="Auftrag an den Agenten …" aria-label="Nachricht"></span>
          <button class="btn btn--icon btn--primary" data-eact="agent-send" aria-label="Senden">${I("arrowUp", 15)}</button>
        </div>
      </aside>`;
  }

  function message(m, i) {
    if (m.who === "human") {
      return `<div class="msg msg--human"><span class="who">Du</span><span class="bubble">${esc(m.text)}</span></div>`;
    }
    return `<div class="msg msg--agent">
      <span class="who">Agent</span>
      <span class="bubble">${esc(m.text)}</span>
      ${(m.tools || []).map((t) => `
        <div class="tool-card tool-card--${t.status === "fertig" ? "done" : ""}">
          <div class="head">${I("component", 13)}<span class="name">${esc(t.name)}</span><span class="status">${esc(t.status)}</span></div>
          <div class="result">${esc(t.result)}</div>
        </div>`).join("")}
      ${m.approval ? `
        <div class="approval" data-approval="${i}">
          <span class="t">Freigabe nötig: ${esc(m.approval.title)}</span>
          <span class="d">${esc(m.approval.detail)}</span>
          <span class="acts">
            <button class="btn btn--sm btn--primary" data-eact="approve" data-i="${i}">Freigeben</button>
            <button class="btn btn--sm" data-eact="deny" data-i="${i}">Ablehnen</button>
          </span>
        </div>` : ""}
      ${m.revert ? `<button class="btn btn--sm" data-eact="revert-turn" data-i="${i}">${I("undo", 12)} Antwort zurücknehmen</button>` : ""}
    </div>`;
  }

  /* --------------------------------------------------------------- Verlauf */
  function historyPanel() {
    const items = [
      ["14:26", "Text geändert — h1 „Ich kümmere mich …“", true],
      ["14:24", "Abstand geändert — section.hero"],
      ["14:19", "Bild getauscht — hero-werkstatt.png"],
      ["11:04", "Agent: 2 Mutationen (Leistungen)"],
      ["11:02", "Agent: Karten-Bindings"],
      ["Gestern", "Theme-Snapshot — Release 12"],
    ];
    return `
      <div class="scrim" data-eact="history-close" style="padding:0;display:block">
        <div class="sheet" role="dialog" aria-modal="true" aria-label="Verlauf" style="position:fixed;left:auto;right:0;top:48px;bottom:28px;width:min(440px,100%)" data-sheet>
          <div class="sheet__head">
            <button class="btn btn--icon btn--quiet" data-eact="history-close" aria-label="Zurück">${I("arrowLeft", 16)}</button>
            <strong style="flex:1;font-size:var(--ui-text-15)">Verlauf</strong>
            <span class="muted" style="font-size:var(--ui-text-12)">42 Einträge · 1 Undo-Schritt je Zug</span>
          </div>
          <div class="sheet__body">
            <div class="history-list">
              ${items.map(([t, l, cur]) => `<div class="history-item" ${cur ? 'aria-current="true"' : ""} data-eact="history-jump"><span class="time">${esc(t)}</span><span class="grow">${esc(l)}</span></div>`).join("")}
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------- Auswahl & Overlays */
  function afterRender() {
    applyAllStyles();
    applyFlags();
    const measured = measureCanvas();
    const want = frameScale();
    if (!S.zoom && (measured || Math.abs(want - (S.drawnZoom || 0)) > 0.002) && fitPass < 3) {
      fitPass += 1;
      render(document.getElementById("app"));
      return;
    }
    fitPass = 0;
    positionOverlays();
    bindCanvasEvents();
    window.removeEventListener("resize", onResize);
    window.addEventListener("resize", onResize);
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const changed = measureCanvas();
      if (changed && !S.zoom) { render(document.getElementById("app")); return; }
      positionOverlays();
    }, 80);
  }

  function applyAllStyles() {
    document.querySelectorAll("[data-frame-content] [data-node]").forEach((el) => { el.style.cssText = ""; });
    for (const [key, s] of Object.entries(S.styles)) applyStyle(key, s.v, s.unit);
    previewState();
  }

  function applyFlags() {
    S.removed.forEach((id) => document.querySelectorAll(`[data-node="${id}"]`).forEach((el) => { el.style.display = "none"; }));
    const walk = (nodes) => nodes.forEach((n) => {
      if (n.hidden) document.querySelectorAll(`[data-node="${n.id}"]`).forEach((el) => { el.style.display = "none"; });
      if (n.children) walk(n.children);
    });
    walk(S.tree);
  }

  function syncField(key) {
    const f = S.sections.flatMap((s) => s.fields).find((x) => x.key === key);
    const box = document.querySelector(`[data-field="${key}"]`);
    if (box && f) box.dataset.set = String(isSet(f));
  }

  function frameScale() {
    return S.zoom || fitZoom();
  }

  function positionOverlays() {
    const z = frameScale();
    const n = selectedNode();
    document.querySelectorAll("[data-frame]").forEach((wrap) => {
      const device = wrap.dataset.frame;
      const host = wrap.querySelector("[data-overlay]");
      if (!host) return;
      const content = wrap.querySelector("[data-frame-content]");
      const target = content && content.querySelector(`[data-node="${n.id}"]`);
      if (!target) { host.innerHTML = ""; return; }
      const fr = content.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      /* `tr` und `fr` sind bereits gerenderte (skalierte) Bildschirmmaße.
         Ein zweites Mal mit dem Zoom multipliziert säße der Rahmen bei
         einem Drittel der Strecke — genau der Fehler, der hier behoben ist. */
      const left = tr.left - fr.left;
      const top = tr.top - fr.top;
      const width = tr.width;
      const height = tr.height;
      const active = device === (S.solo || S.device) || (!S.solo && device === "desktop");
      const inside = top < 22;
      const wrapW = wrap.getBoundingClientRect().width;
      host.innerHTML = `
        <div class="selection ${active ? "selection--active" : ""}${inside ? " selection--badge-inside" : ""}" data-sel style="left:${left}px;top:${top}px;width:${width}px;height:${height}px">
          ${active ? `
            <span class="selection__badge">${esc(n.tag)}${n.classes ? ` <span class="cls">.${esc(n.classes.split(" ")[0])}</span>` : ""}</span>
            <span class="handle handle--nw"></span><span class="handle handle--n"></span><span class="handle handle--ne"></span>
            <span class="handle handle--w"></span><span class="handle handle--e"></span>
            <span class="handle handle--sw"></span><span class="handle handle--s"></span><span class="handle handle--se"></span>
            <button class="plus-handle" data-eact="plus" title="Danach einfügen" aria-label="Danach einfügen">${I("plus", 10)}</button>
            <span class="action-bar">
              <button class="grip" data-eact="drag-grip" title="Ziehen" aria-label="Ziehen">${I("grip", 12)}</button>
              <button data-eact="move-up" title="Nach oben" aria-label="Nach oben">${I("arrowUp", 12)}</button>
              <button data-eact="move-down" title="Nach unten" aria-label="Nach unten">${I("arrowDown", 12)}</button>
              <button data-eact="duplicate" title="Duplizieren" aria-label="Duplizieren">${I("copy", 12)}</button>
              <button class="danger" data-eact="delete" title="Löschen" aria-label="Löschen">${I("trash", 12)}</button>
            </span>
            ${S.bands ? `<span class="bands">
              <span class="band-margin"></span><span class="band-padding"></span>
              <span class="band-tag band-tag--margin">Außen 0</span>
              <span class="band-tag band-tag--padding">Innen 48 · 0</span>
            </span>` : ""}
          ` : ""}
        </div>`;
      clampBadge(host, wrapW, left);
    });
  }

  /* Die Beschriftung darf nicht aus dem Bild laufen: bei schmalen Rahmen
     (Mobil bei kleinem Zoom) klebt sie sonst an der Kante. */
  function clampBadge(host, wrapW, left) {
    const badge = host.querySelector(".selection__badge");
    if (!badge) return;
    const bw = badge.getBoundingClientRect().width;
    if (!bw || bw > wrapW - 4) { badge.style.display = "none"; return; }
    const want = Math.min(Math.max(left - 1, 2), wrapW - bw - 2);
    badge.style.left = `${want - left}px`;
  }

  function setHover(device, nodeId) {
    const wrap = document.querySelector(`[data-frame="${device}"]`);
    if (!wrap) return;
    const host = wrap.querySelector("[data-overlay]");
    const content = wrap.querySelector("[data-frame-content]");
    const target = nodeId && content.querySelector(`[data-node="${nodeId}"]`);
    let hover = host.querySelector("[data-hover]");
    /* Griffe erst am Element: dieselbe Bewegung schaltet sie frei
       (`.selection` trägt pointer-events:none, :hover greift dort nicht). */
    const sel = wrap.querySelector(".selection");
    if (sel) sel.classList.toggle("selection--near", !!target && nodeId === selectedNode().id);
    if (!target) { hover && hover.remove(); return; }
    const fr = content.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    if (!hover) {
      hover = document.createElement("div");
      hover.setAttribute("data-hover", "");
      hover.className = "selection selection--hover";
      host.appendChild(hover);
    }
    hover.style.cssText = `left:${tr.left - fr.left}px;top:${tr.top - fr.top}px;width:${tr.width}px;height:${tr.height}px`;
  }

  function bindCanvasEvents() {
    document.querySelectorAll("[data-frame-content]").forEach((content) => {
      const device = content.closest("[data-frame]").dataset.frame;
      content.addEventListener("mousemove", (e) => {
        const t = e.target.closest("[data-node]");
        if (t && t.dataset.node !== "root") setHover(device, t.dataset.node);
        else setHover(device, null);
      });
      content.addEventListener("mouseleave", () => setHover(device, null));
      content.addEventListener("mousedown", (e) => {
        const t = e.target.closest("[data-node]");
        if (!t || t.dataset.node === "root") return;
        e.preventDefault();
        select(t.dataset.node, device);
      });
      content.addEventListener("contextmenu", (e) => {
        const t = e.target.closest("[data-node]");
        if (!t || t.dataset.node === "root") return;
        e.preventDefault();
        select(t.dataset.node, device);
        const n = selectedNode();
        A().menu({ getBoundingClientRect: () => ({ left: e.clientX, bottom: e.clientY, top: e.clientY }) }, [
          { label: "Duplizieren", icon: "copy", keys: "Ctrl D", onClick: () => action("duplicate") },
          { label: "Kopieren", icon: "copy", keys: "Ctrl C" },
          { label: "Einfügen danach", icon: "plus", keys: "Ctrl V" },
          { sep: true },
          { label: "In Container wickeln", icon: "box" },
          { label: n.hidden ? "Einblenden" : "Ausblenden", icon: n.hidden ? "eye" : "eyeOff", onClick: () => action("toggle-hidden", { dataset: { id: n.id } }) },
          { label: n.locked ? "Entsperren" : "Sperren", icon: n.locked ? "unlock" : "lock", onClick: () => action("toggle-lock", { dataset: { id: n.id } }) },
          { sep: true },
          { label: "Löschen", icon: "trash", danger: true, keys: "Entf", onClick: () => action("delete") },
        ]);
      });
    });
  }

  /* --------------------------------------------------------------- Aktionen */
  function select(id, device) {
    S.selected = id;
    if (device) S.device = device;
    const parent = findParent(id);
    if (parent && !S.open[parent.id]) S.open[parent.id] = true;
    refreshTree();
    positionOverlays();
  }

  function refreshTree() {
    document.querySelectorAll(".tree-row").forEach((row) => row.setAttribute("aria-selected", String(row.dataset.id === S.selected)));
    const head = document.querySelector(".insp-head .crumb");
    if (head) head.textContent = nodeLabel(selectedNode());
    const body = document.querySelector(".insp-body");
    if (body) body.innerHTML = S.tab === "Style" ? styleTab() : S.tab === "Content" ? contentTab(selectedNode()) : S.tab === "Interactions" ? interactionsTab() : advancedTab(selectedNode());
    const status = document.querySelector(".ed-status .sel");
    if (status) status.textContent = nodeLabel(selectedNode());
    positionOverlays();
  }

  function markDirty(msg) {
    S.dirty = true;
    S.saveState = "dirty";
    S.message = msg || "Nicht gespeichert";
    const el = document.querySelector(".save-state");
    if (el) {
      el.className = "save-state save-state--dirty";
      el.innerHTML = `<span class="dot"></span>Nicht gespeichert`;
    }
    const st = document.querySelector(".ed-status .msg");
    if (st) st.textContent = S.message;
    const pause = document.querySelectorAll(".ed-status span")[3];
    if (pause) pause.textContent = "Pause — nicht gespeichert";
    clearTimeout(markDirty._t);
    markDirty._t = setTimeout(() => {
      S.saveState = "saved";
      const e2 = document.querySelector(".save-state");
      if (e2) { e2.className = "save-state"; e2.innerHTML = `<span class="dot"></span>Gespeichert 14:28`; }
      const p2 = document.querySelectorAll(".ed-status span")[3];
      if (p2) p2.textContent = "Pause aus";
      const st2 = document.querySelector(".ed-status .msg");
      if (st2) st2.textContent = "Autosave 2 s";
    }, 2400);
  }

  function applyStyle(key, value, unit) {
    const map = {
      size: (v, u) => ["fontSize", v + (u || "px")],
      weight: (v) => ["fontWeight", v],
      color: (v) => ["color", v],
      bg: (v) => ["background", v],
      align: (v) => ["textAlign", String(v).toLowerCase()],
      radius: (v, u) => ["borderRadius", v + (u || "px")],
      opacity: (v, u) => ["opacity", String(Number(v) / (u === "%" ? 100 : 1))],
      track: (v) => ["letterSpacing", v + "em"],
      lh: (v) => ["lineHeight", v],
      w: (v, u) => ["width", v + (u || "%")],
      minH: (v, u) => ["minHeight", v + (u || "px")],
      maxW: (v, u) => ["maxWidth", v + (u || "px")],
      gap: (v, u) => ["gap", v + (u || "px")],
    }[key];
    if (!map) return;
    const [prop, val] = map(value, unit);
    document.querySelectorAll(`[data-node="${S.selected}"]`).forEach((el) => { el.style[prop] = val; });
  }

  function action(name, el, ev) {
    switch (name) {
      case "to-program": A().go("#/"); break;
      case "mode": {
        S.mode = el.dataset.mode;
        S.message = S.mode === "live" ? "Live — echte Größe, native Scroll" : "Design — drei Geräte";
        render(document.getElementById("app"));
        break;
      }
      case "solo": {
        S.solo = S.solo ? null : S.device;
        S.message = S.solo ? `Solo — ${S.solo}` : "Drei Geräte";
        render(document.getElementById("app"));
        break;
      }
      case "device": {
        S.device = el.dataset.device;
        if (S.solo) S.solo = S.device;
        render(document.getElementById("app"));
        break;
      }
      case "grid": S.grid = !S.grid; S.message = S.grid ? "Raster 4 px an" : "Raster aus"; render(document.getElementById("app")); break;
      case "ruler": S.ruler = !S.ruler; render(document.getElementById("app")); break;
      case "bands": S.bands = !S.bands; S.message = S.bands ? "Abstandsbänder an" : "Abstandsbänder aus"; render(document.getElementById("app")); break;
      case "snap": S.snap = !S.snap; render(document.getElementById("app")); break;
      case "zoom-in": S.zoom = Math.min(1, (S.zoom || fitZoom()) + 0.1); render(document.getElementById("app")); break;
      case "zoom-out": S.zoom = Math.max(0.2, (S.zoom || fitZoom()) - 0.1); render(document.getElementById("app")); break;
      case "zoom-menu": A().menu(el, [
        { label: "An Fenster anpassen", icon: "search", onClick: () => { S.zoom = null; render(document.getElementById("app")); } },
        { label: "50 %", onClick: () => { S.zoom = 0.5; render(document.getElementById("app")); } },
        { label: "75 %", onClick: () => { S.zoom = 0.75; render(document.getElementById("app")); } },
        { label: "100 %", keys: "Ctrl 0", onClick: () => { S.zoom = 1; render(document.getElementById("app")); } },
      ]); break;
      case "select": select(el.dataset.id); break;
      case "twist": {
        const id = el.dataset.id;
        S.open[id] = !S.open[id];
        render(document.getElementById("app"));
        break;
      }
      case "rename": {
        if (ev && ev.detail < 2) break; /* Doppelklick */
        const id = el.dataset.id;
        const n = findNode(id);
        const input = document.createElement("input");
        input.value = n.label;
        input.style.cssText = "flex:1;min-width:0;border:1px solid var(--ui-line-control);border-radius:4px;background:var(--ui-surface-panel);font:inherit;padding:1px 4px";
        el.replaceWith(input);
        input.focus(); input.select();
        const commit = () => {
          n.label = input.value.trim() || n.label;
          markDirty("Ebene umbenannt");
          render(document.getElementById("app"));
        };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") render(document.getElementById("app")); });
        break;
      }
      case "toggle-hidden": {
        const n = findNode(el.dataset.id);
        n.hidden = !n.hidden;
        document.querySelectorAll(`[data-node="${n.id}"]`).forEach((x) => { x.style.display = n.hidden ? "none" : ""; });
        markDirty(n.hidden ? "Ebene ausgeblendet" : "Ebene eingeblendet");
        render(document.getElementById("app"));
        break;
      }
      case "toggle-lock": {
        const n = findNode(el.dataset.id);
        n.locked = !n.locked;
        markDirty(n.locked ? "Ebene gesperrt" : "Ebene entsperrt");
        render(document.getElementById("app"));
        break;
      }
      case "insp-tab": S.tab = el.dataset.tab; render(document.getElementById("app")); break;
      case "section": {
        const sec = S.sections.find((x) => x.id === el.dataset.id);
        if (sec) { sec.open = !sec.open; render(document.getElementById("app")); }
        break;
      }
      case "state": {
        S.state = el.dataset.state;
        previewState();
        render(document.getElementById("app"));
        break;
      }
      case "value":
      case "slider":
      case "quad": {
        const key = el.dataset.key;
        const f = S.sections.flatMap((s) => s.fields).find((x) => x.key === key);
        const val = el.value;
        if (S.state !== "base") {
          S.stateValues[S.state] = S.stateValues[S.state] || {};
          S.stateValues[S.state][key] = val;
        } else if (S.device !== "desktop") {
          S.deviceValues[key] = S.deviceValues[key] || {};
          S.deviceValues[key][S.device] = val;
        } else {
          S.values[key] = val;
        }
        S.styles[key] = { v: val, unit: f && f.unit };
        applyStyle(key, val, f && f.unit);
        syncField(key);
        markDirty(`${f ? f.label : key} geändert${S.state !== "base" ? ` (${STATE_LABEL[S.state]})` : S.device !== "desktop" ? ` (${DEVICES.find((d) => d.id === S.device).label})` : ""}`);
        break;
      }
      case "step": {
        const key = el.dataset.key;
        const f = S.sections.flatMap((s) => s.fields).find((x) => x.key === key);
        const dir = Number(el.dataset.dir);
        const cur = Number(fieldValue(f)) || 0;
        const next = String(Math.round((cur + dir * (f.unit === "em" ? 0.01 : 1)) * 100) / 100);
        S.values[key] = next;
        S.styles[key] = { v: next, unit: f.unit };
        applyStyle(key, next, f.unit);
        markDirty(`${f.label} ${dir > 0 ? "erhöht" : "verringert"}`);
        render(document.getElementById("app"));
        break;
      }
      case "reset": {
        const key = el.dataset.key;
        if (S.state !== "base" && S.stateValues[S.state]) delete S.stateValues[S.state][key];
        else if (S.device !== "desktop" && S.deviceValues[key]) delete S.deviceValues[key][S.device];
        else delete S.values[key];
        delete S.styles[key];
        const f = S.sections.flatMap((s) => s.fields).find((x) => x.key === key);
        markDirty(`${f ? f.label : key} zurückgesetzt`);
        render(document.getElementById("app"));
        break;
      }
      case "color": {
        const key = el.dataset.key;
        colorPopover(el, key);
        break;
      }
      case "insert-section": A().menu(el, ["Hero", "Leistungen", "Zitat", "CTA", "Footer"].map((label) => ({
        label, icon: "plus", onClick: () => {
          const id = "ins" + (S.inserted.length + 1);
          S.inserted.push({ id, label });
          const sec = { id, kind: "section", tag: "section", label, classes: "inserted", children: [] };
          S.tree.splice(S.tree.length - 1, 0, sec);
          S.selected = id;
          markDirty(`Sektion „${label}“ eingefügt`);
          render(document.getElementById("app"));
        },
      }))); break;
      case "duplicate": {
        const n = selectedNode();
        const clone = JSON.parse(JSON.stringify(n));
        clone.id = n.id + "-k" + Math.random().toString(36).slice(2, 5);
        clone.label = n.label + " (Kopie)";
        const parent = findParent(n.id);
        const list = parent ? parent.children : S.tree;
        list.splice(list.indexOf(n) + 1, 0, clone);
        if (!parent) S.inserted.push({ id: clone.id, label: clone.label });
        markDirty("Ebene dupliziert — ein Undo-Schritt");
        render(document.getElementById("app"));
        break;
      }
      case "delete": {
        const n = selectedNode();
        if (n.locked) { A().toast({ kind: "warning", title: "Ebene ist gesperrt", sub: "Erst entsperren — gesperrte Ebenen bleiben sichtbar und erklären." }); break; }
        const parent = findParent(n.id);
        const list = parent ? parent.children : S.tree;
        list.splice(list.indexOf(n), 1);
        const ins = S.inserted.findIndex((x) => x.id === n.id);
        if (ins >= 0) S.inserted.splice(ins, 1);
        else S.removed.push(n.id);
        S.selected = (list[0] || S.tree[0]).id;
        markDirty("Ebene gelöscht — ein Undo-Schritt");
        render(document.getElementById("app"));
        break;
      }
      case "move-up": case "move-down": {
        const n = selectedNode();
        const parent = findParent(n.id);
        const list = parent ? parent.children : S.tree;
        const i = list.indexOf(n);
        const j = name === "move-up" ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) break;
        list.splice(i, 1); list.splice(j, 0, n);
        markDirty("Reihenfolge geändert");
        render(document.getElementById("app"));
        break;
      }
      case "undo": A().toast({ kind: "info", title: "Rückgängig", sub: "Der letzte Zug wurde zurückgenommen — die History prüft Preconditions." }); break;
      case "redo": A().toast({ kind: "info", title: "Wiederholen", sub: "Kein Schritt zum Wiederholen." }); break;
      case "history": S.historyOpen = true; render(document.getElementById("app")); break;
      case "history-close": S.historyOpen = false; render(document.getElementById("app")); break;
      case "history-jump": A().toast({ kind: "info", title: "Stand geöffnet", sub: "Vorschau dieses Schritts — Schreiben erst mit „Übernehmen“ (ein Undo)." }); break;
      case "publish": A().publishFlow(); break;
      case "agent": S.agentOpen = !S.agentOpen; render(document.getElementById("app")); break;
      case "agent-close": S.agentOpen = false; render(document.getElementById("app")); break;
      case "agent-send": {
        const input = document.querySelector(".agent__foot input");
        if (!input || !input.value.trim()) break;
        const body = document.getElementById("agent-body");
        body.insertAdjacentHTML("beforeend", `<div class="msg msg--human"><span class="who">Du</span><span class="bubble">${esc(input.value)}</span></div>`);
        const q = input.value;
        input.value = "";
        body.insertAdjacentHTML("beforeend", `<div class="msg msg--agent" id="streaming"><span class="who">Agent</span><span class="bubble">Ich lese die Seite … <span class="cursor"></span></span></div>`);
        body.scrollTop = body.scrollHeight;
        setTimeout(() => {
          const st = document.getElementById("streaming");
          if (st) st.innerHTML = `<span class="who">Agent</span><span class="bubble">Verstanden. Ich habe die Anfrage als Schritt notiert und prüfe zuerst den Entwurf (keine Schreibzugriffe).</span>
            <div class="tool-card tool-card--done"><div class="head">${I("component", 13)}<span class="name">get_page</span><span class="status">fertig</span></div><div class="result">Entwurf v43, 214 Knoten</div></div>`;
          body.scrollTop = body.scrollHeight;
        }, 1400);
        break;
      }
      case "approve": {
        const box = el.closest(".approval");
        box.innerHTML = `<span class="t">Freigegeben</span><span class="d">Der Schritt läuft: 4 Instanzen, Entwurf v44. Ein Undo-Schritt.</span>
          <div class="tool-card tool-card--done"><div class="head">${I("component", 13)}<span class="name">update_component_instances</span><span class="status">fertig</span></div><div class="result">4 Instanzen auf v3 gehoben</div></div>`;
        A().toast({ kind: "success", title: "Schritt freigegeben", sub: "Der Agent schreibt in den Entwurf; der Release bleibt unverändert." });
        markDirty("Agent-Schritt freigegeben");
        break;
      }
      case "deny": {
        const box = el.closest(".approval");
        box.innerHTML = `<span class="t">Abgelehnt</span><span class="d">Der Agent sammelt den Schritt als Vorschlag und läuft ohne ihn weiter.</span>`;
        A().toast({ kind: "warning", title: "Schritt abgelehnt", sub: "Keine Änderung am Entwurf." });
        break;
      }
      case "revert-turn": {
        const msg = el.closest(".msg");
        msg.style.opacity = "0.45";
        el.disabled = true;
        el.textContent = "Zurückgenommen";
        A().toast({ kind: "success", title: "Antwort zurückgenommen", sub: "Ein Undo-Schritt; der Entwurf steht wieder auf v43." });
        markDirty("Agent-Antwort zurückgenommen");
        break;
      }
      case "node-menu": {
        const n = selectedNode();
        A().menu(el, [
          { label: "Umbenennen", icon: "text", keys: "F2" },
          { label: "Duplizieren", icon: "copy", keys: "Ctrl D", onClick: () => action("duplicate") },
          { label: "In Komponente umwandeln", icon: "component" },
          { sep: true },
          { label: n.hidden ? "Einblenden" : "Ausblenden", icon: "eye", onClick: () => action("toggle-hidden", { dataset: { id: n.id } }) },
          { label: "Löschen", icon: "trash", danger: true, onClick: () => action("delete") },
        ]);
        break;
      }
      case "state-menu": A().menu(el, STATES.map((s) => ({
        label: STATE_LABEL[s], icon: s === S.state ? "check" : "dot", onClick: () => { S.state = s; previewState(); render(document.getElementById("app")); },
      }))); break;
      case "device-menu": A().menu(el, DEVICES.map((d) => ({
        label: `${d.label} · ${d.w}`, icon: S.device === d.id ? "check" : d.icon, onClick: () => { S.device = d.id; if (S.solo) S.solo = d.id; render(document.getElementById("app")); },
      }))); break;
      case "show-all": A().toast({ kind: "info", title: "Alle Geräte", sub: "Drei Spalten mit Override-Signalen je Feld — im Prototyp als Modus angedeutet." }); break;
      case "open-property": A().toast({ kind: "info", title: "Eigenschaft hinzufügen", sub: "Freie Zeile: Property, Wert, Zustand, Gerät." }); break;
      case "motion-play": {
        const p = document.querySelector("[data-motion-preview]");
        p.classList.remove("play");
        void p.offsetWidth;
        p.classList.add("play");
        S.message = `Preset „${S.motion.preset}“ abgespielt (${S.motion.intensity}/10)`;
        const st = document.querySelector(".ed-status .msg");
        if (st) st.textContent = S.message;
        break;
      }
      case "motion-scrub": A().toast({ kind: "info", title: "Scrub", sub: "Regler bindet das Preset an die Scrollposition (Live-Modus)." }); break;
      case "motion-preset": S.motion.preset = el.value; S.message = `Preset ${el.value}`; render(document.getElementById("app")); break;
      case "motion-intensity": S.motion.intensity = el.value; render(document.getElementById("app")); break;
      case "component-edit": A().toast({ kind: "info", title: "Definition geöffnet", sub: "Doppelklick in eine Instanz öffnet den Master (Spotlight-Mode)." }); break;
      case "component-detach": A().toast({ kind: "warning", title: "Instanz gelöst", sub: "Tiefe Kopie mit frischen IDs — Overrides bleiben." }); break;
      case "plus": A().toast({ kind: "info", title: "Einfügen danach", sub: "Der Katalog öffnet sich an dieser Stelle." }); break;
      case "drag-grip": A().toast({ kind: "info", title: "Ziehen", sub: "Am Rahmen ziehen: imperativ bis zum Loslassen, dann ein kanonischer Commit." }); break;
      case "insp-close": A().toast({ kind: "info", title: "Inspektor geschlossen", sub: "Unter 760 px wird er zum Vollbild-Blatt mit Zurück-Knopf." }); break;
    }
  }

  function previewState() {
    document.querySelectorAll(`[data-node="${S.selected}"]`).forEach((el) => {
      el.style.outline = "";
      el.style.opacity = "";
      el.style.transform = "";
      if (S.state === "hover") el.style.opacity = "0.85";
      if (S.state === "focus") { el.style.outline = "2px solid var(--ui-focus)"; el.style.outlineOffset = "2px"; }
      if (S.state === "active") el.style.transform = "scale(0.98)";
      if (S.state === "disabled") el.style.opacity = "0.4";
    });
  }

  function colorPopover(anchor, key) {
    const tokens = ["ink-strong #111116", "ink #2e2e33", "muted #55545f", "line-control #75747f", "line-strong #ceced1", "track #eeedf4", "panel #ffffff"];
    const rect = anchor.getBoundingClientRect();
    A().menu({ getBoundingClientRect: () => ({ left: Math.max(8, rect.left - 120), bottom: rect.bottom, top: rect.bottom }) }, [
      ...tokens.map((t) => {
        const [name, hex] = t.split(" ");
        return { label: `${name}  ${hex}`, icon: "dot", onClick: () => {
          S.values[key] = hex;
          applyStyle(key, hex);
          markDirty("Farbe geändert");
          render(document.getElementById("app"));
        } };
      }),
      { sep: true },
      { label: "Deckkraft …", icon: "slider" },
      { label: "Eigene Farbe …", icon: "plus" },
    ]);
  }

  /* --------------------------------------------------------------- Ereignisse */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-eact]");
    if (!el) return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
    const name = el.dataset.eact;
    if (name === "rename" && e.detail < 2) { select(el.dataset.id); return; }
    e.preventDefault();
    e.stopPropagation();
    action(name, el, e);
  });

  document.addEventListener("input", (e) => {
    const el = e.target.closest('[data-eact="value"],[data-eact="slider"],[data-eact="quad"]');
    if (el) action(el.dataset.eact, el);
  });

  document.addEventListener("change", (e) => {
    const el = e.target.closest('select[data-eact]');
    if (el) action(el.dataset.eact, el);
  });

  document.addEventListener("dblclick", (e) => {
    const el = e.target.closest('[data-eact="rename"]');
    if (el) { e.preventDefault(); action("rename", el, e); }
  });

  document.addEventListener("keydown", (e) => {
    if (!document.querySelector(".ed")) return;
    if (e.key === "F2") {
      const el = document.querySelector(`.tree-row[aria-selected="true"] [data-eact="rename"]`);
      if (el) { e.preventDefault(); action("rename", el, { detail: 2 }); }
    }
    if (e.key === "Delete" && document.activeElement.tagName !== "INPUT") {
      action("delete");
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      action(e.shiftKey ? "redo" : "undo");
    }
  });

  window.SENIFY_EDITOR = { render, S };
})();
