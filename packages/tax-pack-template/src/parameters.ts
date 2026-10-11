/**
 * Parameter versions of the Exampleland pack: every legal value (rate, threshold, fixed amount,
 * wording that the law fixes) with the date it takes effect. An invoice uses the version in force
 * on its issue date.
 *
 * Append-only: a released version is never edited (the conformance suite compares the timeline
 * with a committed snapshot, so an edit shows up in review). When the law changes, copy the last
 * version, change what the law changed, and add it with its source and a summary of the changes.
 */
import { decimal, type Decimal } from "@fairhour/money";
import { compareIsoDate, isoDate, type IsoDate, type ParameterVersion } from "@fairhour/tax-core";
import type { VatRateName, WithholdingRateName } from "./config";
import { deepFreeze } from "./freeze";
import { budgetAct2025, incomeTaxActWithholding, vatActRates } from "./sources";

// TEMPLATE: model your country's legal values. Rates are `Decimal` percent units parsed from
// strings (`decimal("21")`), never numbers. Fixed amounts and thresholds are `Money` in the
// country's currency (refuse other currencies in validateInput, as tax-pack-it does) or a
// `Decimal` of major units converted with `fromDecimal(value, ctx.currency, mode)`.

export interface XxParams {
  /** Percent units. */
  readonly vat: { readonly standardRate: Decimal; readonly reducedRate: Decimal };
  /** Percent units. */
  readonly withholding: { readonly standardRate: Decimal; readonly newBusinessRate: Decimal };
}

// TEMPLATE: the first version starts on the earliest issue date your pack supports (invoices
// dated before it throw ParameterNotFoundError). Ids are "<cc>-<effectiveFrom>".
export const XX_PARAMETERS: readonly ParameterVersion<XxParams>[] = deepFreeze([
  {
    id: "xx-2024-01-01",
    effectiveFrom: isoDate("2024-01-01"),
    params: {
      vat: { standardRate: decimal("20"), reducedRate: decimal("10") },
      withholding: { standardRate: decimal("15"), newBusinessRate: decimal("7") },
    },
    sources: [vatActRates, incomeTaxActWithholding],
    changes: [
      "Initial version: VAT 20% (standard) and 10% (reduced); withholding 15%, or 7% for new businesses.",
    ],
  },
  {
    id: "xx-2026-01-01",
    effectiveFrom: isoDate("2026-01-01"),
    params: {
      vat: { standardRate: decimal("21"), reducedRate: decimal("10") },
      withholding: { standardRate: decimal("15"), newBusinessRate: decimal("7") },
    },
    sources: [budgetAct2025],
    changes: ["Standard VAT rate 21% (was 20%)."],
  },
]);

/**
 * The version in force on `date`, or undefined before the first one. For the pack's own hooks
 * that run before the engine resolves the parameters (validateInput): they must not throw, so
 * that the engine reports a date before the first version as ParameterNotFoundError.
 */
export function findParameters(date: IsoDate): ParameterVersion<XxParams> | undefined {
  let found: ParameterVersion<XxParams> | undefined;
  for (const version of XX_PARAMETERS) {
    if (compareIsoDate(version.effectiveFrom, date) <= 0) found = version;
  }
  return found;
}

/** The VAT rate a configured name stands for. */
export function vatRate(params: XxParams, name: VatRateName): Decimal {
  switch (name) {
    case "standard":
      return params.vat.standardRate;
    case "reduced":
      return params.vat.reducedRate;
  }
}

/** The withholding rate a configured name stands for. */
export function withholdingRate(params: XxParams, name: WithholdingRateName): Decimal {
  switch (name) {
    case "standard":
      return params.withholding.standardRate;
    case "new-business":
      return params.withholding.newBusinessRate;
  }
}

/** The rates a line may name explicitly (treatment `{ kind: "rate" }`). */
export function vatRates(params: XxParams): readonly Decimal[] {
  return [params.vat.standardRate, params.vat.reducedRate];
}
