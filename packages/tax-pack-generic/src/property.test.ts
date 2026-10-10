/**
 * Properties of the generic pack (docs/tax-packs/generic.md, section 6), on random
 * configurations as well as random invoices. The shared conformance suite checks the engine-level
 * properties (reconciliation, determinism, permutation, ...) on the fixed `validConfigs`.
 */
import {
  decimalToString,
  percentage,
  ROUNDING_MODES,
  type CurrencyCode,
  type Decimal,
  type Money,
  type RoundingMode,
} from "@fairhour/money";
import {
  computeInvoice,
  countryCode,
  isoDate,
  UnsupportedInputError,
  type InvoiceComputation,
  type InvoiceInput,
  type JsonValue,
} from "@fairhour/tax-core";
import { decimalArbitrary, invoiceInputArbitrary } from "@fairhour/tax-core/conformance";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { configSchema, percent, type GenericConfig, type GenericConfigInput } from "./config";
import { taxGroupId } from "./groups";
import { genericPack } from "./index";
import { REVERSE_CHARGE_OPTIONS, type ReverseChargeOption } from "./options";
import { reverseChargeDecision } from "./rules/classify-lines";
import { withholdingExemption } from "./rules/withholding";
import { validateInput } from "./validate-input";

const NUM_RUNS = 200;
const CURRENCIES: readonly CurrencyCode[] = ["EUR", "GBP", "USD", "AUD", "JPY", "KWD"];
const COUNTRIES = ["DE", "FR", "GB", "US", "AU", "JP", "ES"].map((code) => countryCode(code));
const DATES = { from: isoDate("2020-01-01"), to: isoDate("2030-12-31") };

const percentArbitrary = decimalArbitrary({ min: "0", max: "100", maxScale: 4 }).map((value) =>
  decimalToString(value),
);
const textArbitrary = fc.constantFrom("Exempt supply", "Reverse charge", "Note", "Nota bene");

const configArbitrary: fc.Arbitrary<GenericConfig> = fc
  .record(
    {
      taxLabel: fc.constantFrom("VAT", "GST", "Sales tax", "IVA", "MwSt", "TVA"),
      tax: fc.oneof(
        fc.record({
          kind: fc.constant("rate" as const),
          rate: fc.oneof(fc.constantFrom("0", "5", "10", "20", "8.875"), percentArbitrary),
          allowedLineRates: fc.array(percentArbitrary, { maxLength: 3 }),
        }),
        fc.record(
          { kind: fc.constant("none" as const), note: textArbitrary },
          { requiredKeys: ["kind"] },
        ),
      ),
      exemptNote: textArbitrary,
      reverseCharge: fc.oneof(
        fc.constant({ mode: "off" as const }),
        fc.record({
          mode: fc.constant("foreign-business-clients" as const),
          supplierCountry: fc.constantFrom(...COUNTRIES),
          note: textArbitrary,
        }),
      ),
      withholding: fc.record(
        {
          label: fc.constantFrom("Withholding tax", "IRPF"),
          rate: percentArbitrary,
          appliesTo: fc.constantFrom("withholding-agents" as const, "business-clients" as const),
        },
        { requiredKeys: ["rate"] },
      ),
      rounding: fc.record(
        {
          mode: fc.constantFrom(...ROUNDING_MODES),
          taxScope: fc.constantFrom("per-document" as const, "per-line" as const),
        },
        { requiredKeys: [] },
      ),
      documentNote: textArbitrary,
    },
    { requiredKeys: ["tax"] },
  )
  .map((input: GenericConfigInput) => configSchema.parse(input));

interface Case {
  readonly config: GenericConfig;
  readonly input: InvoiceInput;
}

const caseArbitrary: fc.Arbitrary<Case> = fc
  .record({
    config: configArbitrary,
    currency: fc.constantFrom(...CURRENCIES),
    options: fc.constantFrom<Record<string, JsonValue>>(
      {},
      ...REVERSE_CHARGE_OPTIONS.map((reverseCharge) => ({ reverseCharge })),
    ),
  })
  .chain(({ config, currency, options }) =>
    invoiceInputArbitrary({ currency, dateRange: DATES, clientCountries: COUNTRIES }).map(
      (input): Case => ({ config, input: { ...input, options } }),
    ),
  );

/** The computation, or undefined when the pack refuses the input. */
function run(item: Case): InvoiceComputation | undefined {
  try {
    return computeInvoice(genericPack, item.config, item.input);
  } catch (error) {
    if (error instanceof UnsupportedInputError) return undefined;
    throw error;
  }
}

const isHalf = (mode: RoundingMode): boolean =>
  mode === "halfUp" || mode === "halfEven" || mode === "halfDown";

/** |amount − base × rate / 100| ≤ ½ minor unit per item (half modes), < 1 (directed modes). */
function withinBound(
  amount: Money,
  base: Money,
  rate: Decimal,
  items: bigint,
  mode: RoundingMode,
): boolean {
  const denominator = 10n ** BigInt(rate.scale + 2);
  const difference = amount.amount * denominator - base.amount * rate.coefficient;
  const distance = difference < 0n ? -difference : difference;
  return isHalf(mode) ? 2n * distance <= items * denominator : distance < items * denominator;
}

function property(predicate: (item: Case, c: InvoiceComputation) => void): void {
  fc.assert(
    fc.property(caseArbitrary, (item) => {
      const c = run(item);
      fc.pre(c !== undefined);
      predicate(item, c);
    }),
    { numRuns: NUM_RUNS },
  );
}

describe("generic pack properties", () => {
  it("computes every input, or refuses exactly the inputs validateInput refuses", () => {
    fc.assert(
      fc.property(caseArbitrary, (item) => {
        const refused = validateInput(item.input, item.config).length > 0;
        expect(run(item) === undefined).toBe(refused);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("never has a tax component without tax", () => {
    property((item, c) => {
      if (item.config.tax.kind !== "none") return;
      expect(c.components.some((component) => component.kind === "tax")).toBe(false);
      expect(c.taxTotal.amount).toBe(0n);
      expect(c.vatSummary.some((row) => row.treatment === "taxable")).toBe(false);
    });
  });

  it("names taxable groups after their rate", () => {
    property((_item, c) => {
      for (const row of c.vatSummary) {
        if (row.rate !== undefined) expect(row.groupId).toBe(taxGroupId(row.rate));
      }
    });
  });

  it("keeps the tax within half a minor unit per group (per document) or per line (per line)", () => {
    property((item, c) => {
      const { mode, taxScope } = item.config.rounding;
      for (const component of c.components.filter((candidate) => candidate.kind === "tax")) {
        for (const allocation of component.allocations) {
          const row = c.vatSummary.find((candidate) => candidate.groupId === allocation.groupId);
          const rate = row?.rate;
          expect(rate).toBeDefined();
          if (rate === undefined) return;
          if (taxScope === "per-document") {
            expect(withinBound(allocation.amount, allocation.base, rate, 1n, mode)).toBe(true);
            continue;
          }
          const lines = c.lines.filter((computed) => computed.groupId === allocation.groupId);
          let sum = 0n;
          for (const computed of lines) {
            const tax = percentage(computed.net, rate, mode);
            expect(withinBound(tax, computed.net, rate, 1n, mode)).toBe(true);
            sum += tax.amount;
          }
          expect(allocation.amount.amount).toBe(sum);
        }
      }
    });
  });

  it("never withholds more than the non-excluded subtotal, and withholds exactly the rate of it", () => {
    property((item, c) => {
      const nonExcluded = c.lines
        .filter((computed) => computed.treatment.kind !== "excluded")
        .reduce((total, computed) => total + computed.net.amount, 0n);
      expect(c.withholdingTotal.amount <= nonExcluded).toBe(true);
      const settings = item.config.withholding;
      const withholds =
        settings !== undefined &&
        withholdingExemption(settings.appliesTo, item.input.client) === undefined &&
        nonExcluded > 0n;
      if (!withholds) {
        expect(c.withholdingTotal.amount).toBe(0n);
        return;
      }
      const expected = percentage(
        { amount: nonExcluded, currency: c.currency },
        percent(settings.rate),
        item.config.rounding.mode,
      );
      expect(c.withholdingTotal.amount).toBe(expected.amount);
    });
  });

  it("puts no line in a taxable group when the reverse charge applies", () => {
    property((item, c) => {
      const option = (item.input.options?.reverseCharge ?? "auto") as ReverseChargeOption;
      const decision = reverseChargeDecision(item.config.reverseCharge, option, item.input.client);
      if (item.config.tax.kind !== "rate" || !decision.applies) return;
      expect(c.vatSummary.every((row) => row.treatment !== "taxable")).toBe(true);
      expect(c.taxTotal.amount).toBe(0n);
      const chargeable = c.lines.some(
        (computed) => computed.treatment.kind === "standard" || computed.treatment.kind === "rate",
      );
      expect(c.legalNotes.some((note) => note.id === "generic.note.reverse-charge")).toBe(
        chargeable,
      );
    });
  });

  it("per line: the tax of an invoice is the sum of the taxes of its lines invoiced alone", () => {
    property((item, c) => {
      if (item.config.rounding.taxScope !== "per-line") return;
      let sum = 0n;
      for (const single of item.input.lines) {
        const alone = run({ config: item.config, input: { ...item.input, lines: [single] } });
        sum += alone?.taxTotal.amount ?? 0n;
      }
      expect(c.taxTotal.amount).toBe(sum);
    });
  });

  it("gives the same minor units in every currency with the same exponent", () => {
    property((item, c) => {
      if (item.input.currency !== "EUR") return;
      const { exchangeRates: _ignored, ...rest } = item.input;
      const relabelled: InvoiceInput = {
        ...rest,
        currency: "USD",
        lines: rest.lines.map((computed) => ({
          ...computed,
          unitPrice: { ...computed.unitPrice, currency: "USD" },
        })),
      };
      const usd = computeInvoice(genericPack, item.config, relabelled);
      const minor = (computation: InvoiceComputation): readonly bigint[] => [
        computation.subtotal.amount,
        computation.taxTotal.amount,
        computation.total.amount,
        computation.withholdingTotal.amount,
        computation.netPayable.amount,
      ];
      expect(minor(usd)).toEqual(minor(c));
    });
  });
});
