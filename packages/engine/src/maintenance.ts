import { SenifyError } from "@senify/core";

// Global lock for maintenance windows (T12 restore): while an exclusive task
// runs, new requests are turned away with 503 and running requests finish
// first, so tables and the data directory are swapped without concurrent
// readers or writers. The exclusive task itself (the restore request) never
// holds a slot, so it cannot wait for itself.

export class MaintenanceError extends SenifyError {
  constructor() {
    super(
      "conflict",
      "Wartung läuft: Die Wiederherstellung ersetzt gerade den Datenbestand",
      {
        field: "maintenance",
        suggestion: "Kurz warten und den Vorgang danach erneut versuchen.",
      },
    );
    this.name = "MaintenanceError";
  }
}

export class MaintenanceGate {
  #active = false;
  #inFlight = 0;
  #idleWaiters: (() => void)[] = [];
  #tail: Promise<unknown> = Promise.resolve();

  get active(): boolean {
    return this.#active;
  }

  // Every ordinary request holds one slot until it is done; while maintenance
  // is active the gate stays closed.
  enter(): () => void {
    if (this.#active) throw new MaintenanceError();
    this.#inFlight += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#inFlight -= 1;
      if (this.#inFlight === 0) {
        for (const resolve of this.#idleWaiters.splice(0)) resolve();
      }
    };
  }

  // Exclusive tasks queue up behind each other; each waits for the running
  // requests, then closes the gate for its own duration.
  runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      this.#active = true;
      try {
        await this.#idle();
        return await task();
      } finally {
        this.#active = false;
      }
    };
    const result = this.#tail.then(run, run);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #idle(): Promise<void> {
    if (this.#inFlight === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.#idleWaiters.push(resolve);
    });
  }
}
