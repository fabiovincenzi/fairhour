import {
  type Decimal,
  type Money,
  compareDecimal,
  decimal,
  decimalEquals,
  decimalFromInteger,
  divideDecimal,
  signDecimal,
  subtract,
} from "@fairhour/money";
import { InvalidBudgetError, InvalidDurationError } from "../errors";

/** A budget in hours (stored as whole seconds) or in money. */
export interface HoursBudget {
  readonly kind: "hours";
  readonly seconds: bigint;
}
export interface AmountBudget {
  readonly kind: "amount";
  readonly amount: Money;
}
export type Budget = HoursBudget | AmountBudget;

/** Alert at 80% and at 100% of the budget. */
export const DEFAULT_BUDGET_THRESHOLDS: readonly Decimal[] = Object.freeze([
  decimal("0.8"),
  decimal("1"),
]);

/** Decimals of the ratios `budgetStatus` and `estimateVsActual` report. */
export const RATIO_SCALE = 4;

interface BudgetStatusBase {
  /**
   * `consumed / budget` as an exact decimal **truncated** (toward zero) to `RATIO_SCALE` = 4
   * places, so `0.7999` never reads as `0.8` before the 80% alert fires. Thresholds are compared
   * exactly, never on this rounded value.
   */
  readonly ratio: Decimal;
  /** The thresholds that `consumed` has reached (`consumed / budget >= threshold`), ascending. */
  readonly crossed: readonly Decimal[];
}

export interface HoursBudgetStatus extends BudgetStatusBase {
  readonly kind: "hours";
  /** All in whole seconds. `remaining` is negative once the budget is overrun. */
  readonly budget: bigint;
  readonly consumed: bigint;
  readonly remaining: bigint;
}

export interface AmountBudgetStatus extends BudgetStatusBase {
  readonly kind: "amount";
  readonly budget: Money;
  readonly consumed: Money;
  /** Negative once the budget is overrun. */
  readonly remaining: Money;
}

export type BudgetStatus = HoursBudgetStatus | AmountBudgetStatus;

export interface HoursBudgetInput {
  readonly budget: HoursBudget;
  /** Tracked seconds. */
  readonly consumed: bigint;
  readonly thresholds?: readonly Decimal[];
}

export interface AmountBudgetInput {
  readonly budget: AmountBudget;
  /** Billed (or billable) amount, in the budget's currency. */
  readonly consumed: Money;
  readonly thresholds?: readonly Decimal[];
}

export type BudgetStatusInput = HoursBudgetInput | AmountBudgetInput;

function isHoursInput(input: BudgetStatusInput): input is HoursBudgetInput {
  return input.budget.kind === "hours";
}

/** Thresholds must be positive; they are sorted and deduplicated by value. */
function normalizeThresholds(thresholds: readonly Decimal[]): Decimal[] {
  const sorted = [...thresholds].sort(compareDecimal);
  for (const threshold of sorted) {
    if (signDecimal(threshold) <= 0) throw new InvalidBudgetError("invalid-threshold");
  }
  return sorted.filter((threshold, index) => {
    const previous = sorted[index - 1];
    return previous === undefined || !decimalEquals(previous, threshold);
  });
}

/** `consumed / budget >= threshold`, exactly, on integer units (seconds or minor units). */
function reaches(consumed: bigint, budget: bigint, threshold: Decimal): boolean {
  return consumed * 10n ** BigInt(threshold.scale) >= threshold.coefficient * budget;
}

function analyse(
  consumed: bigint,
  budget: bigint,
  thresholds: readonly Decimal[],
): BudgetStatusBase {
  if (budget <= 0n) throw new InvalidBudgetError("non-positive-budget");
  if (consumed < 0n) throw new InvalidBudgetError("negative-consumed");
  return {
    ratio: divideDecimal(
      decimalFromInteger(consumed),
      decimalFromInteger(budget),
      RATIO_SCALE,
      "down",
    ),
    crossed: normalizeThresholds(thresholds).filter((threshold) =>
      reaches(consumed, budget, threshold),
    ),
  };
}

/**
 * How much of a project's budget has been used (CORE-006): consumed, remaining (negative when
 * over budget), the ratio and the alert thresholds reached. Thresholds default to 80% and 100%
 * and can be anything positive (`"0.5"`, `"1.2"`); the result lists the reached ones ascending.
 * @throws InvalidBudgetError (budget not positive, consumed negative, a threshold not positive),
 *         CurrencyMismatchError (an amount consumed in another currency than the budget)
 */
export function budgetStatus(input: HoursBudgetInput): HoursBudgetStatus;
export function budgetStatus(input: AmountBudgetInput): AmountBudgetStatus;
export function budgetStatus(input: BudgetStatusInput): BudgetStatus;
export function budgetStatus(input: BudgetStatusInput): BudgetStatus {
  const thresholds = input.thresholds ?? DEFAULT_BUDGET_THRESHOLDS;
  if (isHoursInput(input)) {
    const { seconds } = input.budget;
    return {
      kind: "hours",
      budget: seconds,
      consumed: input.consumed,
      remaining: seconds - input.consumed,
      ...analyse(input.consumed, seconds, thresholds),
    };
  }
  const { amount } = input.budget;
  return {
    kind: "amount",
    budget: amount,
    consumed: input.consumed,
    remaining: subtract(amount, input.consumed),
    ...analyse(input.consumed.amount, amount.amount, thresholds),
  };
}

export interface EstimateVsActual {
  readonly estimateSeconds: bigint;
  readonly actualSeconds: bigint;
  /** `actual - estimate`: positive when the task took longer than estimated. */
  readonly varianceSeconds: bigint;
  /** `actual / estimate` truncated to `RATIO_SCALE` places; `null` when the estimate is zero. */
  readonly ratio: Decimal | null;
  readonly status: "under" | "on" | "over";
}

/**
 * Compares a task's estimate with the time actually tracked on it. `under`/`on`/`over` refer to
 * the exact seconds (`on` means equal).
 * @throws InvalidDurationError for a negative estimate or actual
 */
export function estimateVsActual(estimateSeconds: bigint, actualSeconds: bigint): EstimateVsActual {
  if (estimateSeconds < 0n || actualSeconds < 0n) throw new InvalidDurationError();
  const variance = actualSeconds - estimateSeconds;
  return {
    estimateSeconds,
    actualSeconds,
    varianceSeconds: variance,
    ratio:
      estimateSeconds === 0n
        ? null
        : divideDecimal(
            decimalFromInteger(actualSeconds),
            decimalFromInteger(estimateSeconds),
            RATIO_SCALE,
            "down",
          ),
    status: variance < 0n ? "under" : variance > 0n ? "over" : "on",
  };
}
