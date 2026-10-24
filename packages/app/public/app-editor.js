// Der Seiten-Editor und die Buehne. Die Bloecke standen in `app.js` und
// sind unveraendert hierher gewandert; die Importe zwischen den Modulen sagt
// ESLint.

import { AUTHOR, MUTATION_LABELS, api, askText, el, failed, render, routeScope, toast } from "./app-core.js";
import { createAgentPreview } from "./app-editor-agent-preview.js";
import { createBakeStatus } from "./app-editor-bake-status.js";
import { createConflictDialog } from "./app-editor-conflict-dialog.js";
import { createPanelToggle } from "./app-editor-panel-toggle.js";
import {
  isOwnEvent as isOwnEventFromPayload,
  parseEngineEvent,
} from "./app-editor-live-events.js";
import { saveControls, saveStatusText } from "./app-editor-save-status.js";
import { createProtocolLog } from "./app-editor-protocol.js";
import { createRedesignInbox } from "./app-editor-redesign-inbox.js";
import { createToolbarOverflow } from "./app-editor-toolbar-overflow.js";
import { openRedesignDirectionDialog } from "./app-import.js";
import { openFramerImportDialog } from "./app-framer-import.js";

// The open SSE channel of the active canvas view (ticket 05): a route change
// closes it before the next view subscribes, so streams do not stack up.
let activeLiveStream = null;
let activeToolbarMenuCleanup = null;

// The new canvas view (rebuild Phase 0, fifth slice). It reads the very page
// draft of the running engine (`GET /api/pages/:pageId`) and lifts it to the v2
// editor document with the existing migration; changes are written back through
// the engine's mutations path (`POST /api/pages/:pageId/editor-mutations`), so
// the canvas owns no storage of its own.
//
// E5 Scheibe 1: der Umbau-Pfad ist der **eine sichtbare Editor**.
//
// P3-1 Punkt 4 (R5): the v1 editor is gone - `mount.ts`, `mountEditor` and the
// page that mounted it are all deleted. There is no mode to compute any more,
// so there is no `canvasModeOf`: the page below mounts the canvas, and the only
// thing left of the old deep link is the hint that says so. Keeping a function
// that returns a constant would be a lie about there being a choice.
//
// `?view=editor` is no longer a second editing path but a **notice**: the
// deep link lands on the canvas and says why. Someone with the old URL
// bookmarked therefore does not end up in a surface nobody maintains, and the
// parameter is cleaned out so a reload does not repeat the notice.
//
// Erkennt den alten Deep-Link, damit der Umstieg **sichtbar** ist: der
// Hinweistext erscheint im Canvas, und der Parameter wird aus dem Hash
// entfernt, damit ein Neuladen nicht erneut umgeleitet wird. Ohne das
// Entfernen bliebe der Hinweis bei jedem Reload stehen und wuerde zum
// Normalzustand.
function legacyEditorDeepLink(search) {
  return /(?:^|&)view=editor(?:&|$)/.test(String(search ?? ""));
}

// Wartet auf einen Bild-Job und liefert die Asset-Id (P2-2).
//
// Ein Job ist asynchron: die Route antwortet 202, der Lauf arbeitet weiter. Der
// Dialog darf also nicht auf eine fertige Bilddatei warten, sondern auf einen
// ENTSCHIEDENEN Zustand. Beendet wird gewartet bei `succeeded` (mit Asset), bei
// `failed`/`canceled` (mit der Fehlermeldung des Laufs) und nach einer Frist.
//
// Die Statusnamen kommen aus dem Engine-Typ (`IMAGE_JOB_STATUSES`): `succeeded`
// und `canceled`, nicht `done` und `cancelled`. Hier standen zuerst die
// falschen - der Dialog wartete dann endlos auf einen Zustand, den es nicht
// gibt, während der Job längst fertig war.
//
// Die Frist ist kein Optimismus: ein hängender Job darf einen Menschen nicht
// ewig am Dialog festhalten. Nach Ablauf wird ein Fehler gemeldet und der Slot
// bleibt offen - der Bedarf ist dann noch da und wird beim nächsten Versuch
// neu erzeugt, statt still als geschlossen zu gelten.
const BILDJOB_FRIST_MS = 120000;
const BILDJOB_ABSTAND_MS = 1200;

export async function waitForImageJob(siteId, jobId, onStatus) {
  const ende = Date.now() + BILDJOB_FRIST_MS;
  let letzterText = "";
  while (Date.now() < ende) {
    const job = await api(`/api/images/jobs/${encodeURIComponent(jobId)}`);
    if (job.status === "succeeded" && typeof job.assetId === "string") return job.assetId;
    if (job.status === "failed" || job.status === "canceled") {
      const gruende = Array.isArray(job.error) ? job.error : [];
      const letzterFehler = gruende[gruende.length - 1]?.message;
      throw new Error(letzterFehler ?? `Der Bild-Job endete mit „${job.status}“.`);
    }
    // Der Text wechselt nur, wenn sich etwas geaendert hat: ein Dialog, der
    // im Sekundentakt dieselbe Zeile neu schreibt, ist unruhig und macht die
    // tatsaechliche Wartezeit schwerer lesbar als noetig.
    const text = `Wird erzeugt … (Versuch ${job.attempts ?? 1}/${job.maxAttempts ?? 1})`;
    if (text !== letzterText) {
      letzterText = text;
      onStatus(text);
    }
    await new Promise((resolve) => setTimeout(resolve, BILDJOB_ABSTAND_MS));
  }
  throw new Error(
    `Der Bild-Job hat nach ${Math.round(BILDJOB_FRIST_MS / 1000)} s kein Ergebnis geliefert.`,
  );
}

async function mountCanvasView({ pageId, siteId, page, host, toolbar, editor, pagesCache, mediaCache, libraryComponents, assetContext, siteProfile, siteBreakpoints, siteTheme, siteThemeVersion, styleRules, styleRegistryVersion }) {
  const loaded = editor.loadDocument(page.draft);
  loaded.document.styleRules = styleRules ?? [];

  // Drei Spalten: Elemente/Einstellungen, Arbeitsflaeche (Canvas) und Struktur
  // (Tickets 02/03). Alle drei lesen denselben Store — die Auswahl im Canvas
  // ist die Auswahl in beiden Panels, eine Aenderung erscheint ueberall.
  const explorerHost = el("aside", { class: "canvas-view__explorer" });
  const canvasHost = el("div", { class: "canvas-view__stage" });
  // Links wechseln sich Elemente und Einstellungen ab (E5), rechts bleibt der
  // Explorer mit den Ebenen.
  const elementsHost = el("div", { class: "canvas-view__elements" });
  const inspectorHost = el("div", { class: "canvas-view__inspector" });
  const sideHost = el("aside", { class: "canvas-view__side" }, elementsHost, inspectorHost);
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
        body: { error: { message: error?.message ?? String(error) } },
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
      const fresh = await api(`/api/pages/${pageId}`);
      session.replaceDocument(editor.loadDocument(fresh.draft).document, fresh.draftVersion);
      // Der Server-Stand ersetzt das Dokument; die offenen eigenen Aenderungen
      // sind damit verworfen (so steht es im Dialog).
      session.discardPending();
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
          session.replaceDocument(editor.loadDocument(fresh.draft).document, fresh.draftVersion);
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
              session.replaceDocument(editor.loadDocument(fresh.draft).document, fresh.draftVersion);
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
  });
  elementsHost.replaceChildren(elementsPanel.element);
  // Ein Klick auf einen Plus-Punkt im Canvas merkt ein Ziel; das Panel zeigt es.
  canvas.onArmedChange((target) => elementsPanel.setTarget(target === null ? null : target.label));

  // Panel-Wechsel (E5): ist ein Element gewaehlt, ersetzen die Einstellungen die
  // Elemente; ohne Auswahl (Esc im Inspektor, Zurueck-Knopf, Leerklick im Canvas)
  // stehen wieder die Elemente da.
  const syncSidePanel = () => {
    const selection = session.store.selection;
    const hasSelection = (selection.focus ?? selection.selected[0] ?? null) !== null;
    sideHost.dataset.panel = hasSelection ? "settings" : "elements";
    elementsHost.hidden = hasSelection;
    inspectorHost.hidden = !hasSelection;
  };
  session.store.subscribe(syncSidePanel);

  // Die Auswahl aus der letzten Sitzung wiederherstellen, sofern der Knoten
  // noch existiert; `store.select` umgeht den Persistenz-Schreibpfad nicht.
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
    if (payload.pageId !== pageId) {
      followPage(payload.pageId);
      return;
    }
    const state = session.saveState();
    if (state.pending > 0 || state.status === "saving") {
      statusEl.textContent = "Fremde Änderung erkannt - bitte speichern oder neu laden";
      return;
    }
    void (async () => {
      try {
        const fresh = await api(`/api/pages/${pageId}`);
        session.replaceDocument(
          editor.loadDocument(fresh.draft).document,
          fresh.draftVersion,
        );
        canvas.flashNodes(Array.isArray(payload.nodeIds) ? payload.nodeIds : []);
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
        if (!followPage(payload.pageId)) {
          statusEl.textContent = "Neue Seite angelegt - im Explorer wählbar";
        }
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

export async function pageView(siteId, pageId, initialSearch) {
  const current = routeScope();
  const page = await api(`/api/pages/${pageId}`);
  // Das Site-Profil (Ticket 20): der Editor zeigt es und validiert Profil-
  // Wechsel gegen das Dokument, bevor er den PATCH ausloest.
  let siteProfile = "standard";
  // Die eigenen Breakpoints der Site (ADR-0020); ohne Eintrag gelten 1024/640.
  // Die Blätter des Canvas und die Regeln darin richten sich danach.
  let siteBreakpoints = null;
  try {
    const site = await api(`/api/sites/${siteId}`);
    siteProfile = site.profile ?? "standard";
    siteBreakpoints = site.breakpoints ?? null;
  } catch {
    // Kein Site-Kontext erreichbar: der Editor faellt auf `standard` zurueck.
  }
  let siteTheme = null;
  let siteThemeVersion = 0;
  try {
    const themeResponse = await api(`/api/sites/${siteId}/theme`);
    siteTheme = themeResponse.theme ?? null;
    siteThemeVersion = Number.isInteger(themeResponse.version) ? themeResponse.version : 0;
  } catch {
    siteTheme = null;
    siteThemeVersion = 0;
  }
  let siteStyleRules = [];
  let styleRegistryVersion = 0;
  let libraryComponents = [];
  try {
    const [rules, library] = await Promise.all([
      api(`/api/sites/${siteId}/style-rules`),
      api("/api/library-components"),
    ]);
    siteStyleRules = rules.rules ?? [];
    styleRegistryVersion = Number.isInteger(rules.version) ? rules.version : 0;
    libraryComponents = library.components ?? [];
  } catch {
    siteStyleRules = [];
    styleRegistryVersion = 0;
    libraryComponents = [];
  }
  let currentTree = page.draft;
  let pagesCache = [];
  try {
    const listed = await api(`/api/sites/${siteId}/pages`);
    pagesCache = (listed.pages ?? []).map((entry) => ({
      id: entry.id,
      title: entry.title || entry.path,
      path: entry.path,
    }));
  } catch {
    pagesCache = [];
  }
  let mediaCache = [];
  // Die Bausteine holen ihre Bilder über den Auslieferungs-Kontext
  // (`/assets/<id>/<datei>`); ohne ihn fällt der Renderer auf
  // `/assets/<id>` ohne Dateinamen zurück und jedes Bild läuft ins Leere.
  let assetContext = {};
  async function refreshMedia() {
    try {
      const listed = await api(`/api/sites/${siteId}/assets`);
      const assets = listed.assets ?? [];
      mediaCache = assets.map((asset) => ({
        id: asset.id,
        name: asset.filename,
        kind: asset.kind,
        folders: asset.folderId ? [asset.folderId] : [],
        tags: asset.tags ?? [],
        createdAt: Date.parse(asset.createdAt) || undefined,
      }));
      assetContext = Object.fromEntries(
        assets.map((asset) => {
          // Der Versionsparameter bricht den Cache nach einem Austausch.
          const version = Date.parse(asset.updatedAt) || 0;
          return [
            asset.id,
            {
              src: `/assets/${asset.id}/${encodeURIComponent(asset.filename)}?v=${version}`,
              width: asset.width ?? null,
              height: asset.height ?? null,
              blurhash: asset.blurhash ?? null,
              variants: (asset.variants ?? []).map((variant) => ({
                format: variant.format,
                width: variant.width,
                url: `/assets/${asset.id}/variants/${variant.width}.${variant.format}?v=${version}`,
              })),
            },
          ];
        }),
      );
    } catch {
      mediaCache = [];
      assetContext = {};
    }
  }
  await refreshMedia();
  // Das Laden braucht mehrere Anfragen. Wer in der Zwischenzeit weitergeklickt
  // hat, soll nicht von der zu spät fertigen Seite überschrieben werden: die
  // Liste, die er gerade ansieht, wäre sonst mitten im Klick weg.
  const stillHere = () => location.hash.startsWith(`#/projects/${siteId}/pages/${pageId}`);
  if (!stillHere()) return;

  // Ein sichtbarer Editorpfad (E5 Scheibe 1): der Umbau-Canvas (`mountCanvas`,
  // v2-Dokument) ist der Editor. Seit P3-1 Punkt 4 gibt es keinen zweiten
  // mehr und keinen Modus zu berechnen - der Aufrufer pflegt den Canvas.
  // `data-senify-editor` macht die --ed-*-Tokens fuer die Workspace-Leiste verfuegbar
  // (sie liegt ausserhalb des Editor-Wurzelelements).
  const toolbar = el(
    "div",
    { class: "toolbar", "data-senify-editor": "true" },
    el("a", { href: `#/projects/${siteId}/pages`, text: "← Seiten" }),
    el("h1", { text: page.title || page.path, style: "margin: 0" }),
    el("code", { text: page.path }),
    el("div", { class: "spacer" }),
    el("span", { class: "muted", id: "page-version", text: `Draft v${page.draftVersion}` }),
  );
  const host = el("div", { class: "editor-host", id: "editor-host" });
  // Veraltet: die Navigation ging weiter, der Editor darf nicht mehr einhängen
  // (Tastatur-Handler, Zeitgeber und Stores blieben sonst an einem losen Host).
  if (!render([toolbar, host], current)) return;

  let editor = null;
  try {
    editor = await import("/editor.js");
  } catch {
    editor = null;
  }
  if (!stillHere()) return;

  // P3-1 Punkt 4 (R5): the v1 editor is deleted, so `?view=editor` is no longer
  // a second editing path but a **notice**: the deep link lands on the canvas
  // and says why. The block sits before the mount, not after it, or the notice
  // would never appear.
  if (legacyEditorDeepLink(initialSearch)) {
    // Der Parameter wird aus dem Hash entfernt, damit ein Reload den Hinweis
    // nicht erneut zeigt - sonst wird er zum Normalzustand statt zur
    // einmaligen Nachricht. Er steht **im Hash**, nicht in `location.search`:
    // das Dashboard routet ueber `#/projects/…?view=editor`, und `location.search`
    // ist bei diesem Routing leer.
    const [path, search = ""] = String(location.hash).split("?");
    const cleaned = search
      .split("&")
      .filter((part) => part !== "" && part !== "view=editor")
      .join("&");
    history.replaceState(
      null,
      "",
      `${location.origin}${location.pathname}${location.search}${path}${cleaned === "" ? "" : `?${cleaned}`}`,
    );
    toast(
      "Der alte Editor ist abgeloest — der Canvas ist jetzt der einzige Bearbeitungsweg.",
      "info",
    );
  }

  if (editor) {
    mountCanvasView({
      pageId,
      siteId,
      page,
      host,
      toolbar,
      editor,
      pagesCache,
      mediaCache,
      libraryComponents,
      assetContext,
      siteProfile,
      siteBreakpoints,
      siteTheme,
      siteThemeVersion,
      styleRules: siteStyleRules,
      styleRegistryVersion,
    });
    return;
  }

  // The editor bundle did not load. What is left is the raw structure, read
  // only: enough to see what the page is made of, not enough to change it. The
  // v1 editor used to be a second path here; there is no second path any more.
  const nodes = currentTree?.nodes ?? {};
  const root = nodes[currentTree?.rootNodeId] ?? { children: [] };
  function outline(nodeId) {
    const node = nodes[nodeId];
    if (!node) return [];
    return [
      el("div", { class: "outline-node" }, [
        el("span", { class: "tag", text: node.type }),
        node.variant ? el("span", { class: "tag", text: node.variant }) : "",
        el("code", { text: ` ${node.id}` }),
        node.hidden ? el("span", { class: "muted", text: " · versteckt" }) : "",
      ]),
      ...(node.children ?? []).flatMap((child) => outline(child)),
    ];
  }
  host.className = "panel";
  host.replaceChildren(
    el("h2", { text: "Aufbau (read-only)" }),
    el(
      "div",
      { class: "outline-tree" },
      (root.children ?? []).flatMap((child) => outline(child)),
    ),
  );
}

/* Command palette */
