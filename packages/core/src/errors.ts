export type ErrorCategory =
  | "validation"
  | "guardrail"
  | "conflict"
  | "auth"
  | "not_found";

// One failed check of a guardrail that blocks on a list. The message names
// the first issue for a human reader; the list is what an agent or the
// dashboard needs to fix everything in one pass.
export type ErrorIssue = {
  code: string;
  severity: string;
  message: string;
  field?: string;
  suggestion?: string;
};

export type SenifyErrorDetails = {
  suggestion?: string;
  field?: string;
  opIndex?: number;
  // The version the server is on, when it refuses a write because the
  // client's base version is stale. Without it the client can only guess: it
  // cannot resend against the current state, and the retry loop never ends.
  currentVersion?: number;
  issues?: readonly ErrorIssue[];
};

export class SenifyError extends Error {
  readonly category: ErrorCategory;
  readonly suggestion: string | undefined;
  readonly field: string | undefined;
  readonly opIndex: number | undefined;
  readonly currentVersion: number | undefined;
  readonly issues: readonly ErrorIssue[] | undefined;

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
    this.issues = details.issues;
  }
}
