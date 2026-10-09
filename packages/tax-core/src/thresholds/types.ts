import type { CurrencyCode, Decimal, Money } from "@fairhour/money";
import type { InvoiceComputation, TraceStep, Warning } from "../computation/types";
import type { MessageRef } from "../messages/types";
import type { IsoDate } from "../primitives";
import type { SourceRef } from "../sources";

export interface RevenueReceipt {
  readonly date: IsoDate; // collection date (cash basis)
  /** The countable part of what was collected, see countableRevenue and proRata. */
  readonly amount: Money;
  readonly reference?: string;
}

export interface RevenueTrackerInput {
  readonly year: number;
  readonly currency: CurrencyCode;
  readonly receipts: readonly RevenueReceipt[];
  /** First day of activity, when it falls in `year` (thresholds may be pro-rated). */
  readonly activityStartDate?: IsoDate;
  /** Injected "today" (purity): receipts after it are ignored. */
  readonly asOf: IsoDate;
}

export type RevenueStatusKind =
  "not-applicable" | "ok" | "approaching" | "exceeded" | "immediate-exit";

/** Status kinds from least to most severe ("not-applicable" first). */
export const REVENUE_STATUS_ORDER: readonly RevenueStatusKind[] = Object.freeze([
  "not-applicable",
  "ok",
  "approaching",
  "exceeded",
  "immediate-exit",
]);

export interface RevenueThresholdStatus {
  readonly id: string; // "it.forfettario.ceiling"
  readonly label: MessageRef;
  readonly limit: Money;
  /** total / limit, 4 decimals, halfUp. */
  readonly ratio: Decimal;
  /** Date of the receipt that first made the total exceed the limit. */
  readonly crossedOn?: IsoDate;
  readonly sources: readonly SourceRef[];
}

export interface RevenueStatus {
  readonly status: RevenueStatusKind;
  readonly year: number;
  readonly total: Money;
  readonly thresholds: readonly RevenueThresholdStatus[];
  readonly parameters: { readonly id: string; readonly effectiveFrom: IsoDate };
  readonly explanation: readonly TraceStep[];
  readonly warnings: readonly Warning[];
}

export interface AnnualThresholdsCapability<C> {
  /** The amount of an invoice that counts as revenue once it is fully collected. */
  readonly countableRevenue: (config: C, computation: InvoiceComputation) => Money;
  readonly evaluate: (config: C, input: RevenueTrackerInput) => RevenueStatus;
}
