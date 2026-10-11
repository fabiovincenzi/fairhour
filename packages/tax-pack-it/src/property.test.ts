/**
 * Properties of the Italian pack (docs/tax-packs/it.md, section 16), on random configurations
 * of both regimes as well as random invoices. The shared conformance suite checks the
 * engine-level properties (reconciliation, determinism, permutation, rounding bounds, ...) on the
 * fixed `validConfigs`; these check the pack's own rules against independent oracles.
 */
import {
  add,
  decimal,
  decimalToString,
  multiplyByInteger,
  normalizeDecimal,
  percentage,
  price,
  rescaleDecimal,
  subtract,
  zero,
  type Decimal,
  type Money,
} from "@fairhour/money";
import {
  computeInvoice,
  countryCode,
  isoDate,
  UnsupportedInputError,
  type ClientInput,
  type ComputedLine,
  type InvoiceComputation,
  type InvoiceInput,
  type JsonValue,
  type LineTaxTreatment,
} from "@fairhour/tax-core";
import { decimalArbitrary, invoiceInputArbitrary } from "@fairhour/tax-core/conformance";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CASSA_PRESET_IDS,
  configSchema,
  percent,
  type ItConfig,
  type ItConfigInput,
} from "./config";
import { itPack } from "./index";
import { optionsSchema, type ItOptions } from "./options";
import { findParameters } from "./parameters";
import { countableRevenue } from "./revenue-tracker";
import { validateInput } from "./validate-input";

const NUM_RUNS = 200;
const COUNTRIES = ["IT", "IT", "IT", "DE", "FR", "GB", "US", "CH"].map((code) => countryCode(code));
const DATES = { from: isoDate("2019-01-01"), to: isoDate("2030-12-31") };
const ALLOWED_RATES = ["22", "10", "5", "4"] as const;
const FEE_KINDS: readonly string[] = ["service", "expense", "mileage"];
const STAMP_DUTY_CENTS = 200n;
const STAMP_DUTY_THRESHOLD_CENTS = 7747n;

// --- Configurations ------------------------------------------------------------------------------

/** Percent strings in [min, max]; integers only when `integer` (exact arithmetic, see below). */
function percentArbitrary(min: string, max: string, integer: boolean): fc.Arbitrary<string> {
  return decimalArbitrary({ min, max, maxScale: integer ? 0 : 4 }).map(decimalToString);
}

function socialSecurityArbitrary(integer: boolean): fc.Arbitrary<ItConfigInput["socialSecurity"]> {
  const presets = CASSA_PRESET_IDS.filter((id) => id !== "custom");
  return fc.oneof(
    fc.constant({ kind: "none" as const }),
    fc.record(
      {
        kind: fc.constant("inps-gestione-separata" as const),
        rivalsa: fc.boolean(),
        rate: percentArbitrary("0", "4", integer),
      },
      { requiredKeys: ["kind"] },
    ),
    fc.record(
      {
        kind: fc.constant("cassa" as const),
        preset: fc.constantFrom(...presets),
        rate: percentArbitrary("0", "10", integer),
      },
      { requiredKeys: ["kind", "preset"] },
    ),
    fc.record({
      kind: fc.constant("cassa" as const),
      preset: fc.constant("custom" as const),
      rate: percentArbitrary("0", "10", integer),
      tipoCassa: fc.constantFrom("TC01", "TC09", "TC21"),
      name: fc.constantFrom("ENPAM", "Cassa di previdenza"),
    }),
  );
}

function configArbitrary(integer: boolean): fc.Arbitrary<ItConfig> {
  const socialSecurity = socialSecurityArbitrary(integer);
  const generalExpenses = fc.record(
    { rate: percentArbitrary("0", "30", integer) },
    { requiredKeys: [] },
  );
  const stampDuty = fc.record({ charge: fc.constantFrom("client" as const, "absorbed" as const) });
  const forfettario: fc.Arbitrary<ItConfigInput> = fc.record(
    {
      regime: fc.constant("forfettario" as const),
      socialSecurity,
      generalExpenses,
      stampDuty,
      noWithholdingNote: fc.constantFrom(
        "when-withholding-agent" as const,
        "always" as const,
        "never" as const,
      ),
      wording: fc.record(
        {
          vat: fc.constant("Operazione in franchigia da IVA ai sensi della L. 190/2014."),
          noWithholding: fc.constant("Compenso non soggetto a ritenuta d'acconto."),
        },
        { requiredKeys: [] },
      ),
      revenueTracker: fc.record({ warningRatio: percentArbitrary("1", "100", integer) }),
    },
    { requiredKeys: ["regime", "socialSecurity"] },
  );
  const ordinario: fc.Arbitrary<ItConfigInput> = fc.record(
    {
      regime: fc.constant("ordinario" as const),
      socialSecurity,
      generalExpenses,
      withholding: fc.record(
        {
          enabled: fc.boolean(),
          rate: percentArbitrary("0", "50", integer),
          baseShare: percentArbitrary("1", "100", integer),
          tipoRitenuta: fc.constantFrom("RT01" as const, "RT02" as const),
          causalePagamento: fc.constantFrom("A", "R", "ZO"),
        },
        { requiredKeys: [] },
      ),
      stampDuty,
      splitPayment: fc.constantFrom("auto" as const, "never" as const),
    },
    { requiredKeys: ["regime", "socialSecurity"] },
  );
  return fc.oneof(forfettario, ordinario).map((input) => configSchema.parse(input));
}

// --- Invoices ------------------------------------------------------------------------------------

interface Case {
  readonly config: ItConfig;
  readonly input: InvoiceInput;
  readonly options: ItOptions;
}

const OPTIONS: readonly Readonly<Record<string, JsonValue>>[] = [
  {},
  {},
  {},
  { stampDuty: "charge" },
  { stampDuty: "absorb" },
  { stampDuty: "not-due" },
  { splitPayment: "skip" },
  { splitPayment: "apply" },
];

/**
 * Random invoices. Lines get the treatments standard, exempt, out-of-scope and excluded; some
 * standard lines become `rate` lines with an Italian rate (ordinario only), or with any rate when
 * `refusable` (the pack then refuses them in both regimes, which is what the first property
 * checks).
 */
function caseArbitrary(settings: {
  readonly refusable: boolean;
  readonly integer?: boolean;
}): fc.Arbitrary<Case> {
  const rate = settings.refusable
    ? fc.constantFrom("22", "10", "5", "4", "7.7", "21", "0")
    : fc.constantFrom(...ALLOWED_RATES);
  const rateChoice = fc.oneof(
    { weight: 6, arbitrary: fc.constant(undefined) },
    { weight: 1, arbitrary: rate },
  );
  return fc
    .record({
      config: configArbitrary(settings.integer ?? false),
      input: invoiceInputArbitrary({
        currency: "EUR",
        dateRange: DATES,
        clientCountries: COUNTRIES,
        treatments: ["standard", "exempt", "out-of-scope", "excluded"],
      }),
      rates: fc.array(rateChoice, { minLength: 8, maxLength: 8 }),
      options: fc.constantFrom(...OPTIONS),
    })
    .map(({ config, input, rates, options }): Case => {
      const withRates = input.lines.map((line, index) => {
        const chosen = rates[index];
        const allowed = settings.refusable || config.regime === "ordinario";
        return line.treatment.kind === "standard" && chosen !== undefined && allowed
          ? { ...line, treatment: { kind: "rate" as const, rate: decimal(chosen) } }
          : line;
      });
      return {
        config,
        input: { ...input, lines: withRates, options },
        options: optionsSchema.parse(options),
      };
    });
}

/** The computation, or undefined when the pack refuses the input. */
function run(config: ItConfig, input: InvoiceInput): InvoiceComputation | undefined {
  try {
    return computeInvoice(itPack, config, input);
  } catch (error) {
    if (error instanceof UnsupportedInputError) return undefined;
    throw error;
  }
}

function property(
  predicate: (item: Case, c: InvoiceComputation) => void,
  arbitrary: fc.Arbitrary<Case> = caseArbitrary({ refusable: false }),
): void {
  fc.assert(
    fc.property(arbitrary, (item) => {
      const c = run(item.config, item.input);
      fc.pre(c !== undefined);
      predicate(item, c);
    }),
    { numRuns: NUM_RUNS },
  );
}

// --- Oracles -------------------------------------------------------------------------------------

const cents = (value: Money | undefined): bigint => value?.amount ?? 0n;

function amountOf(c: InvoiceComputation, id: string): Money | undefined {
  return c.components.find((component) => component.id === id)?.amount;
}

/** The group of a line per table 7.1 of the specification. */
function expectedGroup(config: ItConfig, client: ClientInput, line: ComputedLine): string {
  const treatment: LineTaxTreatment = line.treatment;
  if (treatment.kind === "excluded") return "n1";
  if (config.regime === "forfettario") return "n2.2";
  if (treatment.kind === "exempt") return "n4";
  if (treatment.kind === "out-of-scope") return "n2.2";
  if (client.kind === "business" && client.country !== "IT") return "n2.1";
  const rate = treatment.kind === "rate" ? treatment.rate : decimal("22");
  return `vat-${decimalToString(normalizeDecimal(rate))}`;
}

/** 2 × |exact − rounded| ≤ 1 minor unit, with exact = value × share / 100. */
function withinHalfCent(rounded: Money, value: Money, share: Decimal): boolean {
  const denominator = 10n ** BigInt(share.scale + 2);
  const difference = rounded.amount * denominator - value.amount * share.coefficient;
  const distance = difference < 0n ? -difference : difference;
  return 2n * distance <= denominator;
}

/** Fees subject to withholding: fee lines outside N1, general expenses, INPS rivalsa. */
function withholdingGross(c: InvoiceComputation): Money {
  let gross = zero(c.currency);
  for (const line of c.lines) {
    if (FEE_KINDS.includes(line.kind) && line.groupId !== "n1") gross = add(gross, line.net);
  }
  for (const id of ["it.general-expenses", "it.inps-rivalsa"]) {
    const value = amountOf(c, id);
    if (value !== undefined) gross = add(gross, value);
  }
  return gross;
}

/** The amount not subject to VAT, before the stamp duty itself. */
function nonTaxableBase(c: InvoiceComputation): bigint {
  const rows = c.vatSummary.filter((row) => row.treatment !== "taxable");
  const stamp = c.components.find(
    (component) => component.id === "it.stamp-duty" && component.effect === "adds-to-total",
  );
  return rows.reduce((total, row) => total + row.base.amount, 0n) - cents(stamp?.amount);
}

// --- Properties ----------------------------------------------------------------------------------

describe("Italian pack properties (docs section 16)", () => {
  it("generates every case the properties are about (they are not vacuous)", () => {
    const seen = new Set<string>();
    for (const item of fc.sample(caseArbitrary({ refusable: false }), { numRuns: 400, seed: 7 })) {
      const c = run(item.config, item.input);
      if (c === undefined) continue;
      seen.add(item.config.regime);
      seen.add(`document:${item.input.documentKind}`);
      for (const row of c.vatSummary)
        seen.add(`group:${row.groupId.startsWith("vat-") ? "vat" : row.groupId}`);
      for (const component of c.components) seen.add(`${component.id}:${component.effect}`);
    }
    expect([...seen].sort()).toEqual(
      expect.arrayContaining([
        "forfettario",
        "ordinario",
        "document:invoice",
        "document:credit-note",
        "group:vat",
        "group:n1",
        "group:n2.1",
        "group:n2.2",
        "group:n4",
        "it.general-expenses:adds-to-total",
        "it.cassa:adds-to-total",
        "it.inps-rivalsa:adds-to-total",
        "it.vat:adds-to-total",
        "it.withholding:deducted-from-payable",
        "it.stamp-duty:adds-to-total",
        "it.stamp-duty:informational",
        "it.split-payment:deducted-from-payable",
      ]),
    );
  });

  it("computes every input, or refuses exactly the inputs validateInput refuses", () => {
    fc.assert(
      fc.property(caseArbitrary({ refusable: true }), (item) => {
        const refused = validateInput(item.input, item.config, item.options).length > 0;
        expect(run(item.config, item.input) === undefined).toBe(refused);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("assigns every line to the group of table 7.1", () => {
    property((item, c) => {
      for (const line of c.lines) {
        expect(line.groupId).toBe(expectedGroup(item.config, item.input.client, line));
      }
    });
  });

  it("forfettario never has VAT, withholding or split payment; ordinario never the forfettario notes", () => {
    property((item, c) => {
      const notes = c.legalNotes.map((note) => note.id);
      if (item.config.regime === "forfettario") {
        const kinds = c.components.map((component) => component.kind);
        expect(kinds).not.toContain("tax");
        expect(kinds).not.toContain("withholding");
        expect(c.components.map((component) => component.id)).not.toContain("it.split-payment");
        expect(c.taxTotal.amount).toBe(0n);
        expect(c.withholdingTotal.amount).toBe(0n);
        expect(c.vatSummary.every((row) => row.treatment !== "taxable")).toBe(true);
        expect(notes).toContain("it.note.forfettario");
      } else {
        expect(notes).not.toContain("it.note.forfettario");
        expect(notes).not.toContain("it.note.forfettario-no-withholding");
      }
    });
  });

  it("charges VAT per rate on the summary, half up to the cent", () => {
    property((_item, c) => {
      for (const row of c.vatSummary) {
        if (row.rate === undefined) {
          expect(row.tax.amount).toBe(0n);
          continue;
        }
        expect(row.tax).toEqual(percentage(row.base, row.rate, "halfUp"));
      }
    });
  });

  it("withholds rate × (base share × (fees + general expenses + rivalsa)), never more than the base share", () => {
    property((item, c) => {
      const { config, input } = item;
      const gross = withholdingGross(c);
      const applies =
        config.regime === "ordinario" &&
        config.withholding.enabled &&
        input.client.isWithholdingAgent &&
        gross.amount > 0n;
      const component = c.components.find((candidate) => candidate.kind === "withholding");
      if (!applies) {
        expect(component).toBeUndefined();
        expect(c.withholdingTotal.amount).toBe(0n);
        return;
      }
      const share = percent(config.withholding.baseShare);
      const rate =
        config.withholding.rate === undefined ? decimal("20") : percent(config.withholding.rate);
      const base = percentage(gross, share, "halfUp");
      expect(component?.base).toEqual(base);
      expect(c.withholdingTotal).toEqual(percentage(base, rate, "halfUp"));
      // Never more than the base share of the fees (within the half cent of its rounding).
      expect(c.withholdingTotal.amount <= base.amount).toBe(true);
      expect(withinHalfCent(base, gross, share)).toBe(true);
      expect(withinHalfCent(c.withholdingTotal, base, rate)).toBe(true);
    });
  });

  it("the withholding depends only on the fees: dropping disbursements and goods changes nothing", () => {
    property((item, c) => {
      const feesOnly = item.input.lines.filter(
        (line) => FEE_KINDS.includes(line.kind) && line.treatment.kind !== "excluded",
      );
      const other = run(item.config, { ...item.input, lines: feesOnly });
      if (other === undefined) throw new Error("dropping lines never makes an input unsupported");
      expect(other.withholdingTotal).toEqual(c.withholdingTotal);
      for (const id of ["it.general-expenses", "it.cassa", "it.inps-rivalsa"]) {
        expect(amountOf(other, id)).toEqual(amountOf(c, id));
      }
    });
  });

  it("marks the INPS rivalsa Ritenuta SI exactly when the invoice is subject to withholding", () => {
    property((_item, c) => {
      const rivalsa = c.components.find((component) => component.id === "it.inps-rivalsa");
      if (rivalsa === undefined) return;
      const withheld = c.components.some((component) => component.kind === "withholding");
      expect(rivalsa.exportCodes?.["fatturapa.Ritenuta"]).toBe(withheld ? "SI" : "NO");
    });
  });

  it("stamp duty: exactly €2.00, due iff the amount not subject to VAT exceeds €77.47", () => {
    property((item, c) => {
      const stamp = c.components.find((component) => component.id === "it.stamp-duty");
      const due =
        item.options.stampDuty !== "not-due" && nonTaxableBase(c) > STAMP_DUTY_THRESHOLD_CENTS;
      expect(stamp !== undefined).toBe(due);
      if (stamp === undefined) return;
      expect(stamp.amount.amount).toBe(STAMP_DUTY_CENTS);
      expect(stamp.exportCodes).toEqual({
        "fatturapa.BolloVirtuale": "SI",
        "fatturapa.ImportoBollo": "2.00",
      });
      const charged =
        item.input.documentKind !== "credit-note" &&
        (item.options.stampDuty === "charge" ||
          (item.options.stampDuty === "auto" && item.config.stampDuty.charge === "client"));
      expect(stamp.effect).toBe(charged ? "adds-to-total" : "informational");
      expect(c.legalNotes.map((note) => note.id)).toContain("it.note.stamp-duty");
    });
  });

  it("stamp duty never changes VAT, withholding, contributions or split payment", () => {
    property((item, c) => {
      const without = run(item.config, {
        ...item.input,
        options: { ...item.input.options, stampDuty: "not-due" },
      });
      if (without === undefined) throw new Error("the not-due option is never refused");
      expect(without.taxTotal).toEqual(c.taxTotal);
      expect(without.withholdingTotal).toEqual(c.withholdingTotal);
      const others = (computation: InvoiceComputation) =>
        computation.components
          .filter((component) => component.id !== "it.stamp-duty")
          .map((component) => [component.id, component.amount]);
      expect(others(without)).toEqual(others(c));
      const stamp = c.components.find(
        (component) => component.id === "it.stamp-duty" && component.effect === "adds-to-total",
      );
      expect(subtract(c.total, without.total).amount).toBe(cents(stamp?.amount));
    });
  });

  it("netPayable = total − withholding − split payment, and split payment never meets withholding", () => {
    property((item, c) => {
      const split = amountOf(c, "it.split-payment");
      expect(c.netPayable.amount).toBe(c.total.amount - c.withholdingTotal.amount - cents(split));
      if (split === undefined) return;
      expect(item.config.regime).toBe("ordinario");
      expect(c.components.some((component) => component.kind === "withholding")).toBe(false);
      expect(split).toEqual(c.taxTotal);
      expect(split.amount > 0n).toBe(true);
      const until = findParameters(item.input.issueDate)?.params.splitPayment.authorisedUntil;
      expect(until !== undefined && item.input.issueDate <= until).toBe(true);
      expect(c.legalNotes.map((note) => note.id)).toContain("it.note.split-payment");
    });
  });

  it("applies split payment to Italian public administrations whenever its conditions hold", () => {
    property((item, c) => {
      const { config, input, options } = item;
      if (config.regime !== "ordinario") return;
      const until = findParameters(input.issueDate)?.params.splitPayment.authorisedUntil;
      const client = input.client;
      const expected =
        options.splitPayment !== "skip" &&
        (options.splitPayment === "apply" ||
          (config.splitPayment === "auto" &&
            client.kind === "public-administration" &&
            client.country === "IT")) &&
        // A withholding excludes it even at 0 % (art. 17-ter, c. 1-sexies: fees subject to it).
        !c.components.some((component) => component.kind === "withholding") &&
        c.taxTotal.amount > 0n &&
        until !== undefined &&
        input.issueDate <= until;
      expect(amountOf(c, "it.split-payment") !== undefined).toBe(expected);
    });
  });

  it("totals reconcile: total = lines + contributions + VAT + charged stamp duty", () => {
    property((_item, c) => {
      let total = c.subtotal;
      for (const component of c.components) {
        if (component.effect === "adds-to-total") total = add(total, component.amount);
      }
      expect(c.total).toEqual(total);
      const summary = c.vatSummary.reduce((sum, row) => sum + row.base.amount + row.tax.amount, 0n);
      expect(summary).toBe(c.total.amount);
    });
  });

  it("countable revenue ≤ total; = total in forfettario without cassa and disbursements; 0 in ordinario", () => {
    property((item, c) => {
      const revenue = countableRevenue(item.config, c);
      expect(revenue.amount <= c.total.amount).toBe(true);
      if (item.config.regime === "ordinario") {
        expect(revenue.amount).toBe(0n);
        return;
      }
      const cassa = amountOf(c, "it.cassa") !== undefined;
      const disbursements = c.lines.some((line) => line.groupId === "n1");
      if (!cassa && !disbursements) expect(revenue).toEqual(c.total);
    });
  });
});

// --- Invariants of the rounding policy -------------------------------------------------------------

/** Every quantity an integer and every unit price whole cents: every line total is exact. */
function exactLines(input: InvoiceInput): InvoiceInput {
  return {
    ...input,
    lines: input.lines.map((line) => ({
      ...line,
      quantity: rescaleDecimal(line.quantity, 0, "floor"),
      unitPrice: price(
        decimalToString(rescaleDecimal(line.unitPrice.amount, 2, "halfUp")),
        line.unitPrice.currency,
      ),
    })),
  };
}

/** What a legally relevant document shows: totals, component amounts, summary rows, notes. */
function figures(c: InvoiceComputation): unknown {
  return {
    totals: [c.subtotal, c.taxableBase, c.taxTotal, c.total, c.withholdingTotal, c.netPayable],
    components: c.components.map((component) => [
      component.id,
      component.base,
      component.amount,
      component.allocations,
    ]),
    summary: c.vatSummary.map((row) => [row.groupId, row.base, row.tax]),
    notes: c.legalNotes.map((note) => note.id),
  };
}

describe("rounding policy invariants (docs section 8)", () => {
  it("rounds per group, not per line: splitting a line into two changes no figure", () => {
    property(
      (item, c) => {
        // exactLines made every quantity an integer (scale 0): split it into q / 3 and the rest.
        const lines = item.input.lines.flatMap((line) => {
          const first = line.quantity.coefficient / 3n;
          const second = line.quantity.coefficient - first;
          return [
            { ...line, id: `${line.id}a`, quantity: decimal(first.toString()) },
            { ...line, id: `${line.id}b`, quantity: decimal(second.toString()) },
          ];
        });
        const split = run(item.config, { ...item.input, lines });
        expect(split === undefined ? undefined : figures(split)).toEqual(figures(c));
      },
      caseArbitrary({ refusable: false }).map((item) => ({
        ...item,
        input: exactLines(item.input),
      })),
    );
  });

  it("is linear when no rounding is needed: doubling every quantity doubles every amount", () => {
    // Integer quantities, unit prices in multiples of €1,000,000 (10^8 cents) and integer percent
    // rates: every percentage is exact (at most three nested, e.g. VAT on the cassa on the general
    // expenses, or the withholding rate on the base share of fees + general expenses + rivalsa),
    // and every amount not subject to VAT is 0 or far above €77.47.
    const exact = caseArbitrary({ refusable: false, integer: true }).map((item) => ({
      ...item,
      input: {
        ...item.input,
        lines: item.input.lines.map((line) => ({
          ...line,
          quantity: decimal(`${rescaleDecimal(line.quantity, 0, "floor").coefficient % 10n}`),
          unitPrice: price(
            `${(rescaleDecimal(line.unitPrice.amount, 0, "floor").coefficient % 20n) * 1_000_000n}`,
            "EUR",
          ),
        })),
      },
    }));
    property((item, c) => {
      const doubled = run(item.config, {
        ...item.input,
        lines: item.input.lines.map((line) => ({
          ...line,
          quantity: decimal((line.quantity.coefficient * 2n).toString()),
        })),
      });
      if (doubled === undefined) throw new Error("doubling never makes an input unsupported");
      const amounts = (computation: InvoiceComputation, factor: bigint) =>
        computation.components.map((component) => [
          component.id,
          component.id === "it.stamp-duty"
            ? component.amount
            : multiplyByInteger(component.amount, factor),
        ]);
      expect(amounts(doubled, 1n)).toEqual(amounts(c, 2n));
      const stamp = cents(
        c.components.find(
          (component) => component.id === "it.stamp-duty" && component.effect === "adds-to-total",
        )?.amount,
      );
      expect(doubled.total.amount - stamp).toBe(2n * (c.total.amount - stamp));
      expect(doubled.withholdingTotal.amount).toBe(2n * c.withholdingTotal.amount);
    }, exact);
  });
});
