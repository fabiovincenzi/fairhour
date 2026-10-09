import {
  compareDecimal,
  decimal,
  decimalToString,
  price,
  rescaleDecimal,
  type CurrencyCode,
  type Decimal,
  type Price,
} from "@fairhour/money";
import * as fc from "fast-check";
import {
  CLIENT_KINDS,
  DOCUMENT_KINDS,
  LINE_KINDS,
  LINE_TREATMENT_KINDS,
  LINE_UNITS,
  type ClientInput,
  type DocumentKind,
  type ExchangeRecord,
  type InvoiceInput,
  type InvoiceLineInput,
  type LineTaxTreatment,
} from "../input/types";
import { addDays, daysBetweenInclusive, type CountryCode, type IsoDate } from "../primitives";

/** A Decimal from an integer coefficient and a scale, through money's parser. */
function decimalFromParts(coefficient: bigint, scale: number): Decimal {
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return decimal(`${negative ? "-" : ""}${text}`);
}

/**
 * Decimals in `[min, max]` with a scale in `0..maxScale` (the scale is generated too, so "1",
 * "1.0" and "1.25" all appear).
 * @throws RangeError when min > max
 */
export function decimalArbitrary(options: {
  readonly min: string;
  readonly max: string;
  readonly maxScale: number;
}): fc.Arbitrary<Decimal> {
  const min = decimal(options.min);
  const max = decimal(options.max);
  if (compareDecimal(min, max) > 0) {
    throw new RangeError("decimalArbitrary: min is greater than max");
  }
  return fc.integer({ min: 0, max: options.maxScale }).chain((scale) => {
    const low = rescaleDecimal(min, scale, "ceiling").coefficient;
    const high = rescaleDecimal(max, scale, "floor").coefficient;
    if (low > high) return fc.constant(min);
    return fc.bigInt(low, high).map((coefficient) => decimalFromParts(coefficient, scale));
  });
}

/** Unit prices in `[0, max]` (default "10000") with up to `maxScale` (default 4) decimals. */
export function priceArbitrary(
  currency: CurrencyCode,
  options?: { readonly max?: string; readonly maxScale?: number },
): fc.Arbitrary<Price> {
  return decimalArbitrary({
    min: "0",
    max: options?.max ?? "10000",
    maxScale: options?.maxScale ?? 4,
  }).map((amount) => price(decimalToString(amount), currency));
}

const COMMON_RATES = ["0", "4", "5", "5.5", "7.7", "10", "20", "22", "25.5"].map((rate) =>
  decimal(rate),
);
const REFERENCES = ["art. 10", "art. 7-ter", "Reverse charge"];
const OTHER_CURRENCIES: readonly CurrencyCode[] = ["EUR", "USD", "GBP", "JPY", "CHF"];

function treatmentArbitrary(
  kinds: readonly LineTaxTreatment["kind"][],
): fc.Arbitrary<LineTaxTreatment> {
  return fc.constantFrom(...kinds).chain((kind): fc.Arbitrary<LineTaxTreatment> => {
    switch (kind) {
      case "standard":
      case "excluded":
        return fc.constant({ kind });
      case "rate":
        return fc
          .oneof(
            fc.constantFrom(...COMMON_RATES),
            decimalArbitrary({ min: "0", max: "100", maxScale: 2 }),
          )
          .map((rate) => ({ kind: "rate", rate }));
      case "exempt":
      case "out-of-scope":
        return fc
          .option(fc.constantFrom(...REFERENCES), { nil: undefined })
          .map((reference) => (reference === undefined ? { kind } : { kind, reference }));
    }
  });
}

/**
 * Valid invoice inputs (they pass `validateInvoiceInput`): 0..maxLines lines with ids "l1",
 * "l2", ..., every line kind, unit and the requested treatments, quantities up to 1000 with 3
 * decimals, unit prices up to 5000 with 4 decimals, sometimes an exchange record. The values are
 * not frozen; `computeInvoice` copies what it keeps.
 */
export function invoiceInputArbitrary(options: {
  readonly currency: CurrencyCode;
  readonly dateRange: { readonly from: IsoDate; readonly to: IsoDate };
  readonly clientCountries: readonly CountryCode[];
  readonly maxLines?: number; // default 8
  readonly treatments?: readonly LineTaxTreatment["kind"][];
  readonly documentKinds?: readonly DocumentKind[];
}): fc.Arbitrary<InvoiceInput> {
  const { currency, dateRange } = options;
  const days = daysBetweenInclusive(dateRange.from, dateRange.to);
  if (days === 0)
    throw new RangeError("invoiceInputArbitrary: dateRange.to is before dateRange.from");
  if (options.clientCountries.length === 0)
    throw new RangeError("invoiceInputArbitrary: no client countries");
  const line = fc.record({
    kind: fc.constantFrom(...LINE_KINDS),
    description: fc.string({ minLength: 1, maxLength: 40 }),
    quantity: decimalArbitrary({ min: "0", max: "1000", maxScale: 3 }),
    unit: fc.constantFrom(...LINE_UNITS),
    unitPrice: priceArbitrary(currency, { max: "5000", maxScale: 4 }),
    treatment: treatmentArbitrary(options.treatments ?? LINE_TREATMENT_KINDS),
  });
  const client = fc
    .record({
      country: fc.constantFrom(...options.clientCountries),
      kind: fc.constantFrom(...CLIENT_KINDS),
      isWithholdingAgent: fc.boolean(),
      vatId: fc.option(fc.stringMatching(/^[A-Z0-9]{1,16}$/), { nil: undefined }),
    })
    .map(({ vatId, ...rest }): ClientInput => (vatId === undefined ? rest : { ...rest, vatId }));
  const others = OTHER_CURRENCIES.filter((code) => code !== currency);
  const exchange = fc.option(
    fc.record({
      from: fc.constantFrom(...others),
      rate: decimalArbitrary({ min: "0.0001", max: "1000", maxScale: 6 }),
    }),
    { nil: undefined },
  );
  return fc
    .record({
      offset: fc.integer({ min: 0, max: days - 1 }),
      documentKind: fc.constantFrom(...(options.documentKinds ?? DOCUMENT_KINDS)),
      client,
      lines: fc.array(line, { maxLength: options.maxLines ?? 8 }),
      exchange,
    })
    .map(({ offset, documentKind, client: clientInput, lines, exchange: record }): InvoiceInput => {
      const issueDate = addDays(dateRange.from, offset);
      const exchangeRates: readonly ExchangeRecord[] | undefined =
        record === undefined
          ? undefined
          : [{ from: record.from, rate: record.rate, date: issueDate }];
      return {
        issueDate,
        documentKind,
        currency,
        client: clientInput,
        lines: lines.map((item, index): InvoiceLineInput => ({
          id: `l${index + 1}`,
          kind: item.kind,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          treatment: item.treatment,
        })),
        ...(exchangeRates === undefined ? {} : { exchangeRates }),
      };
    });
}
