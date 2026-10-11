/**
 * Versioned parameters of the Italian pack (docs/tax-packs/it.md, section 11). Each version is
 * a full snapshot: copy the previous one forward and change what the law changed. Released
 * versions are never edited (the conformance suite snapshots the timeline); add a new version
 * with its sources instead. Invoices dated before 2019-01-01 are refused.
 */
import { decimal, money, type Decimal, type Money } from "@fairhour/money";
import {
  countryCode,
  isoDate,
  type CountryCode,
  type IsoDate,
  type ParameterVersion,
} from "@fairhour/tax-core";
import type { CassaPreset } from "./config";
import { deepFreeze } from "./freeze";
import { cassaRateSources, sources } from "./sources";

export interface CassaPresetParams {
  /** Name printed on the invoice ("Cassa Forense"). */
  readonly name: string;
  /** Contributo integrativo, percent units. */
  readonly rate: Decimal;
  /** FatturaPA DatiCassaPrevidenziale/TipoCassa. */
  readonly tipoCassa: string;
  /** False when the rate is still to be verified (info warning `it.cassa.rate-to-be-verified`). */
  readonly rateVerified: boolean;
}

export interface ItParams {
  readonly vat: { readonly standardRate: Decimal; readonly allowedRates: readonly Decimal[] };
  readonly withholding: { readonly professionalRate: Decimal };
  readonly inpsRivalsa: { readonly maxRate: Decimal };
  /** EUR amounts: the pack refuses other currencies. */
  readonly stampDuty: { readonly amount: Money; readonly threshold: Money };
  /** Revenue limits of the regime forfettario; `immediateExit` is null before 2023. */
  readonly forfettario: { readonly ceiling: Money; readonly immediateExit: Money | null };
  /** Lawyers' flat general expenses, percent units. */
  readonly generalExpenses: { readonly rate: Decimal };
  readonly cassa: Readonly<Record<CassaPreset, CassaPresetParams>>;
  /** EU member states, for the reverse-charge note (art. 21, c. 6-bis, lett. a). */
  readonly euCountries: readonly CountryCode[];
  /** Last day of the EU authorisation of the split payment (art. 395 VAT Directive). */
  readonly splitPayment: { readonly authorisedUntil: IsoDate };
}

const eur = (cents: bigint): Money => money(cents, "EUR");

const EU_27 = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
].map(countryCode);

const CASSA_PRESETS: Readonly<Record<CassaPreset, CassaPresetParams>> = {
  "cassa-forense": {
    name: "Cassa Forense",
    rate: decimal("4"),
    tipoCassa: "TC01",
    rateVerified: true,
  },
  cnpadc: { name: "CNPADC", rate: decimal("4"), tipoCassa: "TC02", rateVerified: true },
  cipag: { name: "CIPAG", rate: decimal("5"), tipoCassa: "TC03", rateVerified: true },
  inarcassa: { name: "Inarcassa", rate: decimal("4"), tipoCassa: "TC04", rateVerified: true },
  cnpr: { name: "CNPR", rate: decimal("4"), tipoCassa: "TC06", rateVerified: true },
  enpacl: { name: "ENPACL", rate: decimal("4"), tipoCassa: "TC08", rateVerified: true },
  eppi: { name: "EPPI", rate: decimal("5"), tipoCassa: "TC17", rateVerified: false },
  epap: { name: "EPAP", rate: decimal("4"), tipoCassa: "TC18", rateVerified: false },
  enpab: { name: "ENPAB", rate: decimal("4"), tipoCassa: "TC19", rateVerified: false },
  enpapi: { name: "ENPAPI", rate: decimal("4"), tipoCassa: "TC20", rateVerified: true },
  enpap: { name: "ENPAP", rate: decimal("2"), tipoCassa: "TC21", rateVerified: true },
};

const BASELINE: ItParams = {
  vat: {
    standardRate: decimal("22"),
    allowedRates: [decimal("22"), decimal("10"), decimal("5"), decimal("4")],
  },
  withholding: { professionalRate: decimal("20") },
  inpsRivalsa: { maxRate: decimal("4") },
  stampDuty: { amount: eur(200n), threshold: eur(7747n) },
  forfettario: { ceiling: eur(6_500_000n), immediateExit: null },
  generalExpenses: { rate: decimal("15") },
  cassa: CASSA_PRESETS,
  euCountries: [...EU_27, countryCode("GB")].sort(),
  splitPayment: { authorisedUntil: isoDate("2026-06-30") },
};

const V2021: ItParams = {
  ...BASELINE,
  euCountries: EU_27,
};

const V2023: ItParams = {
  ...V2021,
  forfettario: { ceiling: eur(8_500_000n), immediateExit: eur(10_000_000n) },
};

const V2026_07: ItParams = {
  ...V2023,
  splitPayment: { authorisedUntil: isoDate("2029-06-30") },
};

export const parameters: readonly ParameterVersion<ItParams>[] = deepFreeze([
  {
    id: "it-2019-01-01",
    effectiveFrom: isoDate("2019-01-01"),
    params: BASELINE,
    sources: [
      sources.vatStandardRate,
      sources.vatReducedRates,
      sources.withholding,
      sources.inpsRivalsa,
      sources.stampDuty,
      sources.stampDutyThreshold,
      sources.stampDutyAmount,
      sources.l145of2018,
      sources.generalExpenses,
      ...Object.values(cassaRateSources),
      sources.splitPaymentDecision2023,
    ],
    changes: [
      "Baseline: VAT 22 % (allowed rates 22, 10, 5 and 4); withholding 20 %; INPS rivalsa at most 4 %.",
      "Stamp duty €2.00 when the amount not subject to VAT exceeds €77.47.",
      "Forfettario ceiling €65,000, no in-year exit.",
      "Lawyers' general expenses 15 %; professional fund presets (rates and TipoCassa).",
      "EU member states: EU-27 and the United Kingdom.",
      "Split payment authorised until 2026-06-30.",
    ],
  },
  {
    id: "it-2021-01-01",
    effectiveFrom: isoDate("2021-01-01"),
    params: V2021,
    sources: [sources.brexit],
    changes: [
      "United Kingdom removed from the EU member states (end of the Brexit transition period on 2020-12-31).",
    ],
  },
  {
    id: "it-2023-01-01",
    effectiveFrom: isoDate("2023-01-01"),
    params: V2023,
    sources: [
      sources.l197of2022,
      sources.circolare32E2023,
      sources.l190Ceiling,
      sources.l190ImmediateExit,
    ],
    changes: ["Forfettario ceiling €85,000; immediate exit above €100,000."],
  },
  {
    id: "it-2026-07-01",
    effectiveFrom: isoDate("2026-07-01"),
    params: V2026_07,
    sources: [sources.splitPaymentDecision2026],
    changes: ["Split payment authorised until 2029-06-30."],
  },
]);

/**
 * The version in force on `date` (latest `effectiveFrom ≤ date`), or undefined before the first
 * version. Never throws: `validateInput` runs before the engine resolves the parameters.
 */
export function findParameters(date: IsoDate): ParameterVersion<ItParams> | undefined {
  let found: ParameterVersion<ItParams> | undefined;
  for (const version of parameters) if (version.effectiveFrom <= date) found = version;
  return found;
}
