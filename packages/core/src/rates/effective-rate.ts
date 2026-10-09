import { type Money, type RoundingMode, divideAndRound, money } from "@fairhour/money";
import { InvalidDurationError } from "../errors";

const SECONDS_PER_HOUR = 3600n;

/**
 * What a project really paid per hour: `revenue / (seconds / 3600)`, rounded to the currency's
 * minor units with the given mode. Exact integer arithmetic (`revenue × 3600 / seconds`).
 *
 * Returns `null`, never infinity, when no time was tracked (`seconds` is zero).
 * @throws InvalidDurationError when `seconds` is negative
 */
export function effectiveHourlyRate(
  revenue: Money,
  seconds: bigint,
  rounding: RoundingMode,
): Money | null {
  if (seconds < 0n) throw new InvalidDurationError();
  if (seconds === 0n) return null;
  return money(
    divideAndRound(revenue.amount * SECONDS_PER_HOUR, seconds, rounding),
    revenue.currency,
  );
}
