import * as z from "zod";

const DecimalString = z.string().regex(/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/);
/** Exactly the currency exponent's fractional digits: "1042.00" for EUR. */
const AmountString = DecimalString;

const SourceCitationSchema = z
  .object({
    title: z.string().min(1),
    citation: z.string().min(1),
    url: z.url({ protocol: /^https$/ }).optional(),
  })
  .strict();

const ExpectedComponentSchema = z
  .object({
    id: z.string(),
    kind: z
      .enum(["contribution", "surcharge", "tax", "withholding", "stamp-duty", "other"])
      .optional(),
    effect: z.enum(["adds-to-total", "deducted-from-payable", "informational"]).optional(),
    base: AmountString.optional(),
    rate: DecimalString.optional(),
    amount: AmountString,
    allocations: z
      .array(z.object({ groupId: z.string(), base: AmountString, amount: AmountString }).strict())
      .optional(),
    exportCodes: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const ExpectedSchema = z
  .object({
    parameters: z.string().optional(), // parameter version id
    /** Lines to check, matched by id (not exhaustive). */
    lines: z
      .array(
        z.object({ id: z.string(), net: AmountString, groupId: z.string().optional() }).strict(),
      )
      .optional(),
    subtotal: AmountString.optional(),
    components: z.array(ExpectedComponentSchema).optional(),
    /** When true (default), the computation has exactly these component ids, in this order. */
    componentsExhaustive: z.boolean().default(true),
    /** Exhaustive and ordered when present. */
    vatSummary: z
      .array(
        z
          .object({
            groupId: z.string(),
            treatment: z.enum(["taxable", "exempt", "out-of-scope", "excluded"]).optional(),
            rate: DecimalString.optional(),
            base: AmountString,
            tax: AmountString,
          })
          .strict(),
      )
      .optional(),
    taxableBase: AmountString.optional(),
    taxTotal: AmountString.optional(),
    total: AmountString.optional(),
    withholdingTotal: AmountString.optional(),
    netPayable: AmountString.optional(),
    legalNotes: z.array(z.string()).optional(), // ids, exhaustive and ordered
    warnings: z.array(z.string()).optional(), // codes, exhaustive and ordered
    /** Rule ids of the trace in order, consecutive duplicates collapsed ("core" included). */
    traceRuleIds: z.array(z.string()).optional(),
  })
  .strict();

/**
 * A golden fixture (design section 6): one real-world scenario per file in
 * `fixtures/invoices/<name>.json`. Matching: amounts compare as strings against
 * `toDecimalString` ("1042.00", not "1042"), rates by value; absent fields are not checked;
 * exhaustive lists match in content and order. `expectedError.issueCodes`, when present, equals
 * the set of distinct issue codes of the error (order-insensitive).
 */
export const GoldenFixtureSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    description: z.string().min(1),
    pack: z.string(),
    /** Why these numbers are right: statutes, rulings, worked examples. */
    sources: z.array(SourceCitationSchema).min(1),
    config: z.unknown(),
    input: z.unknown(), // parsed with InvoiceInputJsonSchema by the runner
    expected: ExpectedSchema.optional(),
    expectedError: z
      .object({
        code: z.enum([
          "invalid-input",
          "invalid-config",
          "invalid-options",
          "unsupported-input",
          "parameters-not-found",
        ]),
        issueCodes: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((f) => (f.expected === undefined) !== (f.expectedError === undefined), {
    message: "exactly one of expected and expectedError",
  });

export type GoldenFixture = z.output<typeof GoldenFixtureSchema>;
/** The JSON form of a fixture file (defaults not yet applied). */
export type GoldenFixtureJson = z.input<typeof GoldenFixtureSchema>;
