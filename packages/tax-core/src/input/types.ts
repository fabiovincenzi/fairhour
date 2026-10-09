import type { CurrencyCode, Decimal, Price } from "@fairhour/money";
import type { CountryCode, IsoDate, JsonValue } from "../primitives";

export type LineKind =
  | "service" // professional services, time or fixed price (part of the fee)
  | "expense" // costs recharged to the client as part of the fee ("rimborso spese")
  | "reimbursement" // amounts paid in the client's name and on the client's behalf (disbursements)
  | "mileage" // kilometres × rate per km (part of the fee)
  | "goods"; // sale of goods/equipment

export const LINE_KINDS: readonly LineKind[] = Object.freeze([
  "service",
  "expense",
  "reimbursement",
  "mileage",
  "goods",
]);

export type LineUnit = "hour" | "day" | "km" | "item" | "lump-sum";

export const LINE_UNITS: readonly LineUnit[] = Object.freeze([
  "hour",
  "day",
  "km",
  "item",
  "lump-sum",
]);

/** How a line is treated by the pack's main tax (VAT/GST/sales tax). Rates are percent units. */
export type LineTaxTreatment =
  | { readonly kind: "standard" } // the pack's normal treatment
  | { readonly kind: "rate"; readonly rate: Decimal } // explicit rate, e.g. reduced 10
  | { readonly kind: "exempt"; readonly reference?: string } // exempt by law, with reference
  | { readonly kind: "out-of-scope"; readonly reference?: string } // not subject (place of supply...)
  | { readonly kind: "excluded" }; // outside the taxable amount

export const LINE_TREATMENT_KINDS: readonly LineTaxTreatment["kind"][] = Object.freeze([
  "standard",
  "rate",
  "exempt",
  "out-of-scope",
  "excluded",
]);

export type ClientKind = "business" | "individual" | "public-administration";

export const CLIENT_KINDS: readonly ClientKind[] = Object.freeze([
  "business",
  "individual",
  "public-administration",
]);

export interface ClientInput {
  readonly country: CountryCode;
  readonly kind: ClientKind;
  /** The client must withhold income tax at source (IT: "sostituto d'imposta"). */
  readonly isWithholdingAgent: boolean;
  readonly vatId?: string;
}

export interface InvoiceLineInput {
  /** Stable id from the caller, unique within the invoice: /^[A-Za-z0-9._:-]{1,64}$/. */
  readonly id: string;
  readonly kind: LineKind;
  readonly description: string; // 1..1000 characters
  readonly quantity: Decimal; // 0 ≤ q ≤ 10^9, scale ≤ 8
  readonly unit: LineUnit;
  readonly unitPrice: Price; // 0 ≤ p ≤ 10^12, scale ≤ 8, invoice currency
  readonly treatment: LineTaxTreatment;
}

export type DocumentKind = "invoice" | "credit-note";

export const DOCUMENT_KINDS: readonly DocumentKind[] = Object.freeze(["invoice", "credit-note"]);

export interface ExchangeRecord {
  readonly from: CurrencyCode;
  /** Units of the invoice currency per 1 unit of `from`. */
  readonly rate: Decimal;
  readonly date: IsoDate;
  readonly source?: string; // "ECB reference rate", max 200 chars
}

export interface InvoiceInput {
  readonly issueDate: IsoDate;
  readonly documentKind: DocumentKind;
  readonly currency: CurrencyCode;
  readonly client: ClientInput;
  readonly lines: readonly InvoiceLineInput[]; // 0..500 lines
  /** Pack-specific per-invoice options, validated by the pack's invoiceOptionsSchema. */
  readonly options?: Readonly<Record<string, JsonValue>>;
  /** Informational: conversions the caller applied to build the lines. */
  readonly exchangeRates?: readonly ExchangeRecord[];
}

/** Treatments in the JSON form: rates are decimal strings. */
export type LineTaxTreatmentJson =
  | { kind: "standard" }
  | { kind: "rate"; rate: string }
  | { kind: "exempt"; reference?: string | undefined }
  | { kind: "out-of-scope"; reference?: string | undefined }
  | { kind: "excluded" };

/**
 * JSON form (API, database snapshots, fixtures): amounts are decimal strings in `currency`.
 * Optional properties also accept an explicit `undefined` (what zod's optional() accepts).
 */
export interface InvoiceInputJson {
  issueDate: string;
  documentKind?: DocumentKind | undefined; // default "invoice"
  currency: string;
  client: {
    country: string;
    kind: ClientKind;
    isWithholdingAgent: boolean;
    vatId?: string | undefined;
  };
  lines: {
    id: string;
    kind: LineKind;
    description: string;
    quantity: string; // decimal string
    unit: LineUnit;
    unitPrice: string; // decimal string in `currency`
    /** Default: { kind: "excluded" } for kind "reimbursement", { kind: "standard" } otherwise. */
    treatment?: LineTaxTreatmentJson | undefined;
  }[];
  options?: Record<string, JsonValue> | undefined;
  exchangeRates?:
    { from: string; rate: string; date: string; source?: string | undefined }[] | undefined;
}
