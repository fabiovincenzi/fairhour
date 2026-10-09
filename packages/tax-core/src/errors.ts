import type { InputIssue } from "./pack/types";
import type { IsoDate, LocaleTag, RuleId } from "./primitives";

export type TaxEngineErrorCode =
  | "invalid-input"
  | "invalid-config"
  | "invalid-options"
  | "unsupported-input"
  | "parameters-not-found"
  | "rule-failed"
  | "rule-contract-violated"
  | "reconciliation-failed"
  | "missing-message"
  | "message-format"
  | "invalid-iso-date";

/** From zod or the engine's own validation: English, developer-facing. */
export interface SchemaIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
}

/** Base class of every error thrown by the engine. */
export abstract class TaxEngineError extends Error {
  abstract readonly code: TaxEngineErrorCode;
}

function describeIssues(
  issues: readonly { readonly path: readonly (string | number)[]; readonly code: string }[],
): string {
  const shown = issues
    .slice(0, 5)
    .map((issue) => `${issue.code} at ${issue.path.length > 0 ? issue.path.join(".") : "(root)"}`);
  const more = issues.length > 5 ? `, and ${issues.length - 5} more` : "";
  return `${shown.join("; ")}${more}`;
}

export class InvalidInputError extends TaxEngineError {
  override readonly name = "InvalidInputError";
  readonly code = "invalid-input";
  readonly issues: readonly SchemaIssue[];
  constructor(issues: readonly SchemaIssue[]) {
    super(`Invalid invoice input: ${describeIssues(issues)}`);
    this.issues = issues;
  }
}

export class InvalidConfigError extends TaxEngineError {
  override readonly name = "InvalidConfigError";
  readonly code = "invalid-config";
  readonly issues: readonly SchemaIssue[];
  constructor(issues: readonly SchemaIssue[]) {
    super(`Invalid tax pack configuration: ${describeIssues(issues)}`);
    this.issues = issues;
  }
}

export class InvalidOptionsError extends TaxEngineError {
  override readonly name = "InvalidOptionsError";
  readonly code = "invalid-options";
  readonly issues: readonly SchemaIssue[];
  constructor(issues: readonly SchemaIssue[]) {
    super(`Invalid invoice options: ${describeIssues(issues)}`);
    this.issues = issues;
  }
}

/** The pack refuses an input it does not model (localizable issues). */
export class UnsupportedInputError extends TaxEngineError {
  override readonly name = "UnsupportedInputError";
  readonly code = "unsupported-input";
  readonly issues: readonly InputIssue[];
  constructor(issues: readonly InputIssue[]) {
    super(`The tax pack does not support this input: ${describeIssues(issues)}`);
    this.issues = issues;
  }
}

export class ParameterNotFoundError extends TaxEngineError {
  override readonly name = "ParameterNotFoundError";
  readonly code = "parameters-not-found";
  readonly packId: string;
  readonly date: IsoDate;
  /** The first version's start date; undefined only when the pack has no parameter version. */
  readonly firstEffectiveFrom: IsoDate | undefined;
  constructor(packId: string, date: IsoDate, firstEffectiveFrom: IsoDate | undefined) {
    super(
      firstEffectiveFrom === undefined
        ? `Tax pack "${packId}" has no parameter versions`
        : `Tax pack "${packId}" has no parameters for ${date}: the first version starts on ${firstEffectiveFrom}`,
    );
    this.packId = packId;
    this.date = date;
    this.firstEffectiveFrom = firstEffectiveFrom;
  }
}

/** A rule threw: a bug in the pack. */
export class RuleExecutionError extends TaxEngineError {
  override readonly name = "RuleExecutionError";
  readonly code = "rule-failed";
  readonly ruleId: RuleId;
  override readonly cause: unknown;
  constructor(ruleId: RuleId, cause: unknown) {
    const detail =
      cause instanceof Error ? `${cause.name}: ${cause.message}` : "a non-Error value was thrown";
    super(`Rule "${ruleId}" failed: ${detail}`, { cause });
    this.ruleId = ruleId;
    this.cause = cause;
  }
}

/** Why a rule's output was rejected by the engine (design 4.7) or the engine's own checks. */
export type RuleContractReason =
  | "invalid-output"
  | "invalid-group"
  | "invalid-line-assignment"
  | "invalid-component"
  | "invalid-allocations"
  | "invalid-legal-note"
  | "invalid-warning"
  | "invalid-trace"
  | "duplicate-id"
  | "unknown-fact"
  | "invalid-fact"
  | "invalid-sources"
  | "missing-trace"
  | "unassigned-line"
  | "invalid-rounding-policy";

/** A rule's output broke the merge contract: a bug in the pack. */
export class RuleContractError extends TaxEngineError {
  override readonly name = "RuleContractError";
  readonly code = "rule-contract-violated";
  /** The offending rule, or "core" for the engine's own checks. */
  readonly ruleId: RuleId;
  readonly reason: RuleContractReason;
  constructor(ruleId: RuleId, reason: RuleContractReason, detail: string) {
    super(`Rule "${ruleId}" violated the engine contract (${reason}): ${detail}`);
    this.ruleId = ruleId;
    this.reason = reason;
  }
}

/** A reconciliation identity (R1 to R8) does not hold: a bug in the pack or the engine. */
export class ReconciliationError extends TaxEngineError {
  override readonly name = "ReconciliationError";
  readonly code = "reconciliation-failed";
  readonly check: string;
  readonly expected: string;
  readonly actual: string;
  constructor(check: string, expected: string, actual: string, detail: string) {
    super(`Reconciliation ${check} failed: ${detail} (expected ${expected}, actual ${actual})`);
    this.check = check;
    this.expected = expected;
    this.actual = actual;
  }
}

export class MissingMessageError extends TaxEngineError {
  override readonly name = "MissingMessageError";
  readonly code = "missing-message";
  readonly key: string;
  readonly locale: LocaleTag;
  constructor(key: string, locale: LocaleTag) {
    super(`Message "${key}" is missing (locale "${locale}", fallback "en")`);
    this.key = key;
    this.locale = locale;
  }
}

export class MessageFormatError extends TaxEngineError {
  override readonly name = "MessageFormatError";
  readonly code = "message-format";
  readonly key: string;
  readonly reason: string;
  constructor(key: string, reason: string) {
    super(`Message "${key}" cannot be formatted: ${reason}`);
    this.key = key;
    this.reason = reason;
  }
}

export class InvalidIsoDateError extends TaxEngineError {
  override readonly name = "InvalidIsoDateError";
  readonly code = "invalid-iso-date";
  /** `value` is unknown: JavaScript callers may pass anything. */
  constructor(value: unknown) {
    super(
      `Expected an ISO date "YYYY-MM-DD" between 1900-01-01 and 9999-12-31, got ${JSON.stringify(String(value).slice(0, 32))}`,
    );
  }
}
