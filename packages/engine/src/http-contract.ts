// Der Vertrag der HTTP-Schicht: der Kontext, den eine Route bekommt, die Form
// einer Route und die Form ihrer Antwort. Die Routen liegen in
// `http-routes-*.ts`, der Dispatcher in `http.ts`; dieses Modul ist, was
// beide sprechen (ADR-0019).

import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { Registry } from "@senify/section-sdk";
import { PageLocks } from "./locks.ts";
import { EngineEvents } from "./events.ts";
import type { ImportPreviewDriver } from "./import-preview.ts";
import { RateLimiter } from "./rate-limit.ts";
import { Store } from "./store.ts";
import { MaintenanceGate } from "./maintenance.ts";
import type { ReviewVisualDriver } from "./review-visuals.ts";
import type { MailSender } from "./mailer.ts";
import type { FormSigner } from "./forms.ts";
import type { ReferenceDeps } from "./references-lifecycle.ts";
import type { ReferenceDiffDeps } from "./reference-visual-diff.ts";
import type { UploadSigner } from "./media.ts";
import type {
  TokenKind,
  TokenScope,
} from "./types.ts";

export type EngineContext = {
  store: Store;
  registry: Registry;
  locks: PageLocks;
  rateLimiter: RateLimiter;
  // Live events (ticket 05): the in-process bus behind GET /api/events. Write
  // handlers publish, the SSE route subscribes.
  events: EngineEvents;
  // Maintenance window (T12 restore): blocks requests while it runs.
  maintenance: MaintenanceGate;
  dataDir: string;
  maxUploadBytes: number;
  uploadSigner: UploadSigner;
  // Forms (T11): the token signer and a per-IP limiter for the public endpoint.
  formSigner: FormSigner;
  formRateLimiter: RateLimiter;
  formBaseUrl?: string;
  // Settings (T12): the mail sender used for test mails and the outbox. Tests
  // inject a double so no run ever talks to a real SMTP server.
  mailSender?: MailSender;
  // References (T14): the injected capture/analyzer dependencies. Without them
  // the live Playwright path and the heuristic analyzer are used.
  referenceDeps?: ReferenceDeps;
  // Reference visual diff (E26 slice 2): capture + differ of the
  // reference-against-draft comparison. Off unless injected (visual tests);
  // production lazily loads the analysis-worker harness.
  referenceDiffs?: ReferenceDiffDeps;
  // Review visuals (T07): the injected capture driver of a submit.
  visuals?: ReviewVisualDriver;
  // The import preview: the injected photographer. Absent = the Playwright
  // thumbnail capture of the analysis worker.
  importPreview?: ImportPreviewDriver;
};

export type AuthInfo = {
  tokenId: string;
  tokenName: string;
  kind: TokenKind;
  scopes: TokenScope[];
};

export type RouteResult = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  // Server-Sent Events (ticket 05): the handler returns an opener instead of a
  // body; the dispatcher writes the headers and keeps the response open until
  // the client disconnects (the opener returns its cleanup).
  stream?: {
    contentType: string;
    open: (res: ServerResponse) => () => void;
  };
  // Plain-text response (CSV export).
  text?: {
    contentType: string;
    body: string;
  };
  // 303 to a page: the no-JavaScript path after a form submit or newsletter
  // confirmation.
  redirect?: string;
  file?: {
    path: string;
    contentType?: string;
    headers?: Record<string, string>;
  };
};

export type RouteParams = Record<string, string>;

export type Route = {
  method: string;
  segments: string[];
  public?: boolean;
  // Token management is an operator capability, not a public bootstrap.
  operatorOnly?: boolean;
  scope?: TokenScope;
  destructive?: boolean;
  // Ausgelieferte Dateien (Bilder einer Referenz) laufen nicht in die
  // Drosselung: eine Uebersicht laedt leicht mehr als 60 Bilder je Minute.
  rateLimit?: boolean;
  // Health and the restore itself stay reachable during a maintenance window;
  // the restore acquires the gate from its handler.
  maintenanceExempt?: boolean;
  handler: (
    context: EngineContext,
    params: RouteParams,
    req: IncomingMessage,
    url: URL,
    auth: AuthInfo | undefined,
  ) => Promise<RouteResult>;
};
