// Der Seiten-Editor: die Ansicht (`pageView`), der Wartepunkt auf einen
// Bild-Job und der Hinweis auf den alten Deep-Link.
//
// Die Buehne (`mountCanvasView`) liegt seit dem R12-Schnitt in
// `app-editor-canvas.js`.

import { api, el, render, routeScope, toast } from "./app-core.js";
import { mountCanvasView } from "./app-editor-canvas.js";

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
  let themeFailed = false;
  try {
    const themeResponse = await api(`/api/sites/${siteId}/theme`);
    siteTheme = themeResponse.theme ?? null;
    siteThemeVersion = Number.isInteger(themeResponse.version) ? themeResponse.version : 0;
  } catch {
    siteTheme = null;
    siteThemeVersion = 0;
    themeFailed = true;
  }
  let siteStyleRules = [];
  let styleRegistryVersion = 0;
  let styleRulesFailed = false;
  try {
    const rules = await api(`/api/sites/${siteId}/style-rules`);
    siteStyleRules = rules.rules ?? [];
    styleRegistryVersion = Number.isInteger(rules.version) ? rules.version : 0;
  } catch {
    siteStyleRules = [];
    styleRegistryVersion = 0;
    styleRulesFailed = true;
  }
  // Die Bibliothek ist eine Zutat, keine Bedingung: ohne sie bearbeitet man
  // die Seite weiter, nur ohne Bausteine.
  let libraryComponents = [];
  try {
    const library = await api("/api/library-components");
    libraryComponents = library.components ?? [];
  } catch {
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
      // Die Mediathek ist seitenweise: der Editor braucht alle Seiten, sonst
      // fehlen Bilder jenseits der ersten 200 Dateien und laufen ins Leere.
      const assets = [];
      for (let offset = 0; ;) {
        const listed = await api(`/api/sites/${siteId}/assets?offset=${offset}&limit=200`);
        const batch = listed.assets ?? [];
        assets.push(...batch);
        if (listed.hasMore !== true || batch.length === 0) break;
        offset += batch.length;
      }
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

  if (styleRulesFailed || themeFailed) {
    const notice = el("div", { class: "empty-state", role: "alert" });
    notice.appendChild(el("h2", {
      text: styleRulesFailed
        ? "Die Klassen konnten nicht geladen werden."
        : "Die Variablen konnten nicht geladen werden.",
    }));
    notice.appendChild(el("p", { text: "Ohne Theme und Style-Registry lässt sich die Seite nicht sicher bearbeiten. Bitte neu laden." }));
    host.replaceChildren(notice);
    return;
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
