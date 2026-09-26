// Live events (ticket 05): the engine publishes what changes, the program and
// the editor follow over SSE.
//
// The bus lives in the engine process (one engine, one bus) and stays tiny on
// purpose: `publish` fans out to the open streams, `openStream` writes one SSE
// response filtered by site. The route (`GET /api/events`) returns the opener
// through `RouteResult.stream`, so the dispatcher keeps the connection open
// while the ordinary JSON path stays untouched.

import type { ServerResponse } from "node:http";
import type { AuthorInput } from "./mutations/contract.ts";

export type EngineEventKind =
  | "page.created"
  | "draft.changed"
  | "asset.uploaded"
  | "release.published"
  // Re-bake worker (E12): the outcome of a content re-bake; the job id and the
  // reason travel in `action`, the editor reads the details from the job list.
  | "bake.done"
  | "bake.failed"
  // Deploy (E14): a deployment finished; `action` carries its status.
  | "deploy.finished";

export type EngineEvent = {
  kind: EngineEventKind;
  siteId: string;
  pageId?: string;
  // The nodes the change touched (mutations), so the editor can flash them.
  nodeIds?: string[];
  // The first mutation's op - a short "what happened" for the protocol.
  action?: string;
  actor?: AuthorInput;
  at: string;
};

export type EngineEventInput = Omit<EngineEvent, "at"> & { at?: string };

// The heartbeat keeps proxies from closing an idle stream; the client ignores
// comments.
const HEARTBEAT_MS = 15000;

export class EngineEvents {
  readonly #listeners = new Set<(event: EngineEvent) => void>();

  publish(input: EngineEventInput): EngineEvent {
    const event: EngineEvent = { ...input, at: input.at ?? new Date().toISOString() };
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch {
        // A broken stream must never break the write that published the event.
      }
    }
    return event;
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  // Writes one SSE stream for the given site filter (empty = every site). The
  // dispatcher has already written the headers; the returned function closes
  // the stream and detaches the listener.
  openStream(res: ServerResponse, siteId: string): () => void {
    res.write("retry: 3000\n\n");
    const listener = (event: EngineEvent): void => {
      if (siteId !== "" && event.siteId !== siteId) return;
      res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = this.subscribe(listener);
    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, HEARTBEAT_MS);
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    };
    res.on("close", close);
    return close;
  }
}
