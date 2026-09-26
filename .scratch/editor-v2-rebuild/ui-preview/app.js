/* =====================================================================
   Senify — Prototyp, Anwendungsschicht
   =====================================================================

   Router, Programm-Shell, Workspaces und Overlays. Der Editor liegt in
   `editor.js` (eigene Datei, eigenes Werkzeugprofil).

   Grundsätze aus dem Designsystem, die hier mechanisch gelten:
     * genau ein primärer Knopf je Ansicht
     * Limette nur als Aussage („hier zählt es jetzt“), nie als Zustand
     * jede Rückmeldung trägt einen Satz oder eine Zahl
     * Zustände sind eingebaut: leer, laden, Fehler, gesperrt
   ===================================================================== */

(() => {
  "use strict";

  const P = window.PROTO;
  const I = (n, s) => window.ICONS.get(n, s);

  /* ------------------------------------------------------------- Zustand */
  const S = {
    route: location.hash || "#/",
    mode: localStorage.getItem("senify-mode") || "light",
    reviewDone: false,
    refFilter: "Alle",
    refTab: "Übersicht",
    cmsCollection: null,
    cmsEntry: null,
    jobFilter: "Alle",
    settingsTab: "Site",
    mediaFilter: "Alle",
    mediaSelected: null,
    releases: P.releases.map((r) => ({ ...r })),
    jobs: P.jobs.map((j) => ({ ...j })),
    entries: JSON.parse(JSON.stringify(P.entries)),
  };

  /* ------------------------------------------------------------ Helfer */
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const statusChip = (status) => {
    const map = {
      published: ["success", "Veröffentlicht"],
      draft: ["", "Entwurf"],
      neu: ["", "Neu"],
      bestätigt: ["success", "Bestätigt"],
      offen: ["warning", "Offen"],
      done: ["success", "Fertig"],
      running: ["", "Läuft"],
      queued: ["warning", "Wartet"],
      failed: ["danger", "Fehlgeschlagen"],
    };
    const [kind, label] = map[status] || ["", status];
    return `<span class="chip chip--sm${kind ? " chip--" + kind : ""}">${esc(label)}</span>`;
  };

  const checkRow = (c) => `
    <div class="check-row check-row--${c.kind}">
      ${I(c.kind === "ok" ? "check" : c.kind === "warn" ? "alert" : "x", 14)}
      <span class="grow">${esc(c.label)}</span>
      <span class="note">${esc(c.note)}</span>
    </div>`;

  const jobRow = (j) => `
    <div class="job job--${j.status}">
      <span class="dot" aria-hidden="true"></span>
      <div>
        <div class="title">${esc(j.label)}</div>
        <div class="sub muted">${esc(j.detail)}${j.error ? ` — <span class="chip chip--sm chip--danger">${esc(j.error)}</span>` : ""}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${statusChip(j.status)}
        <span class="mono faint">${esc(j.at)}</span>
        ${j.status === "failed" ? `<button class="btn btn--sm" data-act="retry-job" data-id="${j.id}">${I("refresh", 13)} Erneut</button>` : ""}
        ${j.status === "queued" ? `<button class="btn btn--sm" data-act="cancel-job" data-id="${j.id}">Abbrechen</button>` : ""}
      </div>
    </div>`;

  const emptyState = (title, why, actionLabel, act) => `
    <div class="state">
      <h3>${esc(title)}</h3>
      <p>${esc(why)}</p>
      ${actionLabel ? `<button class="btn btn--secondary" data-act="${act}">${esc(actionLabel)}</button>` : ""}
    </div>`;

  /* ------------------------------------------------------------ Toasts */
  const toastsRoot = () => document.getElementById("toasts");
  function toast({ kind = "info", title, sub, sticky = false }) {
    const root = toastsRoot();
    while (root.children.length >= 3) root.firstElementChild.remove();
    const node = document.createElement("div");
    node.className = `toast toast--${kind}`;
    const icon = kind === "success" ? "check" : kind === "error" ? "alert" : kind === "warning" ? "alert" : "info";
    node.innerHTML = `${I(icon, 16)}<div class="grow"><div class="t">${esc(title)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}</div>
      <button class="close" aria-label="Schließen">${I("x", 14)}</button>`;
    node.querySelector(".close").addEventListener("click", () => node.remove());
    root.appendChild(node);
    if (!sticky && kind !== "error") setTimeout(() => node.remove(), 5000);
  }

  /* ---------------------------------------------------------- Overlays */
  const overlays = () => document.getElementById("overlays");

  function closeOverlay() {
    overlays().innerHTML = "";
    document.removeEventListener("keydown", onOverlayKey);
  }
  function onOverlayKey(e) {
    if (e.key === "Escape") { e.preventDefault(); closeOverlay(); }
  }
  function mountOverlay(html) {
    closeOverlay();
    overlays().innerHTML = html;
    document.addEventListener("keydown", onOverlayKey);
    return overlays().firstElementChild;
  }

  function dialog({ title, body, actions = [], width }) {
    const el = mountOverlay(`
      <div class="scrim scrim--center" data-scrim>
        <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${width ? `style="width:min(${width},100%)"` : ""}>
          <div class="dialog__head"><h2>${esc(title)}</h2>
            <button class="btn btn--icon btn--quiet" data-close aria-label="Schließen">${I("x", 16)}</button></div>
          <div class="dialog__body">${body}</div>
          ${actions.length ? `<div class="dialog__foot">
            ${actions.map((a, i) => `<button class="btn ${a.kind === "primary" ? "btn--primary" : a.kind === "danger" ? "btn--danger" : "btn--secondary"}" data-i="${i}">${esc(a.label)}</button>`).join("")}
          </div>` : ""}
        </div>
      </div>`);
    const scrim = el.matches("[data-scrim]") ? el : el.querySelector("[data-scrim]");
    const closeBtn = el.querySelector("[data-close]");
    closeBtn && closeBtn.addEventListener("click", closeOverlay);
    scrim && scrim.addEventListener("mousedown", (e) => { if (e.target === e.currentTarget) closeOverlay(); });
    el.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => {
      const a = actions[Number(b.dataset.i)];
      if (!a.keepOpen) closeOverlay();
      a.onClick && a.onClick();
    }));
    const focusable = el.querySelector("input, select, textarea, button");
    focusable && focusable.focus();
    return el;
  }

  function menu(anchor, items) {
    closeOverlay();
    const rect = anchor.getBoundingClientRect();
    const el = mountOverlay(`<div class="menu" role="menu" style="left:${Math.min(rect.left, innerWidth - 340)}px;top:${Math.min(rect.bottom + 4, innerHeight - items.length * 34 - 20)}px">
      ${items.map((it, i) => it.sep ? `<div class="menu__sep"></div>` : `
        <button class="menu__row${it.danger ? " menu__row--danger" : ""}" role="menuitem" data-i="${i}" ${it.disabled ? "disabled" : ""}>
          ${it.icon ? I(it.icon, 16) : "<span style='width:16px'></span>"}
          <span class="grow">${esc(it.label)}</span>
          ${it.keys ? `<span class="keys">${esc(it.keys)}</span>` : ""}
        </button>`).join("")}
    </div>`);
    el.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => {
      const it = items[Number(b.dataset.i)];
      closeOverlay();
      it.onClick && it.onClick();
    }));
    const off = (e) => { if (!el.contains(e.target)) { closeOverlay(); document.removeEventListener("mousedown", off); } };
    setTimeout(() => document.addEventListener("mousedown", off), 0);
  }

  function sheet({ title, body }) {
    const el = mountOverlay(`
      <div class="scrim" data-scrim style="padding:0;display:block">
        <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="position:fixed;left:auto;right:0;top:0;bottom:0;width:min(440px,100%)">
          <div class="sheet__head">
            <button class="btn btn--icon btn--quiet" data-close aria-label="Zurück">${I("arrowLeft", 16)}</button>
            <strong style="flex:1;font-size:var(--ui-text-15)">${esc(title)}</strong>
          </div>
          <div class="sheet__body">${body}</div>
        </div>
      </div>`);
    const closeBtn = el.querySelector("[data-close]");
    closeBtn && closeBtn.addEventListener("click", closeOverlay);
    return el;
  }

  /* ---------------------------------------------------------- Spotlight */
  const COMMANDS = [
    { group: "Gehe zu", label: "Start", dest: "Übersicht", icon: "home", route: "#/" },
    { group: "Gehe zu", label: "Seiten", dest: "5 Seiten", icon: "pages", route: "#/pages" },
    { group: "Gehe zu", label: "Editor", dest: "Home · Entwurf v43", icon: "editor", route: "#/editor" },
    { group: "Gehe zu", label: "CMS", dest: "3 Collections", icon: "cms", route: "#/cms" },
    { group: "Gehe zu", label: "Medien", dest: "8 Dateien", icon: "media", route: "#/media" },
    { group: "Gehe zu", label: "Referenzen", dest: "6 sichtbar · 71 Sammlungen", icon: "references", route: "#/references" },
    { group: "Gehe zu", label: "Prüfen", dest: "1 offene Prüfung", icon: "review", route: "#/review" },
    { group: "Gehe zu", label: "Releases", dest: "Release 12 aktiv", icon: "releases", route: "#/releases" },
    { group: "Gehe zu", label: "Aufträge", dest: "1 läuft, 1 wartet", icon: "jobs", route: "#/jobs" },
    { group: "Gehe zu", label: "Einstellungen", dest: "Profil, Theme, MCP", icon: "settings", route: "#/settings" },
    { group: "Aktion", label: "Seite veröffentlichen", dest: "Home", icon: "upload", run: () => publishFlow() },
    { group: "Aktion", label: "Neue Seite anlegen", dest: "", icon: "plus", run: () => newPageDialog() },
    { group: "Aktion", label: "Redesign-Paket öffnen", dest: "Leistungen", icon: "agent", route: "#/redesign" },
    { group: "Aktion", label: "Theme umschalten", dest: "Hell / Dunkel", icon: S.mode === "light" ? "moon" : "sun", run: () => setMode(S.mode === "light" ? "dark" : "light") },
    { group: "Zuletzt", label: "Home — Hero getauscht", dest: "Entwurf v43", icon: "clock", route: "#/editor" },
    { group: "Zuletzt", label: "Leistungen — Karten-Bindings", dest: "Prüfung 31", icon: "clock", route: "#/review" },
  ];

  function spotlight(query = "") {
    const q = query.trim().toLowerCase();
    const hits = COMMANDS.filter((c) => !q || (c.label + " " + c.dest).toLowerCase().includes(q));
    const groups = [...new Set(hits.map((h) => h.group))];
    const body = hits.length === 0
      ? emptyState(`Kein Treffer für „${query}“`, "Andere Schreibweise versuchen oder den Befehl über das Menü wählen.", "Suche leeren", "spotlight-clear")
      : groups.map((g) => `
          <div class="spotlight__group micro">${esc(g)}</div>
          ${hits.filter((h) => h.group === g).map((h) => `
            <div class="spotlight__row" role="option" tabindex="0" data-label="${esc(h.label)}" ${h.disabled ? 'aria-disabled="true"' : ""}>
              ${I(h.icon, 16)}
              <span class="grow">${esc(h.label)}</span>
              <span class="dest">${esc(h.dest)}</span>
            </div>`).join("")}`).join("");
    const el = mountOverlay(`
      <div class="scrim" data-scrim>
        <div class="spotlight" role="dialog" aria-modal="true" aria-label="Spotlight">
          <div class="spotlight__field">${I("search", 18)}
            <input id="spot-input" type="search" placeholder="Seiten, Befehle, Einstellungen …" value="${esc(query)}" autocomplete="off">
            <span class="kbd">Esc</span>
          </div>
          <div class="spotlight__list" id="spot-list">${body}</div>
        </div>
      </div>`);
    const scrim = el.matches("[data-scrim]") ? el : el.querySelector("[data-scrim]");
    scrim && scrim.addEventListener("mousedown", (e) => { if (e.target === e.currentTarget) closeOverlay(); });
    const input = el.querySelector("#spot-input");
    input.addEventListener("input", () => {
      const val = input.value;
      const pos = val.length;
      spotlight(val);
      const next = document.getElementById("spot-input");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });
    el.querySelectorAll(".spotlight__row").forEach((row) => {
      const open = () => {
        const cmd = COMMANDS.find((c) => c.label === row.dataset.label);
        closeOverlay();
        if (cmd.route) go(cmd.route);
        else cmd.run && cmd.run();
      };
      row.addEventListener("click", open);
      row.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    });
    input.focus();
  }

  /* ------------------------------------------------------------- Theme */
  function setMode(mode) {
    S.mode = mode;
    document.documentElement.setAttribute("data-mode", mode);
    localStorage.setItem("senify-mode", mode);
    const t = document.querySelector("[data-theme-toggle]");
    if (t) t.outerHTML = themeToggle();
  }
  const themeToggle = () => `
    <div class="theme-toggle" data-theme-toggle role="group" aria-label="Darstellung">
      <button class="opt" aria-pressed="${S.mode === "light"}" data-act="mode" data-mode="light">${I("sun", 14)}<span>Hell</span></button>
      <button class="opt" aria-pressed="${S.mode === "dark"}" data-act="mode" data-mode="dark">${I("moon", 14)}<span>Dunkel</span></button>
    </div>`;

  /* -------------------------------------------------------------- Router */
  function go(route) {
    if (location.hash === route) render();
    else location.hash = route;
  }

  function render() {
    S.route = location.hash || "#/";
    if (S.route.startsWith("#/editor")) {
      window.SENIFY_EDITOR.render(document.getElementById("app"));
    } else {
      document.getElementById("app").innerHTML = shell();
      const screen = document.querySelector("#screen");
      screen.innerHTML = SCREENS.render(S.route);
      afterRender();
    }
    window.scrollTo(0, 0);
  }

  /* --------------------------------------------------------------- Shell */
  const NAV = [
    { group: "Arbeiten", items: [
      { route: "#/", label: "Start", icon: "home" },
      { route: "#/pages", label: "Seiten", icon: "pages", count: P.pages.length },
      { route: "#/editor", label: "Editor", icon: "editor" },
    ] },
    { group: "Inhalte", items: [
      { route: "#/cms", label: "CMS", icon: "cms", count: P.collections.length },
      { route: "#/media", label: "Medien", icon: "media", count: P.assets.length },
      { route: "#/references", label: "Referenzen", icon: "references" },
    ] },
    { group: "Ausliefern", items: [
      { route: "#/review", label: "Prüfen", icon: "review", mark: !S.reviewDone },
      { route: "#/releases", label: "Releases", icon: "releases", count: S.releases.filter((r) => r.active).length },
      { route: "#/jobs", label: "Aufträge", icon: "jobs", count: S.jobs.filter((j) => j.status === "running" || j.status === "queued").length },
    ] },
    { group: "System", items: [
      { route: "#/settings", label: "Einstellungen", icon: "settings" },
      { route: "#/design", label: "Designsystem", icon: "design" },
    ] },
  ];

  function shell() {
    const nav = NAV.map((g) => `
      <div class="nav-group">
        <span class="nav-label micro">${esc(g.group)}</span>
        ${g.items.map((it) => `
          <a class="nav-row" href="${it.route}" ${isCurrent(it.route) ? 'aria-current="page"' : ""} title="${esc(it.label)}">
            ${I(it.icon, 18)}<span class="label">${esc(it.label)}</span>
            ${it.mark ? '<span class="mark" title="Offene Prüfung"></span>' : ""}
            ${it.count ? `<span class="count">${it.count}</span>` : ""}
          </a>`).join("")}
      </div>`).join("");

    return `
      <div class="shell">
        <nav class="nav" aria-label="Bereiche">
          <a class="brand" href="#/" style="text-decoration:none;color:inherit">
            <span class="brand-mark" aria-hidden="true">S</span>
            <span><span class="brand-name">Senify</span><br><span class="brand-sub">Lokaler Website-Builder</span></span>
          </a>
          <button class="site-switch" data-act="site-switch">
            <span class="site-avatar" aria-hidden="true">NW</span>
            <span class="grow"><span class="name">${esc(P.site.name)}</span><br><span class="sub">${esc(P.site.domain)} · Profil ${esc(P.site.profile)}</span></span>
            ${I("chevronDown", 14)}
          </button>
          ${nav}
          <div class="nav-foot">
            <div class="nav-agent">
              ${I("agent", 18)}
              <span class="grow"><span class="t">Agent verbunden</span><br><span class="s">MCP · 66 Tools · read/write</span></span>
              <span class="chip chip--sm chip--dot" style="color:var(--ui-signal-success)">Live</span>
            </div>
            ${themeToggle()}
          </div>
        </nav>
        <main class="main"><div class="main-inner" id="screen"></div></main>
      </div>`;
  }

  const isCurrent = (route) => S.route === route || (route !== "#/" && S.route.startsWith(route));

  /* ------------------------------------------------------------- Screens */
  const SCREENS = {
    render(route) {
      if (route.startsWith("#/pages")) return pagesScreen();
      if (route.startsWith("#/cms")) return cmsScreen(route);
      if (route.startsWith("#/submissions")) return submissionsScreen();
      if (route.startsWith("#/media")) return mediaScreen();
      if (route.startsWith("#/references")) return referencesScreen(route);
      if (route.startsWith("#/redesign")) return redesignScreen();
      if (route.startsWith("#/review")) return reviewScreen();
      if (route.startsWith("#/releases")) return releasesScreen();
      if (route.startsWith("#/jobs")) return jobsScreen();
      if (route.startsWith("#/settings")) return settingsScreen();
      if (route.startsWith("#/design")) return designScreen();
      return startScreen();
    },
  };

  /* --------------------------------------------------------------- Start */
  function startScreen() {
    const openReview = P.reviews[0];
    const active = S.releases.find((r) => r.active);
    return `
      <header class="page-head">
        <div>
          <h1>Start</h1>
          <p class="sub">Ein Projekt, fünf Seiten, ein Modell für Mensch und Agent. Was zuletzt passiert ist und was als Nächstes dran ist.</p>
        </div>
        <div class="actions">
          <button class="btn btn--secondary btn--product" data-act="spotlight">${I("search", 16)} Suchen <span class="kbd" style="margin-left:4px">Ctrl K</span></button>
          <button class="btn btn--primary btn--product" data-act="new-page">${I("plus", 16)} Seite bauen</button>
        </div>
      </header>

      <section class="section" style="margin-top:0">
        <div class="resume">
          <div class="resume-preview"><span class="mono faint">hero-desktop.webp · 1440×900</span></div>
          <div class="resume-body">
            <span class="micro">Weiterarbeiten</span>
            <h2>Home — Hero getauscht, CTA ergänzt</h2>
            <div class="resume-meta">
              ${statusChip("draft")}
              <span class="chip chip--sm">Entwurf v43</span>
              <span class="chip chip--sm">Zuletzt ${esc(P.site.updated)}</span>
              <span class="chip chip--sm">Von Mensch</span>
            </div>
            <p class="muted">Der Entwurf liegt über Release 12. Beim Veröffentlichen läuft die Prüfung (Struktur, Links, Alt-Texte, Parität).</p>
            <div class="resume-actions">
              <button class="btn btn--primary btn--product" data-act="open-editor">${I("editor", 16)} Im Editor öffnen</button>
              <button class="btn btn--secondary btn--product" data-act="preview">${I("external", 16)} Vorschau</button>
            </div>
          </div>
        </div>
      </section>

      <div class="facts" role="list">
        <span class="fact" role="listitem"><span class="n num">5</span><span class="l">Seiten</span></span>
        <span class="fact" role="listitem"><span class="n num">12</span><span class="l">Releases</span></span>
        <span class="fact" role="listitem"><span class="n num">1</span><span class="l">offene Prüfung</span></span>
        <span class="fact" role="listitem"><span class="n num">2</span><span class="l">Aufträge in Arbeit</span></span>
        <span class="fact" role="listitem"><span class="n num">66</span><span class="l">MCP-Tools</span></span>
      </div>

      <section class="section">
        <div class="section-head"><div><span class="micro">Ausliefern</span><h2>Offene Prüfung</h2></div>
          <button class="btn btn--quiet" data-act="open-review">Alle ansehen</button></div>
        <div class="card">
          <div class="card-head">
            <div>
              <div class="strong">Leistungen — Karten-Bindings</div>
              <div class="muted" style="font-size:var(--ui-text-13);margin-top:4px">${esc(openReview.summary)}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">${statusChip(S.reviewDone ? "done" : "offen")}<span class="mono faint">${esc(openReview.at)}</span></div>
          </div>
          <div class="check-list">${openReview.checks.map(checkRow).join("")}</div>
          <div style="display:flex;gap:8px;margin-top:16px">
            <button class="btn btn--primary btn--product" data-act="open-review">Prüfen</button>
            <button class="btn btn--secondary btn--product" data-act="preview">Vorschau</button>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><div><span class="micro">Betrieb</span><h2>Aufträge</h2></div>
          <button class="btn btn--quiet" data-act="open-jobs">Alle Aufträge</button></div>
        <div class="card card--flush"><div class="rows">${S.jobs.slice(0, 3).map(jobRow).join("")}</div></div>
      </section>

      <section class="section">
        <div class="section-head"><div><span class="micro">Ausliefern</span><h2>Releases</h2></div>
          <button class="btn btn--quiet" data-act="open-releases">Alle Releases</button></div>
        <div class="card card--flush">
          <table class="table">
            <thead><tr><th>Release</th><th>Notiz</th><th>Von</th><th>Stand</th></tr></thead>
            <tbody>
              ${S.releases.slice(0, 3).map((r) => `
                <tr data-act="open-releases">
                  <td><span class="strong">Release ${esc(r.n)}</span> <span class="faint">${esc(r.at)}</span></td>
                  <td class="muted">${esc(r.note)}</td>
                  <td class="muted">${esc(r.author)}</td>
                  <td>${r.active ? '<span class="chip chip--sm chip--success">Aktiv</span>' : '<span class="chip chip--sm">Archiv</span>'}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <p class="muted" style="margin-top:8px;font-size:var(--ui-text-13)">Aktiv ist Release ${esc(active ? active.n : "–")} — Parität: ${esc(active ? active.parity : "–")}.</p>
      </section>`;
  }

  /* --------------------------------------------------------------- Seiten */
  function pagesScreen() {
    return `
      <header class="page-head">
        <div>
          <h1>Seiten</h1>
          <p class="sub">Jede Seite ist ein Dokument mit eigenem Entwurf. Veröffentlichen läuft über ein Release, nie direkt an der Live-Seite vorbei.</p>
        </div>
        <div class="actions">
          <button class="btn btn--secondary btn--product" data-act="spotlight">${I("search", 16)} Suchen</button>
          <button class="btn btn--primary btn--product" data-act="new-page">${I("plus", 16)} Neue Seite</button>
        </div>
      </header>
      <div class="card card--flush">
        <table class="table">
          <thead><tr><th>Seite</th><th>Pfad</th><th>Stand</th><th>Version</th><th>Geändert</th><th></th></tr></thead>
          <tbody>
            ${P.pages.map((p) => `
              <tr data-act="open-editor">
                <td><div class="cell-main"><span class="strong">${esc(p.title)}</span>${p.dynamic ? '<span class="chip chip--sm">dynamisch</span>' : ""}</div></td>
                <td><span class="path">${esc(p.path)}</span></td>
                <td>${statusChip(p.status)}</td>
                <td class="mono faint">v${p.version}</td>
                <td class="muted">${esc(p.updated)} · ${esc(p.author)}</td>
                <td><button class="btn btn--sm" data-act="page-menu" aria-label="Mehr">${I("moreH", 14)}</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function newPageDialog() {
    dialog({
      title: "Neue Seite",
      body: `
        <label class="field-group"><span class="field-label">Titel</span>
          <span class="field"><input id="np-title" placeholder="z. B. Referenzen" autofocus></span></label>
        <label class="field-group"><span class="field-label">Pfad</span>
          <span class="field"><input id="np-path" placeholder="/referenzen"></span>
          <span class="field-hint">Wird aus dem Titel vorgeschlagen; änderbar.</span></label>
        <label class="field-group"><span class="field-label">Vorlage</span>
          <span class="field select-wrap"><select id="np-template" class="select">
            <option>Leer</option><option>Hero + Leistungen + CTA</option><option>Blog-Übersicht (Collection)</option><option>Kontakt mit Formular</option>
          </select></span></label>`,
      actions: [
        { label: "Abbrechen" },
        { label: "Anlegen", kind: "primary", onClick: () => toast({ kind: "success", title: "Seite angelegt", sub: "„Referenzen“ liegt als Entwurf bereit — im Editor öffnen." }) },
      ],
    });
  }

  /* ----------------------------------------------------------------- CMS */
  function cmsScreen(route) {
    const parts = route.replace("#/cms", "").split("/").filter(Boolean);
    if (parts.length === 0) {
      return `
        <header class="page-head">
          <div><h1>CMS</h1><p class="sub">Collections tragen Inhalte, Entries sind ihre Einträge. Jeder Eintrag hat Versionen; veröffentlichen schreibt eine neue.</p></div>
          <div class="actions"><button class="btn btn--primary btn--product" data-act="new-collection">${I("plus", 16)} Collection</button></div>
        </header>
        <div class="grid grid--3">
          ${P.collections.map((c) => `
            <a class="card" href="#/cms/${c.slug}" style="text-decoration:none;display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;align-items:center;gap:8px">${I("cms", 18)}<span class="strong" style="font-size:var(--ui-text-17)">${esc(c.name)}</span></div>
              <div class="muted" style="font-size:var(--ui-text-13)">${c.fields.length} Felder · ${c.entries} Einträge · ${c.published} veröffentlicht</div>
              <div style="display:flex;gap:4px;flex-wrap:wrap">${c.fields.slice(0, 4).map((f) => `<span class="chip chip--sm">${esc(f)}</span>`).join("")}</div>
            </a>`).join("")}
        </div>`;
    }
    const col = P.collections.find((c) => c.slug === parts[0]) || P.collections[0];
    const list = S.entries[col.id] || [];
    const entry = parts[1] ? list.find((e) => e.id === parts[1]) : null;
    if (entry) return entryScreen(col, entry);

    return `
      <nav class="breadcrumb"><a href="#/cms">CMS</a>${I("chevronRight", 12)}<span>${esc(col.name)}</span></nav>
      <header class="page-head">
        <div><h1>${esc(col.name)}</h1><p class="sub">${col.fields.length} Felder: ${esc(col.fields.join(", "))}. Versionen entstehen beim Veröffentlichen, Autosave schreibt in den Entwurf.</p></div>
        <div class="actions">
          <button class="btn btn--secondary btn--product" data-act="entry-fields">Felder bearbeiten</button>
          <button class="btn btn--primary btn--product" data-act="new-entry">${I("plus", 16)} Neuer Eintrag</button>
        </div>
      </header>
      <div class="card card--flush">
        <table class="table">
          <thead><tr><th>Titel</th><th>Slug</th><th>Datum</th><th>Kategorie</th><th>Stand</th><th></th></tr></thead>
          <tbody>
            ${list.map((e) => `
              <tr data-act="open-entry" data-col="${col.slug}" data-id="${e.id}">
                <td><span class="strong">${esc(e.title)}</span></td>
                <td><span class="path">${esc(e.slug)}</span></td>
                <td class="muted">${esc(e.date)} · ${esc(e.read)}</td>
                <td class="muted">${esc(e.category)}</td>
                <td>${statusChip(e.status)}</td>
                <td><button class="btn btn--sm" data-act="entry-menu" aria-label="Mehr">${I("moreH", 14)}</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function entryScreen(col, e) {
    return `
      <nav class="breadcrumb"><a href="#/cms">CMS</a>${I("chevronRight", 12)}<a href="#/cms/${col.slug}">${esc(col.name)}</a>${I("chevronRight", 12)}<span>${esc(e.title)}</span></nav>
      <header class="page-head">
        <div>
          <h1>${esc(e.title)}</h1>
          <p class="sub">Entwurf, zuletzt ${esc(e.updated)}. Autosave schreibt alle 2 s in den Entwurf; eine Version entsteht erst beim Veröffentlichen.</p>
        </div>
        <div class="actions">
          <span class="save-state"><span class="dot"></span>Gespeichert 14:26</span>
          <button class="btn btn--secondary btn--product" data-act="entry-preview">Vorschau</button>
          <button class="btn btn--primary btn--product" data-act="entry-publish">Veröffentlichen</button>
        </div>
      </header>
      <div class="settings-grid">
        <div class="card" style="display:flex;flex-direction:column;gap:16px">
          <label class="field-group"><span class="field-label">Titel</span><span class="field"><input value="${esc(e.title)}"></span></label>
          <label class="field-group"><span class="field-label">Slug</span><span class="field"><input value="${esc(e.slug)}"></span></label>
          <div class="grid grid--2">
            <label class="field-group"><span class="field-label">Datum</span><span class="field"><input value="${esc(e.date)}"></span></label>
            <label class="field-group"><span class="field-label">Lesezeit</span><span class="field"><input value="${esc(e.read)}"></span></label>
          </div>
          <label class="field-group"><span class="field-label">Kategorie</span>
            <span class="field select-wrap"><select class="select"><option>${esc(e.category)}</option><option>Freelance</option><option>Wissen</option><option>Tools</option></select></span></label>
          <label class="field-group"><span class="field-label">Bild</span>
            <span class="field" style="height:auto;padding:8px"><span class="mono faint">team-portrait.png · 1024×1024</span></span>
            <span class="field-hint">Aus Medien wählen; Alt-Text wird dort gepflegt.</span></label>
          <label class="field-group"><span class="field-label">Text</span>
            <span class="field" style="height:auto;padding:12px"><span class="muted">Lorem Ipsum ist der Standard-Dummy-Text der Druck- und Satzindustrie …</span></span></label>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <div class="card-head"><h3>Versionen</h3></div>
            <div class="history-list">
              <div class="history-item"><span class="time">25.07. 22:21</span><span class="grow">Veröffentlicht · v4</span></div>
              <div class="history-item"><span class="time">25.07. 22:20</span><span class="grow">Entwurf gespeichert</span></div>
              <div class="history-item"><span class="time">12.07. 10:05</span><span class="grow">Veröffentlicht · v3</span></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Verwendung</h3></div>
            <p class="muted" style="font-size:var(--ui-text-13)">Erscheint in der Liste auf <a href="#/editor">/blog</a> und als eigene Seite unter <span class="mono">/blog/${esc(e.slug)}</span>.</p>
            <button class="btn btn--secondary" style="margin-top:8px" data-act="preview">Detailseite ansehen</button>
          </div>
        </div>
      </div>`;
  }

  /* -------------------------------------------------------- Einsendungen */
  function submissionsScreen() {
    return `
      <nav class="breadcrumb"><a href="#/cms">CMS</a>${I("chevronRight", 12)}<span>Einsendungen</span></nav>
      <header class="page-head">
        <div><h1>Einsendungen</h1><p class="sub">Formulare schreiben Einsendungen als Einträge; jede trägt Formular, Zeitpunkt und Status. Benachrichtigungen laufen als Auftrag mit Wiederholung.</p></div>
        <div class="actions">
          <button class="btn btn--secondary btn--product" data-act="export">${I("download", 16)} CSV</button>
          <button class="btn btn--primary btn--product" data-act="submission-open">Öffnen</button>
        </div>
      </header>
      <div class="card card--flush">
        <table class="table">
          <thead><tr><th>Formular</th><th>Name</th><th>E-Mail</th><th>Nachricht</th><th>Zeit</th><th>Stand</th></tr></thead>
          <tbody>
            ${P.submissions.map((s) => `
              <tr data-act="submission-open">
                <td><span class="strong">${esc(s.form)}</span></td>
                <td>${esc(s.name)}</td>
                <td class="mono faint">${esc(s.email)}</td>
                <td class="muted">${esc(s.message)}</td>
                <td class="muted">${esc(s.at)}</td>
                <td>${statusChip(s.status)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="muted" style="margin-top:8px;font-size:var(--ui-text-13)">3 Einsendungen · 2 neu · Double-Opt-In für Newsletter aktiv.</p>`;
  }

  /* -------------------------------------------------------------- Medien */
  function mediaScreen() {
    const filters = ["Alle", "Ohne Alt-Text", "Projekte", "Marke"];
    let list = P.assets;
    if (S.mediaFilter === "Ohne Alt-Text") list = list.filter((a) => !a.alt);
    else if (S.mediaFilter !== "Alle") list = list.filter((a) => a.tag === S.mediaFilter);
    return `
      <header class="page-head">
        <div><h1>Medien</h1><p class="sub">Jede Datei trägt Alt-Text und Ordner. Fehlender Alt-Text ist eine Warnung, dekorative Bilder werden als solche markiert — dann greift die Prüfung nicht.</p></div>
        <div class="actions">
          <button class="btn btn--secondary btn--product" data-act="generate-image">${I("agent", 16)} Erzeugen</button>
          <button class="btn btn--primary btn--product" data-act="upload">${I("upload", 16)} Hochladen</button>
        </div>
      </header>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        ${filters.map((f) => `<button class="chip${S.mediaFilter === f ? " chip--selected" : ""}" data-act="media-filter" data-filter="${f}">${esc(f)}</button>`).join("")}
        <span class="muted" style="margin-left:auto;font-size:var(--ui-text-13)">${list.length} von ${P.assets.length} Dateien</span>
      </div>
      ${list.length === 0
        ? `<div class="card">${emptyState("Keine Datei in dieser Ansicht", "Der Filter „" + S.mediaFilter + "“ trifft auf keine Datei zu.", "Filter zurücksetzen", "media-filter-all")}</div>`
        : `<div class="asset-grid">
            ${list.map((a) => `
              <div class="asset" role="button" tabindex="0" data-act="asset-open" data-id="${a.id}">
                <div class="asset-thumb"><span class="ph">${esc(a.name)}<br>${a.w}×${a.h}</span></div>
                <div class="asset-meta">
                  <span class="name">${esc(a.name)}</span>
                  <span class="sub"><span>${a.kb} KB · ${esc(a.tag)}</span>${a.alt ? `<span class="chip chip--sm chip--success">Alt</span>` : `<span class="chip chip--sm chip--warning">Alt fehlt</span>`}</span>
                </div>
              </div>`).join("")}
          </div>`}`;
  }

  function assetDialog(a) {
    dialog({
      title: a.name,
      body: `
        <div class="grid grid--2">
          <div class="asset-thumb" style="border:1px solid var(--ui-line-hairline);border-radius:var(--ui-radius-md)"><span class="ph">${a.w}×${a.h}<br>${a.kb} KB</span></div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <label class="field-group"><span class="field-label">Alt-Text</span>
              <span class="field"><input value="${a.alt ? "Werkstatt mit Laptop auf dem Tisch" : ""}" placeholder="Was zeigt das Bild?"></span>
              ${a.alt ? "" : '<span class="field-hint">Fehlt. Veröffentlichen meldet das als Hinweis; dekorative Bilder stattdessen markieren.</span>'}</label>
            <label class="field-group"><span class="field-label">Ordner</span>
              <span class="field select-wrap"><select class="select"><option>${esc(a.tag)}</option><option>Bilder</option><option>Projekte</option><option>Marke</option></select></span></label>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span class="muted" style="font-size:var(--ui-text-13)">Dekorativ</span>
              <button class="switch" role="switch" aria-checked="false" data-act="toggle-switch"></button>
            </div>
          </div>
        </div>
        <div class="card card--tool">
          <div class="micro">Verwendung</div>
          <p class="muted" style="font-size:var(--ui-text-13);margin-top:4px">Home → Hero (img.hero-media) · Entwurf v43. Ersetzen behält URL und alle Verwendungen.</p>
        </div>`,
      actions: [
        { label: "In den Papierkorb", kind: "danger", onClick: () => toast({ kind: "warning", title: "In den Papierkorb gelegt", sub: "Referenzen werden beim Veröffentlichen als defekt gemeldet; Wiederherstellen möglich." }) },
        { label: "Ersetzen", onClick: () => toast({ kind: "success", title: "Datei ersetzt", sub: "URL und Metadaten bleiben; die vorige Datei liegt in der Historie." }) },
        { label: "Speichern", kind: "primary", onClick: () => toast({ kind: "success", title: "Alt-Text gespeichert", sub: "Die Prüfung „Alt-Texte“ ist wieder grün." }) },
      ],
    });
  }

  /* ---------------------------------------------------------- Referenzen */
  function referencesScreen(route) {
    const parts = route.replace("#/references", "").split("/").filter(Boolean);
    if (parts.length) return refDetail(parts[0]);
    const filters = ["Alle", ...P.refCollections.slice(1)];
    const list = S.refFilter === "Alle" ? P.references : P.references.filter((r) => r.collection === S.refFilter);
    return `
      <header class="page-head">
        <div><h1>Referenzen</h1><p class="sub">Vorbilder mit Vorschaubild, Dokumenten und Vokabular. Der Agent liest sie als Design-Quelle; „Redesign im Stil von …“ läuft über <span class="mono">plan_redesign</span>.</p></div>
        <div class="actions">
          <button class="btn btn--secondary btn--product" data-act="ref-import">${I("upload", 16)} Importieren</button>
          <button class="btn btn--primary btn--product" data-act="redesign">${I("agent", 16)} Redesign planen</button>
        </div>
      </header>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        ${filters.map((f) => `<button class="chip${S.refFilter === f ? " chip--selected" : ""}" data-act="ref-filter" data-filter="${f}">${esc(f)}</button>`).join("")}
        <span class="muted" style="margin-left:auto;font-size:var(--ui-text-13)">${list.length} von 726 Referenzen · 71 Sammlungen · 18 Stilfamilien</span>
      </div>
      <div class="ref-grid">
        ${list.map((r) => `
          <a class="ref-card" href="#/references/${r.id}">
            <div class="ref-hero"><span class="ph">hero-desktop · ${esc(r.url)}</span></div>
            <div class="ref-body">
              <span class="name strong">${esc(r.name)}</span>
              <span class="muted" style="font-size:var(--ui-text-12)">${esc(r.collection)} · ${esc(r.family)}</span>
              <span class="meta">${r.vocabulary.map((v) => `<span class="chip chip--sm">${esc(v)}</span>`).join("")}</span>
            </div>
          </a>`).join("")}
      </div>`;
  }

  function refDetail(id) {
    const r = P.references.find((x) => x.id === id) || P.references[0];
    const tabs = ["Übersicht", "Design.md", "Guidelines", "Komponenten"];
    const tabBody = {
      "Übersicht": `
        <dl class="kv">
          <dt>Familie</dt><dd>${esc(r.family)}</dd>
          <dt>Sammlung</dt><dd>${esc(r.collection)}</dd>
          <dt>Vokabular</dt><dd>${r.vocabulary.map((v) => `<span class="chip chip--sm">${esc(v)}</span>`).join(" ")}</dd>
          <dt>Quelle</dt><dd class="mono">${esc(r.url)}</dd>
          <dt>Dokumente</dt><dd>design.md · design-guidelines.md · design-components.md</dd>
          <dt>Bilder</dt><dd>hero-desktop.webp (1440×900) · hero-mobile.webp (390×780)</dd>
        </dl>`,
      "Design.md": `
        <div class="card card--tool" style="font-family:var(--ui-font-mono);font-size:var(--ui-text-12);line-height:1.7">
          # Design — ${esc(r.name)}<br><br>
          ## Colors<br>Base #111116 · Surface #ffffff · Muted #55545f · Accent (sparsam)<br><br>
          ## Type<br>Display 44/1.08 · Body 16/1.6 · Mono für Daten<br><br>
          ## Spacing<br>4/8/16/24/40/64 · Sektionen 96<br><br>
          ## Never<br>Keine Verläufe · keine Schatten als Hierarchie · ein Akzent
        </div>`,
      "Guidelines": `<div class="card card--tool" style="font-size:var(--ui-text-13);line-height:1.7">Komposition: ein Fokus je Sektion, ruhige Ränder, Bilder als Fläche. Bewegung: ein Auftritt, 240 ms, Reduced-Motion respektiert. Sprache: kurze Sätze, Handlung zuerst.</div>`,
      "Komponenten": `<div class="card card--tool" style="font-size:var(--ui-text-13);line-height:1.7">Hero (Text links, Bild rechts) · Karten-Reihe (3) · Zitat · CTA-Band · Footer. Alle als Section-Varianten im Katalog vorhanden.</div>`,
    }[S.refTab] || "";

    return `
      <nav class="breadcrumb"><a href="#/references">Referenzen</a>${I("chevronRight", 12)}<span>${esc(r.name)}</span></nav>
      <header class="page-head">
        <div><h1>${esc(r.name)}</h1><p class="sub">${esc(r.collection)} · ${esc(r.family)} · Quelle <span class="mono">${esc(r.url)}</span></p></div>
        <div class="actions">
          <button class="btn btn--secondary btn--product" data-act="ref-analyze">${I("refresh", 16)} Neu analysieren</button>
          <button class="btn btn--primary btn--product" data-act="redesign">Redesign planen</button>
        </div>
      </header>
      <div class="grid grid--2" style="align-items:start">
        <div class="card card--flush">
          <div class="ref-hero" style="aspect-ratio:16/9"><span class="ph">hero-desktop.webp · 1440×900</span></div>
          <div style="padding:16px">
            <div class="ed-tabs" style="height:auto;border:0;padding:0;margin-bottom:12px">
              ${tabs.map((t) => `<button class="ed-tab" aria-selected="${S.refTab === t}" data-act="ref-tab" data-tab="${t}">${esc(t)}</button>`).join("")}
            </div>
            ${tabBody}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <div class="card-head"><h3>Als Vorbild anwenden</h3></div>
            <p class="muted" style="font-size:var(--ui-text-13)">Leitet einen Theme-Entwurf ab (Skalen, Schrift, Bewegung) und prüft die Gegenprobe. Der aktive Release bleibt unverändert.</p>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button class="btn btn--secondary" data-act="apply-reference">Theme ableiten</button>
              <button class="btn btn--quiet" data-act="redesign">Paket ansehen</button>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Zuweisung</h3></div>
            <p class="muted" style="font-size:var(--ui-text-13)">Zugeordnet zu <strong>Nick Webdesign</strong> für die Skalen Farbe und Typografie.</p>
          </div>
        </div>
      </div>`;
  }

  function redesignScreen() {
    const dirs = [
      { name: "Richtung A — Raster und Ruhe", refs: "Syntiq", thesis: "Schweizer Raster, ein Fokus je Sektion, Zahlen als Ordnung.", carry: "Raster, Mono für Daten", invent: "Zahlen-Band", risk: "kühl" },
      { name: "Richtung B — Block und Kante", refs: "Mondrian Blocks", thesis: "Große Blöcke, harte Kanten, ein Rot als Aussage.", carry: "Blockraster", invent: "überlappende Karten", risk: "laut" },
      { name: "Richtung C — Editorial und Luft", refs: "The Cobb Hotel", thesis: "Serifen-Titel, viel Luft, Fotografie führt.", carry: "Typo-Kontrast", invent: "Zitat-Sektion", risk: "textlastig" },
    ];
    return `
      <nav class="breadcrumb"><a href="#/references">Referenzen</a>${I("chevronRight", 12)}<span>Redesign-Paket</span></nav>
      <header class="page-head">
        <div><h1>Redesign-Paket</h1><p class="sub">„Leistungen“ im Stil von Syntiq und Mondrian Blocks. Das Paket ist ein Plan: Sektions-Mapping, Token-Delta, Risiken — es ändert nichts am aktiven Release.</p></div>
        <div class="actions">
          <button class="btn btn--secondary btn--product" data-act="redesign-reroll">${I("refresh", 16)} Andere Richtungen</button>
          <button class="btn btn--primary btn--product" data-act="redesign-apply">Als Draft anlegen</button>
        </div>
      </header>
      <div class="grid grid--3">
        ${dirs.map((d, i) => `
          <div class="card" style="display:flex;flex-direction:column;gap:8px">
            <span class="micro">${i === 0 ? '<span class="chip chip--sm chip--accent">Empfohlen</span>' : ""}</span>
            <h3 style="font-size:var(--ui-text-17)">${esc(d.name)}</h3>
            <p class="muted" style="font-size:var(--ui-text-13)">${esc(d.thesis)}</p>
            <dl class="kv" style="grid-template-columns:110px 1fr;font-size:var(--ui-text-12)">
              <dt>Vorbilder</dt><dd>${esc(d.refs)}</dd>
              <dt>Übernehmen</dt><dd>${esc(d.carry)}</dd>
              <dt>Neu erfinden</dt><dd>${esc(d.invent)}</dd>
              <dt>Risiko</dt><dd>${esc(d.risk)}</dd>
            </dl>
            <button class="btn btn--secondary" style="margin-top:auto" data-act="redesign-apply">Diese Richtung</button>
          </div>`).join("")}
      </div>
      <section class="section">
        <div class="section-head"><div><span class="micro">Beweis</span><h2>Gegenprobe und Schrittfolge</h2></div></div>
        <div class="grid grid--2">
          <div class="card">
            <div class="card-head"><h3>Token-Delta</h3></div>
            <div class="token-scale" style="margin-bottom:8px">${P.tokenScales.color.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
            <p class="muted" style="font-size:var(--ui-text-13)">Farbe: neutrale Leiter bleibt, Akzent wandert von Limette auf Tinte. Typo: Display 44 → 40, Body 16 → 17. Bewegung: 240 ms bleibt.</p>
          </div>
          <div class="card">
            <div class="card-head"><h3>Schrittfolge</h3></div>
            <ol class="muted" style="font-size:var(--ui-text-13);margin:0;padding-left:18px;line-height:1.8">
              <li>Entwurf duplizieren (Seite bleibt unberührt)</li>
              <li>Theme-Patch schreiben (Draft)</li>
              <li>Sektionen ersetzen, je Richtung ein Undo</li>
              <li>Vorschau und Review-Diff prüfen</li>
            </ol>
          </div>
        </div>
      </section>`;
  }

  /* --------------------------------------------------------------- Prüfen */
  function reviewScreen() {
    const r = P.reviews[0];
    return `
      <header class="page-head">
        <div><h1>Prüfen</h1><p class="sub">Ein Review zeigt den Struktur-Diff gegen den aktiven Release, die Checks und die Vorschau. Freigeben macht den Entwurf release-fähig.</p></div>
        <div class="actions">
          <button class="btn btn--secondary btn--product" data-act="preview">${I("external", 16)} Vorschau</button>
          <button class="btn btn--primary btn--product" data-act="review-approve" ${S.reviewDone ? "disabled" : ""}>${S.reviewDone ? "Freigegeben" : "Freigeben"}</button>
        </div>
      </header>
      <div class="grid grid--2" style="align-items:start">
        <div class="card">
          <div class="card-head">
            <div><div class="strong">${esc(r.page)} — ${esc(r.summary)}</div>
              <div class="muted" style="font-size:var(--ui-text-13);margin-top:4px">Von ${esc(r.author)} · ${esc(r.at)}</div></div>
            ${statusChip(S.reviewDone ? "done" : "offen")}
          </div>
          <div class="diff">
            <div class="diff-row" style="background:var(--ui-surface-track)"><span class="sign faint">–</span><span class="micro">Vorher (Release 12)</span><span class="sign faint">+</span><span class="micro">Nachher (Entwurf v43)</span></div>
            ${r.diff.map((d) => `
              <div class="diff-row diff-row--${d.kind}">
                <span class="sign">${d.kind === "del" ? "−" : d.kind === "add" ? "+" : ""}</span>
                <span>${esc(d.before)}</span>
                <span class="sign">${d.kind === "add" ? "+" : d.kind === "del" ? "−" : ""}</span>
                <span>${esc(d.after)}</span>
              </div>`).join("")}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <div class="card-head"><h3>Checks</h3><span class="muted" style="font-size:var(--ui-text-12)">1 Hinweis</span></div>
            <div class="check-list">${r.checks.map(checkRow).join("")}</div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Kommentare</h3></div>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div><div class="micro">Agent · ${esc(r.at)}</div><p class="muted" style="font-size:var(--ui-text-13)">Karten nutzen jetzt Bindings; Reihenfolge folgt dem Feld „Reihenfolge“.</p></div>
              <label class="field-group"><span class="field-label">Antwort</span>
                <span class="field" style="height:auto;padding:10px"><input placeholder="Anmerkung zur Prüfung …"></span></label>
              <div style="display:flex;gap:8px">
                <button class="btn btn--secondary" data-act="review-changes">Änderungen anfordern</button>
                <button class="btn btn--quiet" data-act="toast-note">Notiz speichern</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------- Releases */
  function releasesScreen() {
    return `
      <header class="page-head">
        <div><h1>Releases</h1><p class="sub">Ein Release ist ein unveränderlicher Stand: Seiten-Revisionen, Theme-Snapshot und Build-Referenz. Aktivieren ist atomar, Rollback legt ein neues Release aus dem alten Stand an.</p></div>
        <div class="actions"><button class="btn btn--primary btn--product" data-act="publish-flow">${I("upload", 16)} Veröffentlichen</button></div>
      </header>
      <div class="card card--flush">
        <table class="table">
          <thead><tr><th>Release</th><th>Notiz</th><th>Seiten</th><th>Von</th><th>Parität</th><th></th></tr></thead>
          <tbody>
            ${S.releases.map((r) => `
              <tr>
                <td><span class="strong">Release ${esc(r.n)}</span> <span class="faint">${esc(r.at)}</span></td>
                <td class="muted">${esc(r.note)}</td>
                <td class="mono faint">${r.pages}</td>
                <td class="muted">${esc(r.author)}</td>
                <td class="muted" style="font-size:var(--ui-text-12)">${esc(r.parity)}</td>
                <td>
                  ${r.active
                    ? '<span class="chip chip--sm chip--success">Aktiv</span>'
                    : `<button class="btn btn--sm" data-act="release-menu" data-id="${r.id}">${I("moreH", 14)} Aktionen</button>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="muted" style="margin-top:8px;font-size:var(--ui-text-13)">4 Releases · 1 aktiv · Rollback möglich, solange der Build-Ordner liegt.</p>`;
  }

  /* -------------------------------------------------------------- Aufträge */
  function jobsScreen() {
    const filters = ["Alle", "Läuft", "Fehlgeschlagen"];
    let list = S.jobs;
    if (S.jobFilter === "Läuft") list = list.filter((j) => j.status === "running" || j.status === "queued");
    if (S.jobFilter === "Fehlgeschlagen") list = list.filter((j) => j.status === "failed");
    return `
      <header class="page-head">
        <div><h1>Aufträge</h1><p class="sub">Re-Bakes und Bild-Jobs laufen durabel: Claim mit Lease, Wiederholung mit Backoff, Status sichtbar. Ein fehlgeschlagener Auftrag nennt den Grund.</p></div>
        <div class="actions"><button class="btn btn--secondary btn--product" data-act="toast-note">${I("refresh", 16)} Aktualisieren</button></div>
      </header>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        ${filters.map((f) => `<button class="chip${S.jobFilter === f ? " chip--selected" : ""}" data-act="job-filter" data-filter="${f}">${esc(f)}</button>`).join("")}
      </div>
      <div class="card card--flush">
        ${list.length === 0
          ? emptyState("Kein Auftrag in dieser Ansicht", "Der Filter „" + S.jobFilter + "“ trifft auf keinen Auftrag zu. Zuletzt lief alles durch.", "Alle anzeigen", "job-filter-all")
          : `<div class="rows">${list.map(jobRow).join("")}</div>`}
      </div>
      <section class="section">
        <div class="section-head"><div><span class="micro">Zustände</span><h2>Wie Aufträge melden</h2></div></div>
        <div class="grid grid--3">
          <div class="card card--tool"><div class="micro">Läuft</div><p class="muted" style="font-size:var(--ui-text-13);margin-top:6px">Punkt pulsiert, Versuche sichtbar, Abbrechen erst nach der Lease.</p></div>
          <div class="card card--tool"><div class="micro">Fehlgeschlagen</div><p class="muted" style="font-size:var(--ui-text-13);margin-top:6px">Grund im Klartext plus „Erneut“; nach 3 Versuchen bleibt er stehen.</p></div>
          <div class="card card--tool"><div class="micro">Wartet</div><p class="muted" style="font-size:var(--ui-text-13);margin-top:6px">Wartet auf die geteilte GPU oder den nächsten Lease-Lauf.</p></div>
        </div>
      </section>`;
  }

  /* ----------------------------------------------------------- Einstellungen */
  function settingsScreen() {
    const tabs = ["Site", "Theme", "Domains", "Agent & MCP", "Sicherung"];
    const body = {
      Site: `
        <div class="card" style="display:flex;flex-direction:column;gap:16px">
          <div class="grid grid--2">
            <label class="field-group"><span class="field-label">Name</span><span class="field"><input value="${esc(P.site.name)}"></span></label>
            <label class="field-group"><span class="field-label">Slug</span><span class="field"><input value="${esc(P.site.slug)}"></span></label>
          </div>
          <div>
            <span class="field-label">Profil</span>
            <div class="profile-list">
              ${[["clean", "Wenige Effekte. Lenis aus, keine Pins, kein 3D. Für Text- und Vertrauensseiten."],
                 ["standard", "Standard: Lenis an, bis zu 7 Presets, ein Pin, kein 3D."],
                 ["showcase", "Volle Bewegung: bis 10 Presets, Pins, 3D-Szene (1× je Seite)."]]
                .map(([id, d]) => `
                  <div class="profile-opt" role="radio" aria-checked="${P.site.profile === id}" data-act="profile" data-id="${id}">
                    <span class="radio" aria-hidden="true"></span>
                    <span><span class="t strong">${esc(id)}</span><br><span class="d">${esc(d)}</span></span>
                  </div>`).join("")}
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end"><button class="btn btn--primary" data-act="settings-save">Speichern</button></div>
        </div>`,
      Theme: `
        <div class="card" style="display:flex;flex-direction:column;gap:16px">
          <div><span class="field-label">Farbskala</span><div class="token-scale">${P.tokenScales.color.map((c) => `<span style="background:${c}"></span>`).join("")}</div></div>
          <div><span class="field-label">Akzent (eine Aussage)</span><div class="token-scale" style="max-width:80px">${P.tokenScales.lime.map((c) => `<span style="background:${c}"></span>`).join("")}</div></div>
          <div><span class="field-label">Schriftgrade</span><div style="display:flex;gap:12px;align-items:baseline">${P.tokenScales.type.map((t) => `<span class="mono faint">${t}</span>`).join("")}</div></div>
          <div><span class="field-label">Bewegung</span><div style="display:flex;gap:8px">${P.tokenScales.motion.map((m) => `<span class="chip chip--sm">${m}</span>`).join("")}</div></div>
          <div style="display:flex;gap:8px"><button class="btn btn--secondary" data-act="apply-reference">Aus Referenz ableiten</button><button class="btn btn--quiet" data-act="toast-note">Modi prüfen</button></div>
        </div>`,
      Domains: `
        <div class="card card--flush">
          <table class="table">
            <thead><tr><th>Domain</th><th>Stand</th><th>TLS</th><th></th></tr></thead>
            <tbody>
              <tr><td class="mono">${esc(P.site.domain)}</td><td><span class="chip chip--sm chip--success">Verbunden</span></td><td class="muted">gültig bis 12/2026</td><td><button class="btn btn--sm" data-act="toast-note">Verwalten</button></td></tr>
              <tr><td class="mono">www.${esc(P.site.domain)}</td><td><span class="chip chip--sm">Weiterleitung</span></td><td class="muted">—</td><td><button class="btn btn--sm" data-act="toast-note">Verwalten</button></td></tr>
            </tbody>
          </table>
        </div>`,
      "Agent & MCP": `
        <div class="card card--flush">
          <table class="table">
            <thead><tr><th>Token</th><th>Art</th><th>Scopes</th><th>Zuletzt</th><th></th></tr></thead>
            <tbody>
              <tr><td class="mono">agent-workbench</td><td>Agent</td><td><span class="chip chip--sm">read</span> <span class="chip chip--sm">write</span></td><td class="muted">vor 3 Min</td><td><button class="btn btn--sm" data-act="toast-note">Widerrufen</button></td></tr>
              <tr><td class="mono">programm-shell</td><td>Mensch</td><td><span class="chip chip--sm">read</span> <span class="chip chip--sm">write</span> <span class="chip chip--sm">publish</span></td><td class="muted">jetzt</td><td></td></tr>
            </tbody>
          </table>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="card-head"><h3>Audit</h3><span class="muted" style="font-size:var(--ui-text-12)">jede Schreibaktion, mit Herkunft</span></div>
          <div class="history-list">
            ${P.audit.map((a) => `
              <div class="history-item" style="cursor:default">
                <span class="time">${esc(a.at)}</span>
                <span class="grow"><span class="mono">${esc(a.action)}</span> — ${esc(a.detail)}</span>
                <span class="chip chip--sm">${esc(a.actor)}</span>
              </div>`).join("")}
          </div>
        </div>`,
      Sicherung: `
        <div class="card" style="display:flex;flex-direction:column;gap:12px">
          <p class="muted" style="font-size:var(--ui-text-13)">Sicherungen liegen lokal: Datenbank-Dump, Assets und Build-Ordner mit Manifest (Prüfsummen). Wiederherstellen läuft über das Programm.</p>
          <div class="check-list">
            ${[["ok", "Letzte Sicherung", "Heute, 03:00 · 412 MB"], ["ok", "Wiederherstellung", "zuletzt geprüft am 20.09."], ["warn", "Aufbewahrung", "14 Tage · ältere werden rotiert"]].map(([k, l, n]) => checkRow({ kind: k, label: l, note: n })).join("")}
          </div>
          <div><button class="btn btn--secondary" data-act="backup-now">Jetzt sichern</button></div>
        </div>`,
    }[S.settingsTab];

    return `
      <header class="page-head">
        <div><h1>Einstellungen</h1><p class="sub">Profil, Theme, Domains, Agenten-Token und Sicherung — alles am Projekt, nichts global versteckt.</p></div>
      </header>
      <div class="ed-tabs" style="height:auto;border-bottom:1px solid var(--ui-line);margin-bottom:24px;padding:0">
        ${tabs.map((t) => `<button class="ed-tab" style="height:36px" aria-selected="${S.settingsTab === t}" data-act="settings-tab" data-tab="${t}">${esc(t)}</button>`).join("")}
      </div>
      ${body}`;
  }

  /* ---------------------------------------------------------- Designsystem */
  function designScreen() {
    const changes = [
      ["Farben", "Eine Schicht statt vier Sätze", "Die Vorschau nutzt `senify.css` (--ui-*). Hell ist der Grundzustand, dunkel ist dieselbe Leiter invertiert — vorher gab es nur Dunkel (Tiefwasser) und drei weitere Sätze."],
      ["Limette", "Eine Aussage, ein Ort", "Limette erscheint nur noch als „hier zählt es jetzt“ (Akzent-Chip, aktive Stufe, Einrastlinie). Nicht mehr als Reiterkante, Fokusring, Auswahlrahmen oder Plus-Punkt."],
      ["Fokus", "Ring in Tinte", "Der Fokusring ist die Tinte (höchster Kontrast in beiden Modi) — nicht der Akzent. WCAG 2.4.11 bleibt erfüllt."],
      ["Auswahl", "Zweite Fläche statt Farbstich", "Ausgewählte Zeilen und Reiter füllen mit der zweiten Fläche (Tinte, im Dunklen fast weiß) — kein zusätzlicher Blauton."],
      ["Knöpfe", "Ein primärer Knopf je Ansicht", "Pro Ansicht genau eine gefüllte Handlung; alles andere sekundär oder still. Vorher standen mehrere laute Knöpfe nebeneinander."],
      ["Radius", "Werkzeug eckig, Produkt rund", "Shell und Workspaces: 32/48/Pille. Editor: 0/4/8. Die offene Entscheidung aus dem Designsystem ist damit im Prototyp entschieden und sichtbar."],
      ["Felder", "Gefüllt, nicht umrandet", "Felder liegen als eingelassene Fläche; die Kante kommt nur, wo die Füllung die Grenze nicht trägt (Feld im Feld, Zelle im Raster)."],
      ["Inspektor", "Zweispaltig + Suche", "Eigenschaftszeilen zweispaltig (doppelt so viele sichtbar), Abschnitte als Aufklapper mit Zähler, Zustands- und Geräteumschaltung je Feld."],
      ["Zustände", "Vollständig entworfen", "Hover, Fokus, gedrückt, ausgewählt, gesperrt, wartend, Fehler, leer — im Prototyp überall anfassbar statt nur beschrieben."],
      ["Barrierefreiheit", "Nachgerechnet und verdrahtet", "Kontrastpaare per Skript geprüft; Dialoge mit role/aria-modal, Toasts als aria-live, Ladezustände mit aria-busy, Trefferflächen ≥ 24 px."],
      ["Agent", "Im Editor zuhause", "Chat mit Werkzeug-Karten, Freigabe-Karte für sensible Schritte, Undo je Antwort — plus Review-Diff, den die Vorbilder nicht haben (Recherche 22.09.)."],
      ["Aufbau", "Kompletter Prototyp", "Shell, Editor und Workspaces in einer Datei; die alte Komponenten-Schau liegt unverändert in `styleguide.html`."],
    ];
    return `
      <header class="page-head">
        <div><h1>Designsystem & Änderungen</h1><p class="sub">Der Prototyp folgt <span class="mono">design-system/DESIGN-SYSTEM.md</span> und <span class="mono">senify.css</span>. Hier steht, was gegenüber dem alten Stand geändert wurde — jede Zeile mit Grund.</p></div>
        <div class="actions">
          <a class="btn btn--secondary btn--product" href="styleguide.html">${I("external", 16)} Komponenten-Schau</a>
          <button class="btn btn--primary btn--product" data-act="mode" data-mode="${S.mode === "light" ? "dark" : "light"}">${I(S.mode === "light" ? "moon" : "sun", 16)} ${S.mode === "light" ? "Dunkel ansehen" : "Hell ansehen"}</button>
        </div>
      </header>
      <div class="card card--flush">
        <div class="rows">
          ${changes.map(([area, what, why]) => `
            <div class="row-item" style="cursor:default;align-items:flex-start">
              <span class="chip chip--sm" style="flex:none">${esc(area)}</span>
              <span class="grow">
                <span class="title strong">${esc(what)}</span>
                <div class="muted" style="font-size:var(--ui-text-13);margin-top:4px;max-width:80ch">${esc(why)}</div>
              </span>
            </div>`).join("")}
        </div>
      </div>
      <section class="section">
        <div class="section-head"><div><span class="micro">Regeln</span><h2>Die kurze Fassung</h2></div></div>
        <div class="grid grid--3">
          ${[["Höhe", "Fläche plus 1 px Kante; Schatten nur für schwebende Platten. Keine Verläufe."],
             ["Akzent", "Limette = „hier zählt es jetzt“. Ein lauter Knopf je Ansicht."],
             ["Rückmeldung", "Jede Meldung trägt einen Satz oder eine Zahl. Keine Attrappen."],
             ["Maß", "4-px-Takt; Werkzeug 24–48, Produkt 44–72; Trefferfläche ≥ 24."],
             ["Bewegung", "Werkzeug unter 300 ms; 1200 ms gehört dem Inhalt (Design/Live)."],
             ["Sprache", "Deutsch mit englischen Fachbegriffen; Knöpfe benennen die Handlung."]]
            .map(([t, d]) => `<div class="card card--tool"><div class="micro">${esc(t)}</div><p class="muted" style="font-size:var(--ui-text-13);margin-top:6px">${esc(d)}</p></div>`).join("")}
        </div>
      </section>`;
  }

  /* -------------------------------------------------------- Veröffentlichen */
  function publishFlow() {
    const checks = P.publishChecks;
    dialog({
      title: "Veröffentlichen",
      body: `
        <div class="publish-steps">
          <div class="publish-step publish-step--done"><span class="num">${I("check", 12)}</span><span class="grow"><span class="t">Prüfen</span><br><span class="d">6 Checks, 1 Hinweis (Kontrast)</span></span></div>
          <div class="publish-step publish-step--active"><span class="num">2</span><span class="grow"><span class="t">Release bauen</span><br><span class="d">5 Seiten, Theme-Snapshot, Prüfsumme — als durabler Auftrag</span></span></div>
          <div class="publish-step"><span class="num">3</span><span class="grow"><span class="t">Aktivieren</span><br><span class="d">Atomar; der vorige Stand bleibt als Release 12</span></span></div>
        </div>
        <div class="card card--tool">
          <div class="micro">Prüfung</div>
          <div class="check-list" style="margin-top:8px">${checks.map(checkRow).join("")}</div>
        </div>
        <label class="field-group"><span class="field-label">Notiz (erscheint im Release)</span>
          <span class="field"><input placeholder="Was ist neu?"></span></label>`,
      actions: [
        { label: "Abbrechen" },
        { label: "Veröffentlichen", kind: "primary", onClick: () => {
          toast({ kind: "success", title: "Release 13 gebaut", sub: "5 Seiten aktiv. Rollback auf Release 12 möglich." });
          S.releases.forEach((r) => { r.active = false; });
          S.releases.unshift({ id: "r13", n: "13", at: "jetzt", author: "Mensch", note: "Aus dem Editor veröffentlicht", pages: 5, active: true, parity: "wird berechnet …" });
          if (S.route.startsWith("#/releases") || S.route === "#/") render();
        } },
      ],
    });
  }

  /* ------------------------------------------------------------ After-Render */
  function afterRender() {
    /* Fokus für die Suche im Spotlight ist schon gesetzt. */
  }

  /* -------------------------------------------------------------- Aktionen */
  const ACTIONS = {
    "spotlight": () => spotlight(),
    "spotlight-clear": () => spotlight(""),
    "mode": (el) => setMode(el.dataset.mode),
    "open-editor": () => go("#/editor"),
    "open-review": () => go("#/review"),
    "open-jobs": () => go("#/jobs"),
    "open-releases": () => go("#/releases"),
    "preview": () => toast({ kind: "info", title: "Vorschau geöffnet", sub: "Signierter Link, 30 Tage gültig — öffnet in einem neuen Tab." }),
    "new-page": () => newPageDialog(),
    "new-collection": () => toast({ kind: "info", title: "Collection-Builder", sub: "Im Prototyp als Dialog angedeutet: Felder anlegen, Typen wählen, Status-Vorlage." }),
    "new-entry": () => toast({ kind: "info", title: "Neuer Eintrag", sub: "Legt einen Entwurf in der Collection an — im Editor-Fenster bearbeitbar." }),
    "entry-fields": () => toast({ kind: "info", title: "Felder bearbeiten", sub: "Der Collection-Builder öffnet sich (Prototyp: angedeutet)." }),
    "open-entry": (el) => go(`#/cms/${el.dataset.col}/${el.dataset.id}`),
    "entry-publish": () => toast({ kind: "success", title: "Eintrag veröffentlicht", sub: "Version v5 geschrieben; betroffene Routen werden neu gebacken." }),
    "entry-preview": () => toast({ kind: "info", title: "Vorschau", sub: "Detailseite mit Entwurfsstand." }),
    "entry-menu": (el, ev) => menu(el, [
      { label: "Öffnen", icon: "editor" },
      { label: "Duplizieren", icon: "copy" },
      { label: "Versionen", icon: "clock" },
      { sep: true },
      { label: "In den Papierkorb", icon: "trash", danger: true, onClick: () => toast({ kind: "warning", title: "Eintrag im Papierkorb", sub: "Wiederherstellbar; die Route fällt aus dem nächsten Bake." }) },
    ]),
    "page-menu": (el) => menu(el, [
      { label: "Im Editor öffnen", icon: "editor", onClick: () => go("#/editor") },
      { label: "Vorschau", icon: "external", onClick: () => toast({ kind: "info", title: "Vorschau geöffnet", sub: "Signierter Link." }) },
      { label: "Umbenennen", icon: "text", keys: "F2" },
      { sep: true },
      { label: "Löschen", icon: "trash", danger: true, onClick: () => toast({ kind: "warning", title: "Seite gelöscht", sub: "Aus dem Release entfernt; wiederherstellbar aus der Revision." }) },
    ]),
    "release-menu": (el) => menu(el, [
      { label: "Rollback auf diesen Stand", icon: "undo", onClick: () => dialog({
          title: "Rollback",
          body: `<p class="muted" style="font-size:var(--ui-text-15)">Legt ein neues Release aus dem Stand von Release ${el.closest("tr").querySelector("strong").textContent.replace("Release ", "")} an. Nichts wird überschrieben; die Historie bleibt.</p>`,
          actions: [{ label: "Abbrechen" }, { label: "Rollback", kind: "danger", onClick: () => toast({ kind: "success", title: "Rollback gebaut", sub: "Der Stand ist aktiv; das vorige Release bleibt im Archiv." }) }],
        }) },
      { label: "Vorschau", icon: "external", onClick: () => toast({ kind: "info", title: "Vorschau geöffnet", sub: "Stand dieses Releases." }) },
      { label: "Manifest ansehen", icon: "pages" },
    ]),
    "publish-flow": () => publishFlow(),
    "retry-job": (el) => { const j = S.jobs.find((x) => x.id === el.dataset.id); if (j) { j.status = "running"; j.error = null; render(); toast({ kind: "info", title: "Auftrag erneut gestartet", sub: "Versuch 2 von 3." }); } },
    "cancel-job": (el) => { const j = S.jobs.find((x) => x.id === el.dataset.id); if (j) { j.status = "done"; j.detail = "Abgebrochen (wartend)"; render(); toast({ kind: "info", title: "Auftrag abgebrochen", sub: "Nur wartende Aufträge lassen sich sauber abbrechen." }); } },
    "job-filter": (el) => { S.jobFilter = el.dataset.filter; render(); },
    "job-filter-all": () => { S.jobFilter = "Alle"; render(); },
    "media-filter": (el) => { S.mediaFilter = el.dataset.filter; render(); },
    "media-filter-all": () => { S.mediaFilter = "Alle"; render(); },
    "asset-open": (el) => { const a = P.assets.find((x) => x.id === el.dataset.id); a && assetDialog(a); },
    "upload": () => toast({ kind: "info", title: "Hochladen", sub: "Dateien wählen — Varianten (AVIF/WebP) entstehen automatisch." }),
    "generate-image": () => dialog({
      title: "Bild erzeugen",
      body: `
        <label class="field-group"><span class="field-label">Motiv</span><span class="field" style="height:auto;padding:10px"><input placeholder="z. B. Werkstatt, warmes Licht, Nahaufnahme"></span></label>
        <div class="grid grid--2">
          <label class="field-group"><span class="field-label">Format</span><span class="field select-wrap"><select class="select"><option>1536×1024 (3:2)</option><option>1024×1024</option><option>390×780 (Mobil)</option></select></span></label>
          <label class="field-group"><span class="field-label">Provider</span><span class="field select-wrap"><select class="select"><option>image-use (ChatGPT)</option><option>ComfyUI (lokal)</option><option>custom</option></select></span></label>
        </div>
        <p class="field-hint">Jobs laufen im Hintergrund; der Status erscheint unter Aufträge.</p>`,
      actions: [{ label: "Abbrechen" }, { label: "Erzeugen", kind: "primary", onClick: () => toast({ kind: "info", title: "Bild-Job angelegt", sub: "Fortschritt unter Aufträge; Ergebnis landet in Medien." }) }],
    }),
    "export": () => toast({ kind: "success", title: "CSV erzeugt", sub: "3 Einsendungen exportiert." }),
    "submission-open": () => toast({ kind: "info", title: "Einsendung geöffnet", sub: "Volltext, Felder und Antwort-Auftrag." }),
    "ref-filter": (el) => { S.refFilter = el.dataset.filter; render(); },
    "ref-tab": (el) => { S.refTab = el.dataset.tab; render(); },
    "ref-import": () => toast({ kind: "info", title: "Import", sub: "Ordner wählen: info.md, design*.md, hero-*.png werden zugeordnet." }),
    "ref-analyze": () => toast({ kind: "info", title: "Analyse gestartet", sub: "Aufnahme, Extraktion, Profil — Ergebnis in wenigen Minuten." }),
    "apply-reference": () => toast({ kind: "success", title: "Theme-Entwurf abgeleitet", sub: "Skalen geprüft (Gegenprobe bestanden). Schreiben erst mit „Übernehmen“ im Editor." }),
    "redesign": () => go("#/redesign"),
    "redesign-reroll": () => toast({ kind: "info", title: "Neue Richtungen", sub: "Andere Vorbilder gewählt; der Plan wird neu berechnet." }),
    "redesign-apply": () => dialog({
      title: "Als Draft anlegen",
      body: `<p class="muted" style="font-size:var(--ui-text-15)">Legt eine neue Draft-Revision der Seite an, schreibt den Theme-Patch als Draft und ersetzt die Sektionen. Der aktive Release bleibt unverändert. Ein Undo je Richtung.</p>`,
      actions: [{ label: "Abbrechen" }, { label: "Anlegen", kind: "primary", onClick: () => toast({ kind: "success", title: "Draft angelegt", sub: "Entwurf v44 mit Richtung A — im Editor prüfbar." }) }],
    }),
    "review-approve": () => { S.reviewDone = true; render(); toast({ kind: "success", title: "Prüfung freigegeben", sub: "Der Entwurf ist release-fähig; veröffentlichen baut Release 13." }); },
    "review-changes": () => dialog({
      title: "Änderungen anfordern",
      body: `<label class="field-group"><span class="field-label">Was soll anders werden?</span>
        <span class="field" style="height:auto;padding:10px"><input placeholder="z. B. Karten-Abstand auf 24 px"></span></label>`,
      actions: [{ label: "Abbrechen" }, { label: "Senden", kind: "primary", onClick: () => toast({ kind: "info", title: "An den Agenten gesendet", sub: "Der Lauf nimmt die Anmerkung als nächsten Schritt." }) }],
    }),
    "settings-tab": (el) => { S.settingsTab = el.dataset.tab; render(); },
    "profile": (el) => { P.site.profile = el.dataset.id; render(); toast({ kind: "success", title: `Profil ${el.dataset.id} gesetzt`, sub: "Guardrails greifen sofort: Presets, Pins, 3D." }); },
    "settings-save": () => toast({ kind: "success", title: "Gespeichert", sub: "Projekt-Einstellungen aktualisiert." }),
    "backup-now": () => toast({ kind: "info", title: "Sicherung läuft", sub: "Dump, Assets und Builds mit Manifest." }),
    "site-switch": (el) => menu(el, [
      { label: "Nick Webdesign", icon: "check" },
      { label: "Studio Sommer", icon: "box" },
      { sep: true },
      { label: "Neues Projekt", icon: "plus", onClick: () => toast({ kind: "info", title: "Neues Projekt", sub: "Name, Slug, Profil — anlegen im Programm." }) },
    ]),
    "toggle-switch": (el) => el.setAttribute("aria-checked", el.getAttribute("aria-checked") === "true" ? "false" : "true"),
    "toast-note": () => toast({ kind: "info", title: "Notiz", sub: "Im Prototyp ohne Funktion — die echten Wege stehen in der Liste oben." }),
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(el, e); }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); spotlight(); }
  });

  window.addEventListener("hashchange", render);

  /* ---------------------------------------------------------- Ausgänge */
  window.SENIFY_APP = { toast, dialog, menu, sheet, go, spotlight, publishFlow, setMode, esc, render };

  /* ------------------------------------------------------------------ Start */
  document.documentElement.setAttribute("data-mode", S.mode);
  render();
})();
