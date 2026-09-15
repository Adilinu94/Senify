import { SenifyError } from "@senify/core";

export type RateLimitConfig = {
  perMinute: number;
  burst: number;
  destructivePerMinute: number;
};

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  perMinute: 60,
  burst: 20,
  destructivePerMinute: 10,
};

export class RateLimitError extends SenifyError {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number, suggestion: string) {
    super("auth", message, { suggestion });
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type Bucket = {
  tokens: number;
  updatedAt: number;
};

// Token bucket per token: capacity = burst, refill = perMinute/60s.
// Destructive operations use their own, stricter bucket.
export class RateLimiter {
  readonly #config: RateLimitConfig;
  readonly #now: () => number;
  readonly #buckets = new Map<string, Bucket>();

  constructor(
    config: RateLimitConfig = DEFAULT_RATE_LIMITS,
    now: () => number = () => Date.now(),
  ) {
    this.#config = config;
    this.#now = now;
  }

  check(tokenId: string, destructive: boolean): void {
    this.#consume(
      `${tokenId}:default`,
      this.#config.burst,
      this.#config.perMinute,
      `Rate limit exceeded (${this.#config.perMinute} requests/minute)`,
    );
    if (destructive) {
      this.#consume(
        `${tokenId}:destructive`,
        this.#config.destructivePerMinute,
        this.#config.destructivePerMinute,
        `Too many destructive requests (${this.#config.destructivePerMinute}/minute)`,
      );
    }
  }

  #consume(
    key: string,
    capacity: number,
    perMinute: number,
    message: string,
  ): void {
    const now = this.#now();
    const refillPerMs = perMinute / 60_000;
    const bucket = this.#buckets.get(key) ?? {
      tokens: capacity,
      updatedAt: now,
    };
    const elapsed = Math.max(0, now - bucket.updatedAt);
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      this.#buckets.set(key, bucket);
      const waitMs = (1 - bucket.tokens) / refillPerMs;
      throw new RateLimitError(
        message,
        Math.max(1, Math.ceil(waitMs / 1000)),
        "Wait for the retry-after seconds and repeat the call.",
      );
    }
    bucket.tokens -= 1;
    this.#buckets.set(key, bucket);
  }
}
