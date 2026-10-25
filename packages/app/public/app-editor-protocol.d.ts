// Typen fuer `app-editor-protocol.js`.
//
// Die App-Module in `public/` sind reines JavaScript ohne Typen - sie laufen
// im Browser, nicht durch `tsc`. Dieses eine Modul wird aber von einem
// Vitest-Test direkt importiert (der Rest der Oberflaeche laeuft nur im
// Browser), und ohne Deklaration waere der Import `any`. Das ist genau die
// Sorte `any`, die einen Tippfehler erst im Testlauf auffallen laesst.

/** Ein Element des schlanken DOM-Vertrags, soweit das Modul es braucht. */
export type ProtocolElement = {
  hidden: boolean;
  text?: string;
  children?: ProtocolElement[];
  append(child: ProtocolElement): void;
  replaceChildren(...children: ProtocolElement[]): void;
};

export type ProtocolRow = {
  actor: string;
  action: string;
  time: string;
};

export type CreateProtocolLogOptions = {
  /** Das Dokument (wird derzeit nicht gelesen, bleibt fuer die Naht). */
  doc: unknown;
  /** Das Element-Werkzeug der Oberflaeche (`el`). */
  el: (tag: string, spec?: Record<string, unknown>, ...children: ProtocolElement[]) => ProtocolElement;
  /** Wohin das Panel gehaengt wird. */
  host: { append(child: ProtocolElement): void };
  /** Uebersetzung der Mutations-Namen. */
  labels: Record<string, string>;
  /** Die Uhr - herein gereicht, damit ein Test sie festhalten kann. */
  clock: () => Date;
};

export type ProtocolLog = {
  element: ProtocolElement;
  log(payload: { actor?: { label?: string }; action?: string }): void;
  rows(): ProtocolRow[];
};

export function createProtocolLog(options: CreateProtocolLogOptions): ProtocolLog;
