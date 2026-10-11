import type { CurrencyCode, Decimal, Price, RoundingMode } from "@fairhour/money";
import type {
  ClientInput,
  ExchangeRecord,
  InvoiceInput,
  IsoDate,
  LineTaxTreatment,
} from "@fairhour/tax-core";
import type { BillingMode } from "../rates/billing";
import type { DurationRounding } from "../time/duration";

/**
 * One tracked, billable time entry as the invoice draft builder sees it. The caller maps its
 * database rows to this shape and passes only the entries it means to invoice (the client's
 * billable entries); the builder selects the ones that fall in the period.
 */
export interface BillableEntry {
  /** 1 to 48 characters among `A-Z a-z 0-9 . _ -`: ids become part of the line ids. */
  readonly id: string;
  readonly projectId: string;
  readonly taskId?: string;
  /** Shown on task lines ("Project - Task"); without it a task line is described by its project. */
  readonly taskName?: string;
  readonly description: string;
  /** UTC instants, ISO 8601 with `Z` or an offset (`2026-03-02T08:00:00Z`). */
  readonly start: string;
  /** `null` while the entry is running: a running entry cannot be invoiced. */
  readonly end: string | null;
  /**
   * The rate already resolved by `resolveRate` (task > project > client > workspace), per the
   * unit of the project's billing mode (`billingRateUnit`): per hour for `hourly`, per day for
   * `day-rate`. Not needed for `fixed` projects. A price in another currency than the invoice is
   * converted with an explicit exchange rate.
   */
  readonly rate?: Price;
}

/** How a project bills its entries. */
export interface ProjectBilling {
  /** 1 to 48 characters among `A-Z a-z 0-9 . _ -`. */
  readonly id: string;
  readonly name: string;
  readonly mode: BillingMode;
  readonly rounding: DurationRounding;
  /** Apply duration rounding to each entry (default) or to each line's total. */
  readonly roundingScope: "entry" | "line";
}

/** A line that is not tracked time. Prices are in any currency with an explicit exchange rate. */
export type ExtraLine =
  | {
      readonly kind: "expense" | "reimbursement" | "goods";
      readonly id: string;
      readonly description: string;
      readonly quantity: Decimal;
      readonly unitPrice: Price;
      /** Defaults to `standard`; to `excluded` for a reimbursement. */
      readonly treatment?: LineTaxTreatment;
    }
  | {
      readonly kind: "mileage";
      readonly id: string;
      readonly description: string;
      readonly kilometres: Decimal;
      readonly ratePerKm: Price;
    };

export type InvoiceGrouping = "project" | "task" | "entry" | "single";

export interface InvoiceDraftOptions {
  readonly issueDate: IsoDate;
  /** Local dates, inclusive, interpreted in `timeZone`. */
  readonly period: { readonly from: IsoDate; readonly to: IsoDate };
  /** IANA time zone in which the period and the days of day-rate work are measured. */
  readonly timeZone: string;
  readonly grouping: InvoiceGrouping;
  /** Decimals of the hour quantities on the invoice (2 is customary). */
  readonly hoursScale: 2 | 3 | 4;
  /** How hours are rounded to `hoursScale` decimals. Default `halfUp`. */
  readonly hoursRounding?: RoundingMode;
  /** The invoice currency (the client's currency). */
  readonly currency: CurrencyCode;
  /**
   * Explicit exchange rates, one per currency: `rate` units of `currency` per 1 unit of `from`.
   * The ones that were needed are recorded on `input.exchangeRates`.
   */
  readonly exchangeRates?: readonly ExchangeRecord[];
  readonly client: ClientInput;
  readonly extraLines?: readonly ExtraLine[];
  /** Per-invoice pack options, passed through untouched. */
  readonly packOptions?: InvoiceInput["options"];
}

/** The entries behind an invoice line, in chronological order (none for an extra line). */
export interface LineProvenance {
  readonly lineId: string;
  readonly entryIds: readonly string[];
}

/** Something the builder changed on the way, so that the user can see and explain it. */
export type DraftAdjustment =
  | {
      /** An entry's duration was rounded by its project's rounding rule (scope `entry`). */
      readonly kind: "duration-rounded";
      readonly entryId: string;
      readonly fromSeconds: bigint;
      readonly toSeconds: bigint;
    }
  | {
      /** A line's total duration was rounded by its project's rounding rule (scope `line`). */
      readonly kind: "line-duration-rounded";
      readonly lineId: string;
      readonly fromSeconds: bigint;
      readonly toSeconds: bigint;
    }
  | {
      /** The hours of a line do not fit `hoursScale` decimals and were rounded. */
      readonly kind: "quantity-rounded";
      readonly lineId: string;
      /** The exact hours as a reduced fraction `n/d` (1/3 h is not a decimal). */
      readonly exact: string;
      readonly rounded: Decimal;
    }
  | {
      /** A price was converted to the invoice currency with an explicit exchange rate. */
      readonly kind: "price-converted";
      readonly lineId: string;
      readonly from: Price;
      readonly to: Price;
    };

export interface InvoiceDraft {
  /** Validated with `validateInvoiceInput`: ready for `computeInvoice`. */
  readonly input: InvoiceInput;
  /** One entry per line of `input.lines`, in the same order. */
  readonly provenance: readonly LineProvenance[];
  readonly adjustments: readonly DraftAdjustment[];
}
