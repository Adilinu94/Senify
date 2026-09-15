type LockBucket = {
  tail: Promise<void>;
  count: number;
};

export class PageLocks {
  readonly #tails = new Map<string, LockBucket>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    let bucket = this.#tails.get(key);
    if (!bucket) {
      bucket = { tail: Promise.resolve(), count: 0 };
      this.#tails.set(key, bucket);
    }
    const active = bucket;
    const previousTail = active.tail;
    let settle!: () => void;
    const gate = new Promise<void>((resolve) => {
      settle = resolve;
    });
    active.tail = previousTail.then(() => gate);
    active.count += 1;
    await previousTail.catch(() => undefined);
    try {
      return await task();
      // Note: locks are not reentrant — awaiting run() with the same key
      // from inside its own task deadlocks by design (single writer per page).
    } finally {
      settle();
      active.count -= 1;
      if (active.count <= 0 && this.#tails.get(key) === active) {
        this.#tails.delete(key);
      }
    }
  }
}
