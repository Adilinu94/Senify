export type ErrorCategory =
  | "validation"
  | "guardrail"
  | "conflict"
  | "auth"
  | "not_found";

export type SenifyErrorDetails = {
  suggestion?: string;
  field?: string;
  opIndex?: number;
  // The version the server is on, when it refuses a write because the
  // client's base version is stale. Without it the client can only guess: it
  // cannot resend against the current state, and the retry loop never ends.
  currentVersion?: number;
};

export class SenifyError extends Error {
  readonly category: ErrorCategory;
  readonly suggestion: string | undefined;
  readonly field: string | undefined;
  readonly opIndex: number | undefined;
  readonly currentVersion: number | undefined;

  constructor(
    category: ErrorCategory,
    message: string,
    details: SenifyErrorDetails = {},
  ) {
    super(message);
    this.name = "SenifyError";
    this.category = category;
    this.suggestion = details.suggestion;
    this.field = details.field;
    this.opIndex = details.opIndex;
    this.currentVersion = details.currentVersion;
  }
}
