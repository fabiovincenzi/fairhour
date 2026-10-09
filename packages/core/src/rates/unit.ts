import type { Price } from "@fairhour/money";

/**
 * What a rate is per. An hourly rate and a day rate are different numbers (€80 an hour, €560 a
 * day): they are never converted into each other, and one is never used for the other.
 */
export type RateUnit = "hour" | "day";

/** A rate as configured on a task, project, client or workspace: an amount per hour or per day. */
export interface UnitRate {
  readonly unit: RateUnit;
  readonly price: Price;
}
