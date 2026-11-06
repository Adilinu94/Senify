import { SenifyError } from "@senify/core";
import type { HistoryDirection } from "../history.ts";
import { validateDocument } from "./consistency.ts";
import type { EditorDocument } from "./document.ts";
import type { ExternalVersions, SavePipeline } from "./persist.ts";
import type { EditorStore } from "./store.ts";

export type ExternalHistoryResult =
  | { status: "committed"; pageVersion: number; themeVersion: number; registryVersion?: number; document?: EditorDocument }
  | { status: "rejected" | "unknown"; message: string };

export type ExternalHistoryRequest = {
  entryId: string;
  direction: HistoryDirection;
  versions: Readonly<ExternalVersions>;
  uncertain: boolean;
};

// The owner secures an idempotent request before writing. On uncertain retry it
// must query/replay that request, not mint another operation against a new base.
export type ExternalHistoryRunner = (request: ExternalHistoryRequest) => Promise<ExternalHistoryResult>;

export type ExternalHistoryState = {
  status: "idle" | "running" | "unresolved" | "rejected";
  message?: string;
};

type Navigation = {
  pendingId: string;
  entryId: string;
  direction: HistoryDirection;
  versions: Readonly<ExternalVersions>;
  document: EditorDocument;
  runner: ExternalHistoryRunner;
  uncertain: boolean;
};

export class ExternalHistoryController {
  readonly #runners = new Map<string, ExternalHistoryRunner>();
  readonly #store: EditorStore;
  readonly #pipeline: SavePipeline;
  readonly #emit: () => void;
  #navigation: Navigation | null = null;
  #state: ExternalHistoryState = { status: "idle" };
  #disposed = false;
  isCommitting = false;

  constructor(store: EditorStore, pipeline: SavePipeline, emit: () => void) {
    this.#store = store;
    this.#pipeline = pipeline;
    this.#emit = emit;
  }

  state(): ExternalHistoryState { return { ...this.#state }; }

  reconcile(): void {
    const ids = new Set(this.#store.history.entries().map((item) => item.id));
    for (const id of this.#runners.keys()) if (!ids.has(id)) this.#runners.delete(id);
    if (this.#navigation !== null && this.#store.pendingExternalId !== this.#navigation.pendingId) {
      this.#navigation = null;
      this.#state = { status: "idle" };
    }
  }

  register(entryId: string, runner: ExternalHistoryRunner): void {
    const entries = this.#store.history.entries();
    const entry = entries.find((item) => item.id === entryId);
    if (this.#disposed || !entry?.external || entry.status !== "committed") {
      throw new SenifyError("validation", "Nur ein bestätigter externer Verlaufsschritt kann registriert werden", { field: "entryId" });
    }
    // Discarded redo branches must not retain receipt closures forever.
    this.reconcile();
    this.#runners.set(entryId, runner);
    this.#emit();
  }

  #clean(): boolean {
    const save = this.#pipeline.state();
    return save.pending === 0 && save.unsupported.length === 0 && !["saving", "conflict", "error"].includes(save.status);
  }

  canNavigate(direction: HistoryDirection): boolean {
    this.reconcile();
    if (this.#disposed || this.#navigation !== null) return false;
    const entry = this.#store.history.navigationEntry(direction);
    if (!entry) return false;
    return !entry.external || (this.#runners.has(entry.id) && this.#clean() && this.#pipeline.externalVersions().themeVersion !== null);
  }

  // A jump is possible when a route exists and no navigation is in flight. Each
  // external step is still validated at execution time (runner, clean save
  // state, versions, confirmation); a missing runner or a dirty save state stops
  // the jump at the last confirmed step instead of partially applying it.
  canRestoreTo(entryId: string): boolean {
    this.reconcile();
    if (this.#disposed || this.#navigation !== null || this.#state.status === "running") return false;
    const route = this.#store.history.routeTo(entryId);
    if (route === null) return false;
    const save = this.#pipeline.state();
    if (["conflict", "error"].includes(save.status) || save.unsupported.length > 0) return false;
    return route.every((step) => !step.entry.external ||
      (this.#runners.has(step.entry.id) && this.#pipeline.externalVersions().themeVersion !== null));
  }

  async navigate(direction: HistoryDirection): Promise<boolean> {
    if (!this.canNavigate(direction)) return false;
    const entry = this.#store.history.navigationEntry(direction)!;
    if (!entry.external) {
      this.#state = { status: "idle" };
      return direction === "undo" ? this.#store.undo() : this.#store.redo();
    }
    const runner = this.#runners.get(entry.id)!;
    const versions = Object.freeze(this.#pipeline.externalVersions());
    const document = this.#store.document;
    this.#state = { status: "running" };
    const pending = this.#store.beginExternalNavigation(direction);
    this.#navigation = { pendingId: pending.id, entryId: entry.id, direction, versions, document, runner, uncertain: false };
    return this.#run(this.#navigation);
  }

  // Stepwise jump through the ordinary navigation gate. Pending local saves are
  // flushed before an external step so the server call starts from a clean base;
  // a route that changed meanwhile (new input, another observer) stops before
  // any unconfirmed step. Stops at the last confirmed step on rejection,
  // unknown/incomplete confirmation, or a route that becomes inapplicable.
  async restoreTo(entryId: string): Promise<boolean> {
    this.reconcile();
    if (this.#disposed || this.#navigation !== null || this.#state.status === "running") return false;
    const route = this.#store.history.routeTo(entryId);
    if (route === null || route.length === 0) return false;
    for (const step of route) {
      if (this.#disposed || this.#navigation !== null) return false;
      if (this.#store.history.navigationEntry(step.direction)?.id !== step.entry.id) return false;
      if (step.entry.external && !this.#clean()) {
        try {
          await this.#pipeline.flush();
        } catch {
          return false;
        }
        if (this.#disposed || this.#navigation !== null || !this.#clean() ||
            this.#store.history.navigationEntry(step.direction)?.id !== step.entry.id) return false;
      }
      if (!(await this.navigate(step.direction))) return false;
    }
    return true;
  }

  async retry(): Promise<boolean> {
    this.reconcile();
    if (this.#disposed || this.#state.status === "running" || this.#navigation === null) return false;
    return this.#run(this.#navigation);
  }

  #unresolved(navigation: Navigation, message: string): false {
    navigation.uncertain = true;
    this.#state = { status: "unresolved", message };
    this.#emit();
    return false;
  }

  #owns(navigation: Navigation): boolean {
    this.reconcile();
    return !this.#disposed && this.#navigation === navigation;
  }

  #unchanged(navigation: Navigation): boolean {
    const current = this.#pipeline.externalVersions();
    const base = navigation.versions;
    return this.#clean() && this.#store.document === navigation.document && current.pageVersion === base.pageVersion &&
      current.themeVersion === base.themeVersion && current.registryVersion === base.registryVersion &&
      this.#store.history.canConfirmExternalNavigation(navigation.pendingId, navigation.entryId, navigation.direction);
  }

  #rejected(navigation: Navigation, message: string): false {
    if (navigation.uncertain) return this.#unresolved(navigation, message);
    this.#navigation = null;
    this.#state = { status: "rejected", message };
    this.#store.failExternalAction(navigation.pendingId);
    this.#emit();
    return false;
  }

  async #run(navigation: Navigation): Promise<boolean> {
    if (!this.#owns(navigation)) { this.#emit(); return false; }
    this.#state = { status: "running" };
    this.#emit();
    // Start observers may recover the lease, edit, or load another document.
    if (!this.#owns(navigation)) return false;
    // An uncertain retry must still resolve the original request. New local
    // inputs prohibit adoption below, not the owner's idempotent replay.
    if (!navigation.uncertain && !this.#unchanged(navigation)) return this.#rejected(navigation, "Der Editorstand hat sich inzwischen geändert. Bitte offene Änderungen prüfen.");
    let result: ExternalHistoryResult;
    try {
      result = await navigation.runner({ entryId: navigation.entryId, direction: navigation.direction, versions: navigation.versions, uncertain: navigation.uncertain });
    } catch (error) {
      if (!this.#owns(navigation)) return false;
      return this.#unresolved(navigation, error instanceof Error ? error.message : "Der Serverstand ist unklar. Bitte erneut prüfen.");
    }
    if (!this.#owns(navigation)) return false;
    if (result === null || typeof result !== "object" || !["committed", "rejected", "unknown"].includes(result.status)) {
      return this.#unresolved(navigation, "Der Server hat keine gültige Bestätigung geliefert.");
    }
    if (result.status !== "committed") {
      if (typeof result.message !== "string") return this.#unresolved(navigation, "Der Server hat keine gültige Bestätigung geliefert.");
      if (result.status === "unknown" || navigation.uncertain) return this.#unresolved(navigation, result.message);
      return this.#rejected(navigation, result.message);
    }
    const base = navigation.versions;
    const document = result.document === undefined ? navigation.document : result.document;
    if (!Number.isSafeInteger(result.pageVersion) || result.pageVersion !== base.pageVersion + 1 ||
        base.themeVersion === null || !Number.isSafeInteger(result.themeVersion) || result.themeVersion !== base.themeVersion + 1 ||
        (result.registryVersion !== undefined && (!Number.isSafeInteger(result.registryVersion) || result.registryVersion < (base.registryVersion ?? 0) ||
          (result.registryVersion !== base.registryVersion && result.document === undefined)))) {
      return this.#unresolved(navigation, "Der Server hat den Folgestand nicht vollständig bestätigt.");
    }
    if (!this.#unchanged(navigation)) {
      return this.#unresolved(navigation, "Der Editorstand hat sich inzwischen geändert. Bitte offene Änderungen prüfen.");
    }
    try {
      if (!Array.isArray(document.styleRules) || validateDocument(document).length > 0) return this.#unresolved(navigation, "Der bestätigte Editorstand ist ungültig.");
      if (JSON.stringify(document.styleRules) !== JSON.stringify(navigation.document.styleRules) &&
          (result.registryVersion === undefined || result.registryVersion <= (base.registryVersion ?? 0))) {
        return this.#unresolved(navigation, "Der geänderte Klassenstand wurde nicht bestätigt.");
      }
    } catch {
      return this.#unresolved(navigation, "Der bestätigte Editorstand ist ungültig.");
    }
    // Suppress intermediate session projections: observers see the adopted
    // versions and the moved cursor together, after the store commit.
    this.isCommitting = true;
    try {
      this.#navigation = null;
      this.#state = { status: "idle" };
      if (!this.#pipeline.confirmExternalNavigation(navigation.pendingId, navigation.entryId, navigation.direction, document, base, {
        pageVersion: result.pageVersion, themeVersion: result.themeVersion, registryVersion: result.registryVersion ?? base.registryVersion,
      })) {
        this.#navigation = navigation;
        return this.#unresolved(navigation, "Der Editorstand kann nicht übernommen werden.");
      }
    } finally {
      this.isCommitting = false;
      this.#emit();
    }
    return true;
  }

  dispose(): void {
    this.#disposed = true;
    this.#runners.clear();
    this.#navigation = null;
  }
}
