// Die Buehne des Seiten-Editors (R12).
//
// `mountCanvasView` stand in `app-editor.js` und ist unveraendert hierher
// gewandert: es baut die drei Spalten und haengt Canvas, Inspektor, Explorer,
// Elemente-Panel, Spotlight, Konflikt-Dialog und Live-Kanal an EINE Session -
// dieser Aufbau ist eine Closure, kein Satz unabhaengiger Funktionen.
//
// Was hier NICHT liegt: alles, was ohne Canvas und ohne Auswahl zu entscheiden
// ist. Speicher-Status, Konflikt-Dialog, Bau-Protokoll, Live-Regeln, Agent-
// Vorschau, Panel-Umschalter, Werkzeug-Overflow und Redesign-Inbox sind eigene
// Module (`app-editor-*.js`); diese Datei haengt sie zusammen.

import { AUTHOR, MUTATION_LABELS, api, askText, el, failed, toast } from "./app-core.js";
import { createAgentPreview } from "./app-editor-agent-preview.js";
import { createBakeStatus } from "./app-editor-bake-status.js";
import { createConflictDialog } from "./app-editor-conflict-dialog.js";
import { createPanelToggle } from "./app-editor-panel-toggle.js";
import {
  isOwnEvent as isOwnEventFromPayload,
  parseEngineEvent,
} from "./app-editor-live-events.js";
import { saveControls, saveStatusText } from "./app-editor-save-status.js";
import {
  draftChangedDecision,
  nodesToFlash,
  pageCreatedDecision,
} from "./app-editor-live-sync.js";
import { createProtocolLog } from "./app-editor-protocol.js";
import { createRedesignInbox } from "./app-editor-redesign-inbox.js";
import { createToolbarOverflow } from "./app-editor-toolbar-overflow.js";
import { openRedesignDirectionDialog } from "./app-import.js";
import { openFramerImportDialog } from "./app-framer-import.js";
import { createVariablesPanel } from "./app-variables.js";

// The open SSE channel of the active canvas view (ticket 05): a route change
// closes it before the next view subscribes, so streams do not stack up.
let activeLiveStream = null;
let activeToolbarMenuCleanup = null;

export async function mountCanvasView({ pageId, siteId, page, host, toolbar, editor, pagesCache, mediaCache, libraryComponents, assetContext, siteProfile, siteBreakpoints, siteTheme, siteThemeVersion, styleRules, styleRegistryVersion }) {
  const loaded = editor.loadDocument(page.draft, { styleRules: styleRules ?? [] });

  // Drei Spalten: Elemente/Einstellungen, Arbeitsflaeche (Canvas) und Struktur
  // (Tickets 02/03). Alle drei lesen denselben Store — die Auswahl im Canvas
  // ist die Auswahl in beiden Panels, eine Aenderung erscheint ueberall.
  const explorerHost = el("aside", { class: "canvas-view__explorer" });
  const canvasHost = el("div", { class: "canvas-view__stage" });
  // Links wechseln sich Elemente und Einstellungen ab (E5), rechts bleibt der
  // Explorer mit den Ebenen.
  const elementsHost = el("div", { class: "canvas-view__elements", role: "tabpanel", "aria-label": "Elemente" });
  const inspectorHost = el("div", { class: "canvas-view__inspector", role: "tabpanel", "aria-label": "Bearbeiten" });
  const variablesHost = el("div", { class: "canvas-view__variables", role: "tabpanel", "aria-label": "Variablen" });
  const sideTabs = el("div", { class: "canvas-view__sidebar-tabs", role: "tablist", "aria-label": "Editorbereiche" });
  const sidePanels = { elements: elementsHost, inspector: inspectorHost, variables: variablesHost };
  let activeSide = "elements";
  const showSidePanel = (name) => {
    if (name === "layers") {
      // Der Struktur-Explorer steht in der rechten Spalte und ist immer sichtbar;
      // der Reiter setzt nur den Fokus dorthin.
      explorerHost.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      for (const button of sideTabs.querySelectorAll("[role=tab]")) {
        button.setAttribute("aria-selected", String(button.dataset.panel === name));
      }
      return;
    }
    activeSide = name === "settings" ? "inspector" : name;
    for (const [key, panel] of Object.entries(sidePanels)) panel.hidden = key !== activeSide;
    for (const button of sideTabs.querySelectorAll("[role=tab]")) {
      button.setAttribute(
        "aria-selected",
        String(button.dataset.panel === activeSide),
      );
    }
  };
  for (const [key, label] of [
    ["elements", "Elemente"],
    ["layers", "Explorer"],
    ["inspector", "Bearbeiten"],
    ["variables", "Variablen"],
  ]) {
    const button = el("button", {
      type: "button",
      role: "tab",
      text: label,
      "data-panel": key,
      "aria-selected": String(key === "elements"),
    });
    button.addEventListener("click", () => showSidePanel(key));
    sideTabs.appendChild(button);
  }
  const sideHost = el("aside", { class: "canvas-view__side" }, sideTabs, elementsHost, inspectorHost, variablesHost);
  host.classList.add("canvas-view");
  host.replaceChildren(sideHost, canvasHost, explorerHost);

  const statusEl = el("span", { class: "muted", "data-role": "canvas-status" });
  const statusGroup = el(
    "div",
    { class: "toolbar__status", "aria-live": "polite", "aria-atomic": "true" },
    statusEl,
  );
  // Re-Bake-Status (E12) liegt in `app-editor-bake-status.js` (R12): eine
  // Abfrage, eine Zeile. Ein Hinweis, kein Blocker.
  const bakeStatus = createBakeStatus({
    el,
    fetchJobs: () => api(`/api/sites/${siteId}/bake-jobs`),
  });
  statusGroup.append(bakeStatus.element);
  void bakeStatus.refresh();
  const publishButton = el("button", {
    type: "button",
    class: "primary",
    "data-action": "canvas-publish",
    text: "Veröffentlichen",
  });
  const saveButton = el("button", {
    type: "button",
    class: "ghost",
    "data-action": "canvas-save",
    text: "Speichern",
  });
  saveButton.disabled = true;
  // Conflict hint (decided 18.09.): reload the draft or resend the own change.
  const reloadButton = el("button", {
    type: "button",
    "data-action": "canvas-reload",
    text: "Neu laden",
  });
  const retryButton = el("button", {
    type: "button",
    "data-action": "canvas-retry",
    text: "Erneut versuchen",
  });
  reloadButton.hidden = true;
  retryButton.hidden = true;

  const setVersion = (version) => {
    const badge = document.getElementById("page-version");
    if (badge) badge.textContent = `Draft v${version}`;
  };

  // The save pipeline owns batching, version tracking and conflict handling;
  // the transport is the same `api` helper the rest of the shell uses, so a
  // `409` keeps its status.
  const transport = async (request) => {
    try {
      const body = await api(request.path, {
        method: request.method,
        ...(request.body === undefined ? {} : { body: request.body }),
      });
      return { status: 200, body };
    } catch (error) {
      return {
        status: typeof error?.status === "number" ? error.status : 500,
        // Feld und aktuelle Serverversion gehoeren zum Konflikt: ohne sie
        // landet jede Registry- oder Theme-Kollision im Seiten-Dialog.
        body: {
          error: {
            message: error?.message ?? String(error),
            ...(error?.field === undefined ? {} : { field: error.field }),
            ...(error?.currentVersion === undefined ? {} : { currentVersion: error.currentVersion }),
            ...(error?.category === undefined ? {} : { category: error.category }),
            ...(error?.suggestion === undefined ? {} : { suggestion: error.suggestion }),
          },
        },
      };
    }
  };

  // Ein Session-Kern (E5 Scheibe 1): Dokument + Auswahl + History + Server-
  // version + Pending in einem Objekt. Canvas und Inspektor sind Projektionen
  // derselben Session; der Ansichtszustand (Geraet, Tab, Zoom, Auswahl)
  // ueberlebt das Neuladen ueber den lokalen Speicher.
  const storage = {
    get: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Ein privates Fenster verweigert den Schreibzugriff; der Editor laeuft weiter.
      }
    },
  };
  const session = editor.createEditorSession({
    document: loaded.document,
    pageId,
    siteId,
    author: AUTHOR,
    request: transport,
    initialVersion: page.draftVersion,
    styleRegistryVersion,
    ...(typeof siteThemeVersion === "number" ? { themeVersion: siteThemeVersion } : {}),
    storage,
  });
  const savedUi = session.ui();

  // Was die Zeile sagt und welche Knoepfe gelten, rechnet
  // `app-editor-save-status.js` (R12). Hier bleibt nur das Schreiben ins DOM.
  const applyState = (state) => {
    const controls = saveControls(state);
    saveButton.disabled = controls.saveDisabled;
    saveButton.textContent = controls.saveLabel;
    reloadButton.hidden = !controls.conflict;
    retryButton.hidden = !controls.conflict;
    statusEl.textContent = saveStatusText(state);
    syncConflictDialog(editor.conflictDialogModel(state));
  };

  // Konflikt-Dialog (L17) liegt in `app-editor-conflict-dialog.js` (R12):
  // ein Dialog je Konfliktlage, Texte aus `conflictDialogModel`. Die zwei
  // Wege bleiben hier, weil sie Session und Dokument anfassen.
  const reloadDraft = async () => {
    try {
      // Ein laufender Save gehoert zum alten Stand; erst abwarten, dann laden.
      if (session.saveState().status === "saving") {
        statusEl.textContent = "Der Editor speichert noch.";
        return;
      }
      const beforeDocument = session.document;
      const [fresh, registry, theme] = await Promise.all([
        api(`/api/pages/${pageId}`),
        api(`/api/sites/${encodeURIComponent(siteId)}/style-rules`),
        api(`/api/sites/${encodeURIComponent(siteId)}/theme`),
      ]);
      // Waehrend des Ladens kann der Nutzer weitergearbeitet haben. Dann ist
      // der Serverstand nicht mehr die Antwort auf seine Frage: nichts ersetzen.
      if (session.document !== beforeDocument) {
        statusEl.textContent = "Der Editorstand hat sich während des Ladens geändert.";
        return;
      }
      // Erst den Konflikt loesen, dann die frischen Versionen annehmen: der
      // Pipeline-Guard laesst waehrend eines Konflikts keine neue Version zu.
      session.discardPending();
      session.replaceDocument(
        editor.loadDocument(fresh.draft, { styleRules: registry.rules }).document,
        fresh.draftVersion,
        registry.version,
      );
      // Auch die Variablen sind Teil des Serverstands: nach einem Konflikt
      // traegt die naechste Seitenaenderung sonst eine veraltete
      // baseThemeVersion und faellt sofort wieder auf 409.
      session.acceptThemeVersion(theme.version);
      siteTheme = theme.theme;
      siteThemeVersion = theme.version;
      canvas.setTheme(theme.theme, theme.css);
      inspector.setTheme(theme.theme);
      variablesPanel?.setTheme(theme.theme, theme.version);
      setVersion(fresh.draftVersion);
      statusEl.textContent = "Neu geladen";
    } catch (error) {
      failed(error);
    }
  };
  const retrySave = async () => {
    try {
      const fresh = await api(`/api/pages/${pageId}`);
      await session.retry(fresh.draftVersion);
    } catch (error) {
      failed(error);
    }
  };
  const conflictDialog = createConflictDialog({
    el,
    host,
    onReload: () => void reloadDraft(),
    onRetry: () => void retrySave(),
  });
  const syncConflictDialog = (model) => conflictDialog.sync(model);
  session.subscribe(() => {
    const state = session.saveState();
    setVersion(state.version);
    applyState(state);
  });
  applyState(session.saveState());

  const canvas = editor.mountCanvas(canvasHost, {
    store: session.store,
    session,
    registry: editor.createRegistry(),
    renderer: editor.createReactRenderer({
      context: () => ({
        pagePaths: Object.fromEntries(pagesCache.map((entry) => [entry.id, entry.path])),
        assets: assetContext,
      }),
    }),
    theme: siteTheme ?? editor.defaultTheme(),
    frameStyles: [
      `/api/sites/${encodeURIComponent(siteId)}/theme.css?v=${encodeURIComponent(siteThemeVersion ?? 0)}`,
      // Die Raster-Schwellen der Sektionen folgen dem Paar der Site
      // (ADR-0020). Ohne den Parameter zeigte der Canvas das Raster des
      // Standardpaars, das Release das der Site - und das
      // Paritaets-Tor faellt genau darueber.
      siteBreakpoints
        ? `/editor-frame.css?bp=${encodeURIComponent(`${siteBreakpoints.tablet}-${siteBreakpoints.mobile}`)}`
        : "/editor-frame.css",
    ],
    zoom: savedUi.zoom,
    // Design/Live (Ticket 03 Punkt 6): live zeigt die echte Seite (M4 Stufe 1).
    mode: savedUi.mode,
    breakpoint: savedUi.device,
    breakpoints: siteBreakpoints,
    profile: siteProfile ?? "standard",
    onState: (state) => {
      session.patchUi({
        zoom: state.zoom,
        selectedId: state.selected,
        mode: state.mode,
        device: state.breakpoint,
      });
    },
    onMessage: (message) => {
      statusEl.textContent = message ?? "";
    },
    // E8: Geräte und Verlauf stehen in der Workspace-Leiste, nicht im Canvas.
    toolbar: "external",
  });
  // Geräte und Verlauf stehen in der Workspace-Leiste, direkt hinter dem Pfad.
  toolbar.insertBefore(canvas.toolbar, toolbar.querySelector(".spacer"));
  // Die beiden Seitenpanels lassen sich zuklappen (E8). Der Umschalter liegt
  // in `app-editor-panel-toggle.js` (R12): ein Attribut am Host, ein Knopf,
  // kein Bezug auf Auswahl oder Dokument.
  const sideToggle = createPanelToggle({ el, host, attribute: "side", label: "Elemente" });
  const explorerToggle = createPanelToggle({
    el,
    host,
    attribute: "explorer",
    label: "Struktur",
  });
  toolbar.insertBefore(sideToggle.element, canvas.toolbar);
  toolbar.insertBefore(explorerToggle.element, toolbar.querySelector("#page-version"));
  // Start im Einpassen-Zoom: der Frame ist sofort ganz sichtbar (Framer/Webflow).
  // Ein bewusst gesetzter Zoom bleibt nach dem Neuladen erhalten; nur der
  // Standardzoom (100 %) wird eingepasst. Der Fit läuft erst, wenn jeder Frame
  // gerendert ist: ein Fit vor dem Laden der Iframes verlor in den
  // Browser-Tests die Klick-Selektion (Ursache offen).
  if (canvas.mode() === "design" && savedUi.zoom === 1) {
    const fitWhenRendered = (attempt) => {
      const frames = [...canvasHost.querySelectorAll(".senify-canvas__iframe")];
      const rendered =
        frames.length > 0 &&
        frames.every((frame) => frame.contentDocument?.querySelector("[data-node-id]") != null);
      if (rendered) {
        canvas.fit();
        canvasHost.dataset.startFit = "done";
      } else if (attempt < 100) {
        setTimeout(() => fitWhenRendered(attempt + 1), 50);
      } else {
        canvasHost.dataset.startFit = "skipped";
      }
    };
    fitWhenRendered(0);
  } else {
    canvasHost.dataset.startFit = "skipped";
  }
  const framerImportButton = el("button", {
    type: "button",
    class: "ghost",
    text: "Seite importieren",
    "data-action": "framer-import-open",
  });
  // Redesign-Inbox (ADR-0012) liegt in `app-editor-redesign-inbox.js` (R12):
  // Abruf, Zaehlung und Takt ohne Bezug auf Canvas oder Auswahl. Der Knopf ist
  // ein HINWEIS - er oeffnet nichts von selbst und stiehlt keinen Fokus.
  const redesignInbox = createRedesignInbox({
    el,
    fetchProposals: async () => {
      const listed = await api(`/api/pages/${pageId}/redesign-proposals`);
      return Array.isArray(listed.proposals) ? listed.proposals : [];
    },
    onOpen: (proposal) => openRedesignDirectionDialog(proposal),
    setInterval: (handler, ms) => window.setInterval(handler, ms),
    clearInterval: (handle) => window.clearInterval(handle),
  });
  const stopRedesignPolling = () => redesignInbox.stop();
  redesignInbox.start();
  framerImportButton.addEventListener("click", () => {
    openFramerImportDialog({
      siteId,
      pageId,
      session,
      onImported: async (report) => {
        if (report.pageId === pageId) {
          const fresh = await api(`/api/pages/${pageId}`);
          session.replaceDocument(editor.loadDocument(fresh.draft, { styleRules: session.document.styleRules }).document, fresh.draftVersion);
          session.discardPending();
          setVersion(fresh.draftVersion);
          statusEl.textContent = "Framer-Import übernommen";
        } else if (report.pageId !== null) {
          location.hash = `#/projects/${siteId}/pages/${report.pageId}`;
        }
        toast("Framer-Import übernommen");
      },
    });
  });

  // Die Session ist die eine Quelle (E5): wechselt der Inspektor das Geraet,
  // folgt die Arbeitsflaeche; der Canvas meldet seine Wechsel ueber `onState`.
  session.subscribe(() => {
    const ui = session.ui();
    canvas.setMode(ui.mode);
    canvas.setBreakpoint(ui.device);
    inspector.setBreakpoint(ui.device);
  });

  // Der Ebenen-Explorer (Ticket 03 Scheibe 1): Tree mit Tastatur,
  // Kontextmenue und Fokus-Rueckgabe. Die Site-Tabs (Ticket 03 Punkt 1)
  // speisen sich aus den Caches der Shell: Seiten wechseln, Medien als Bild
  // einfuegen; Vorlagen/Komponenten folgen mit ihrer Datenquelle (O14).
  const explorer = editor.createExplorer({
    host: explorerHost,
    store: session.store,
    // The variant name is asked in the dashboard's own dialog, not in the
    // browser's prompt.
    prompt: (message, initial) =>
      askText({
        title: message,
        label: "Name",
        value: initial,
        required: true,
        requiredMessage: "Bitte einen Namen eingeben.",
        confirmLabel: "Speichern",
      }),
    tabs: [
      {
        id: "pages",
        label: "Seiten",
        empty: "Keine Seiten gefunden.",
        items: () =>
          pagesCache.map((entry) => ({
            id: entry.id,
            label: entry.title || entry.path,
            hint: entry.path,
            active: entry.id === pageId,
          })),
        onActivate: (id) => {
          // Eine eigene Seitenwahl beendet die Agent-Vorschau: der Nutzer
          // will diese Seite sehen, kein Auto-Wechsel soll ihn wegziehen.
          if (id !== pageId) setFollowAgent(false);
          location.hash = `#/projects/${siteId}/pages/${id}`;
        },
      },
      {
        id: "components",
        label: "Komponenten",
        empty: "Noch keine Komponenten - Rechtsklick auf eine Ebene, dann ,Als Komponente anlegen'.",
        items: () =>
          editor.buildComponentList(session.store.document).map((entry) => ({
            id: entry.id,
            label: entry.name,
            hint: `v${entry.version} · ${
              entry.instances === 1 ? "1 Instanz" : `${entry.instances} Instanzen`
            }${entry.drift > 0 ? ` · ${entry.drift} alt` : ""}`,
          })),
        onActivate: (id) => {
          const target = session.store.selection.focus ?? null;
          const instanceId = editor.instantiateComponent(session.store, id, target);
          if (instanceId === null) {
            statusEl.textContent = "Die Instanz ließ sich nicht einfügen.";
            return;
          }
          session.select(instanceId);
          statusEl.textContent = "Instanz eingefügt";
        },
      },
      {
        id: "library",
        label: "Bibliothek",
        empty: "Noch keine globalen Bausteine.",
        items: () => (libraryComponents ?? []).map((component) => ({
          id: component.id,
          label: component.name,
          hint: `${component.kind} · v${component.version} · ${component.license.status}`,
        })),
        onActivate: (id) => {
          const component = (libraryComponents ?? []).find((entry) => entry.id === id);
          if (component === undefined) return;
          void (async () => {
            try {
              await api(`/api/sites/${siteId}/library-installs`, {
                method: "POST",
                body: {
                  componentId: id,
                  mode: "linked",
                  pageId,
                  parentNodeId: page.draft.rootNodeId,
                  author: AUTHOR,
                },
              });
              statusEl.textContent = `„${component.name}“ installiert`;
              const fresh = await api(`/api/pages/${pageId}`);
              session.replaceDocument(editor.loadDocument(fresh.draft, { styleRules: session.document.styleRules }).document, fresh.draftVersion);
              session.discardPending();
              setVersion(fresh.draftVersion);
            } catch (error) {
              failed(error);
            }
          })();
        },
      },
      {
        id: "media",
        label: "Medien",
        empty: "Keine Dateien in der Mediathek.",
        items: () =>
          mediaCache.map((asset) => ({
            id: asset.id,
            label: asset.name,
            hint: asset.kind,
          })),
        onActivate: (id) => {
          if (canvas.insert("image", "after", { asset: id })) {
            statusEl.textContent = "";
          }
        },
      },
    ],
    onMessage: (message) => {
      if (message !== null) statusEl.textContent = message;
    },
  });

  // Die Spotlight (Cmd+K, Ticket 03 Scheibe 1): Bausteine, Seiten und
  // Aktionen ueber die bestehende Suchlogik; `insert-primitive` fuegt am
  // ausgewaehlten Knoten ein.
  const spotlightIndex = editor.buildEditorSpotlightIndex({
    pages: pagesCache,
    primitives: editor.primitiveTypes().map((type) => {
      const definition = editor.getPrimitive(type);
      return {
        type,
        name: definition?.name ?? type,
        description: definition?.description ?? "",
        category: definition?.category ?? "",
      };
    }),
    // Jede Variante jeder Registry-Sektion: einfügen mit Vorschaubild.
    sections: editor.listSectionVariants(),
    currentPageId: pageId,
  });
  const spotlight = editor.createSpotlightDialog({
    index: spotlightIndex,
    onCommand: (command) => {
      if (command.type === "open-page") {
        location.hash = `#/projects/${siteId}/pages/${command.pageId}`;
      } else if (command.type === "insert-primitive") {
        canvas.insert(command.primitive, "after");
      } else if (command.type === "insert-section") {
        const variant = command.variant ?? editor.sectionInsertSpec(command.sectionType)?.variant;
        if (variant !== undefined) canvas.insertSection(command.sectionType, variant);
      } else if (command.type === "publish") {
        location.hash = `#/projects/${siteId}/review`;
      } else if (command.type === "set-mode") {
        canvas.setMode(command.mode);
      }
    },
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey === true || event.ctrlKey === true) && event.key === "k") {
      event.preventDefault?.();
      spotlight.open();
    }
  });

  // Der Inspektor (Ticket 02 Scheibe 1): Tabs Content/Style/Interactions/
  // Advanced, Feld-Familie aus der Vorschau, Token<->Literal.
  const inspector = editor.createInspector({
    host: inspectorHost,
    store: session.store,
    theme: siteTheme ?? editor.defaultTheme(),
    profile: siteProfile ?? "standard",
    breakpoint: savedUi.device,
    // Die Mediathek der Site: Bild-Eigenschaften der Sektionen wählen daraus.
    assets: () => mediaCache,
    onTabChange: (tab) => session.setTab(tab),
    onBreakpointChange: (device) => session.setDevice(device),
    onClassUsage: async (ruleId) => {
      const result = await api(`/api/sites/${encodeURIComponent(siteId)}/style-rules/${encodeURIComponent(ruleId)}/usage`);
      return result.usage ?? [];
    },
    // Der Zustand des Style-Tabs ist die Vorschau (Ticket 02 Punkt 5): der
    // Canvas erzwingt :hover/:focus/:active/:disabled am gewaehlten Knoten.
    onStateChange: (state) => {
      canvas.setPreviewState(state);
    },
    onMessage: (message) => {
      if (message !== null) statusEl.textContent = message;
    },
  });
  inspector.setTab(savedUi.tab);

  // Das Elemente-Panel (E4/E5): Kacheln, Suche, Klick und Ziehen. Es wird einmal
  // gebaut und steht nur ohne Auswahl da; ein Klick fuegt das Element am Ziel
  // eines Plus-Punkts ein (sonst am Ende der Seite), Ziehen setzt es per Drag and
  // Drop - beides ueber den Controller des Canvas.
  const elementsPanel = editor.createElementsPanel(document, {
    insert: (primitive) => canvas.insertAtTarget(primitive),
    bindDragSource: (element, primitive) => canvas.bindDragSource(element, primitive),
    cancelTarget: () => canvas.clearArmed(),
    // Reiter „Sektionen“: eine Kachel je Variante, Klick oder Ziehen setzt sie.
    insertSection: (type, variant) => canvas.insertSection(type, variant),
    bindSectionDragSource: (element, type, variant) =>
      canvas.bindSectionDragSource(element, type, variant),
    // Die Vorschaubilder kommen gebacken mit dem Theme DIESER Site - sonst
    // zeigte die Auswahl die Standardfarben statt der eigenen. Der Stand des
    // Themes steht im Pfad, damit ein neues Theme neue Bilder ergibt.
    thumbnailBase: (type, variant) =>
      `/api/sites/${encodeURIComponent(siteId)}/section-preview/${encodeURIComponent(type)}/${encodeURIComponent(variant)}.png?v=${encodeURIComponent(siteThemeVersion ?? 0)}`,
  });
  elementsHost.replaceChildren(elementsPanel.element);
  // Ein Klick auf einen Plus-Punkt im Canvas merkt ein Ziel; das Panel zeigt es.
  canvas.onArmedChange((target) => elementsPanel.setTarget(target === null ? null : target.label));

  // Die Variablen (C-Zweig): Liste, Anlegen, Umbenennen, Löschen und die
  // gemeinsame Server-History. Das Panel hängt an derselben Session wie Canvas
  // und Inspektor.
  const variablesPanel = createVariablesPanel({
    siteId,
    pageId,
    session,
    api,
    editor,
    canvas,
    inspector,
    author: AUTHOR,
    getTheme: () => siteTheme ?? editor.defaultTheme(),
    getThemeVersion: () => siteThemeVersion ?? 0,
    setTheme: (theme, version, css) => {
      siteTheme = theme;
      siteThemeVersion = version;
      canvas.setTheme(theme, css);
      inspector.setTheme(theme);
    },
    setVersion,
    reloadDraft: () => reloadDraft(),
    showVariables: () => showSidePanel("variables"),
    isActive: () => host.isConnected,
  });
  variablesHost.replaceChildren(variablesPanel.element);
  // Das Variablenpanel stellt beim Oeffnen den gespeicherten Verlauf wieder
  // her. Das passiert ohne eigenes Session-Ereignis; ein erneutes Setzen der
  // Auswahl aktualisiert Undo/Redo in der Canvas-Leiste.
  session.store.setSelection(session.store.selection);

  // Panel-Wechsel (E5): ist ein Element gewaehlt, ersetzen die Einstellungen die
  // Elemente; ohne Auswahl (Esc im Inspektor, Zurueck-Knopf, Leerklick im Canvas)
  // stehen wieder die Elemente da. Ein ausdruecklich gewaehlter Bereich
  // (Variablen, Struktur) bleibt stehen.
  let lastSelectedId = null;
  const syncSidePanel = () => {
    const selection = session.store.selection;
    const selectedId = selection.focus ?? selection.selected[0] ?? null;
    // Nur ein Wechsel der Auswahl schaltet um. Wer die Variablen oder die
    // Struktur geoeffnet hat, bleibt dort, bis er ein anderes Element waehlt.
    if (selectedId !== lastSelectedId) {
      lastSelectedId = selectedId;
      if (selectedId !== null) showSidePanel("inspector");
      else if (activeSide === "inspector") showSidePanel("elements");
    }
    sideHost.dataset.panel = selectedId !== null ? "settings" : activeSide;
  };
  session.store.subscribe(syncSidePanel);

  // Die Auswahl aus der letzten Sitzung wiederherstellen, sofern der Knoten
  // noch existiert; `store.select` umgeht den Persistenz-Schreibpfad nicht.
  showSidePanel("elements");
  if (savedUi.selectedId && session.document.nodes[savedUi.selectedId]) {
    session.store.select(savedUi.selectedId);
  }
  syncSidePanel();

  /* ------------------------------------------------------- Live-Mitverfolgung
   * Ticket 05: die Engine meldet Aenderungen ueber SSE (`GET /api/events`).
   * Der Editor laedt die offene Seite nach (Store-Patch statt Voll-Neuladen),
   * hebt die geaenderten Knoten kurz hervor (Lime-Ring, 1200 ms) und fuehrt
   * ein Bau-Protokoll. Eigene offene Aenderungen blockieren das Nachladen,
   * sonst gingen sie verloren; ohne Kanal bleibt alles beim manuellen Neuladen. */
  // Das Protokoll liegt in `app-editor-protocol.js` (R12): eigene Daten,
  // eigene Darstellung, kein Bezug auf Session oder Auswahl. Die Naht ist
  // `logProtocol(payload)`, alle Aufrufstellen bleiben gleich.
  const protocolLog = createProtocolLog({
    doc: document,
    el,
    host: canvasHost,
    labels: MUTATION_LABELS,
    clock: () => new Date(),
  });
  const logProtocol = (payload) => protocolLog.log(payload);
  // Dieselbe Beschriftung wie im Protokoll - exportiert, damit die Live-Zeile
  // nicht eine zweite Uebersetzungstabelle braucht.
  const protocolAction = (action) => MUTATION_LABELS[action] ?? action ?? "Änderung";
  // Der Parser und der Eigener-Schreiber-Test liegen in
  // `app-editor-live-events.js` (R12): reine Rechnung, kein DOM. Ein kaputter
  // Frame wirft nicht, und ein Fremder ohne Etikett gilt nicht als "meins".
  // `parseEngineEvent` kommt direkt aus dem Modul (gleiche Form); `isOwnEvent`
  // braucht das Etikett des Programms und bleibt deshalb einzeilig hier.
  const isOwnEvent = (payload) => isOwnEventFromPayload(payload, AUTHOR.label);
  // Agent-Vorschau (Ticket 05, Punkt 5) liegt in
  // `app-editor-agent-preview.js` (R12): der Schalter, seine Speicherung und
  // die Entscheidung "darf die Ansicht wechseln?". Offene eigene Aenderungen
  // blockieren jeden Wechsel - ein Routenwechsel verwirft sie.
  const agentPreview = createAgentPreview({
    el,
    storage,
    isBusy: () => {
      const state = session.saveState();
      return state.pending > 0 || state.status === "saving";
    },
    onMessage: (message) => {
      statusEl.textContent = message;
    },
  });
  const followButton = agentPreview.element;
  const setFollowAgent = (value) => agentPreview.set(value, { announce: false });

  // Sekundäre Editor-Aktionen liegen in einem echten Overflow-Menü. Die
  // bestehenden data-action-Selektoren bleiben erhalten, damit Import, Follow
  // und die Konfliktwege direkt addressierbar und testbar bleiben.
  activeToolbarMenuCleanup?.();
  // Das Overflow-Menue liegt in `app-editor-toolbar-overflow.js` (R12):
  // Tastatur, Fokus und Aussenklick ohne Bezug auf Canvas oder Auswahl. Die
  // data-action-Selektoren der vier Eintraege bleiben unveraendert, damit
  // Import, Follow und die Konfliktwege direkt adressierbar und testbar sind.
  const overflow = createToolbarOverflow({
    doc: document,
    el,
    entries: [
      { element: framerImportButton },
      { element: followButton, role: "menuitemcheckbox" },
      { element: reloadButton },
      { element: retryButton },
    ],
  });
  const overflowHost = overflow.element;
  const cleanup = () => {
    overflow.dispose();
    if (activeToolbarMenuCleanup === cleanup) activeToolbarMenuCleanup = null;
    // The redesign inbox only makes sense on the page it belongs to.
    stopRedesignPolling();
  };
  activeToolbarMenuCleanup = cleanup;
  // Wechselt auf die Seite, an der der Agent gerade arbeitet - nur ohne
  // offene lokale Aenderungen (sonst gingen sie beim Routenwechsel verloren).
  const followPage = (targetPageId) => {
    const decision = agentPreview.mayFollow(targetPageId, pageId);
    if (!decision.allowed) {
      if (decision.reason !== null) statusEl.textContent = decision.reason;
      return false;
    }
    location.hash = `#/projects/${siteId}/pages/${targetPageId}`;
    return true;
  };
  // Nur eine Canvas-Ansicht ist aktiv; die vorige schliesst ihren Kanal beim
  // Routenwechsel (sonst leckt jede Navigation eine SSE-Verbindung).
  activeLiveStream?.close();
  const live =
    typeof EventSource === "function"
      ? new EventSource(`/api/events?site=${encodeURIComponent(siteId)}`)
      : null;
  activeLiveStream = live;
  live?.addEventListener("draft.changed", (event) => {
    const payload = parseEngineEvent(event);
    if (isOwnEvent(payload)) return;
    logProtocol(payload);
    // Die Entscheidung liegt in `app-editor-live-sync.js` (R12); hier steht
    // nur, was sie ausloest. "blocked" ist der teure Fall: nachladen wuerde
    // die offenen Aenderungen verwerfen.
    const decision = draftChangedDecision({
      payload,
      pageId,
      isBusy: () => {
        const state = session.saveState();
        return state.pending > 0 || state.status === "saving";
      },
    });
    if (decision.action === "ignore") return;
    if (decision.action === "follow") {
      followPage(payload.pageId);
      return;
    }
    if (decision.action === "blocked") {
      statusEl.textContent = decision.message ?? "";
      return;
    }
    void (async () => {
      try {
        const fresh = await api(`/api/pages/${pageId}`);
        session.replaceDocument(
          editor.loadDocument(fresh.draft, { styleRules: session.document.styleRules }).document,
          fresh.draftVersion,
        );
        canvas.flashNodes(nodesToFlash(payload));
        setVersion(fresh.draftVersion);
        statusEl.textContent = `Live: ${protocolAction(payload.action)}`;
      } catch (error) {
        failed(error);
      }
    })();
  });
  live?.addEventListener("page.created", (event) => {
    const payload = parseEngineEvent(event);
    if (isOwnEvent(payload)) return;
    logProtocol(payload);
    // Die Seitenliste der Shell nachziehen, damit die neue Seite im Explorer
    // waehlbar ist; mit Agent-Vorschau wechselt die Ansicht gleich dorthin.
    void (async () => {
      try {
        const listed = await api(`/api/sites/${siteId}/pages`);
        pagesCache.length = 0;
        pagesCache.push(
          ...(listed.pages ?? []).map((entry) => ({
            id: entry.id,
            title: entry.title || entry.path,
            path: entry.path,
          })),
        );
        explorer.refresh();
        const created = pageCreatedDecision({
          payload,
          followed: followPage(payload.pageId),
        });
        if (created.action === "hint") statusEl.textContent = created.message ?? "";
      } catch (error) {
        failed(error);
      }
    })();
  });
  live?.addEventListener("asset.uploaded", (event) => {
    const payload = parseEngineEvent(event);
    if (isOwnEvent(payload)) return;
    logProtocol(payload);
  });
  live?.addEventListener("release.published", (event) => {
    const payload = parseEngineEvent(event);
    if (isOwnEvent(payload)) return;
    logProtocol(payload);
  });
  // Re-Bake (E12): der Worker meldet das Ergebnis; der Badge zeigt es direkt,
  // ein Fehler zusaetzlich als Toast (die Job-Route traegt die Details).
  live?.addEventListener("bake.done", (event) => {
    const payload = parseEngineEvent(event);
    logProtocol(payload);
    bakeStatus.show("Inhalt neu gebaut");
  });
  live?.addEventListener("bake.failed", (event) => {
    const payload = parseEngineEvent(event);
    logProtocol(payload);
    bakeStatus.show("Re-Bake fehlgeschlagen", true);
    toast("Re-Bake fehlgeschlagen — Details in der Job-Liste", "error");
  });
  // Beim Verlassen der Ansicht den Kanal schliessen (kein abgebrochener
  // Request, kein Leck beim Wechsel der Route).
  window.addEventListener("pagehide", () => {
    live?.close();
    if (activeLiveStream === live) activeLiveStream = null;
    cleanup();
  });

  saveButton.addEventListener("click", () => {
    void session.flush();
  });
  // Veroeffentlichen ueber die echte Route (Ticket 17): erst die offenen
  // Aenderungen speichern, dann `POST /api/sites/:siteId/releases` — derselbe
  // Pfad wie der MCP-`publish_release` (Revisionen, Theme-Snapshot, Release,
  // O9-Vorhang, aktives Release). Der Editor baut nichts selbst.
  publishButton.addEventListener("click", async () => {
    publishButton.disabled = true;
    statusEl.textContent = "Veröffentliche …";
    try {
      await session.flush();
      const result = await api(`/api/sites/${siteId}/releases`, {
        method: "POST",
        body: { author: AUTHOR },
      });
      const releaseId = result.release?.id ?? "?";
      statusEl.textContent = `Release ${releaseId} aktiv`;
      toast(`Veröffentlicht — Release ${releaseId}`, "info");
    } catch (error) {
      statusEl.textContent = error?.message ?? "Veröffentlichen fehlgeschlagen";
      toast(`Veröffentlichen fehlgeschlagen: ${error?.message ?? error}`, "error");
    } finally {
      publishButton.disabled = false;
    }
  });
  reloadButton.addEventListener("click", () => {
    void reloadDraft();
  });
  retryButton.addEventListener("click", () => {
    void retrySave();
  });

  toolbar.append(statusGroup, redesignInbox.element, saveButton, publishButton, overflowHost);
  return { session, canvas, inspector, explorer, spotlight };
}
