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
};

export class SenifyError extends Error {
  readonly category: ErrorCategory;
  readonly suggestion: string | undefined;
  readonly field: string | undefined;
  readonly opIndex: number | undefined;

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
  }
}
