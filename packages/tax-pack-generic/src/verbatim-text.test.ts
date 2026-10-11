/**
 * User-supplied text (the tax label, the notes, the withholding label) is a `text` parameter: it
 * is printed verbatim in every locale and never read as ICU syntax (docs/tax-packs/generic.md,
 * section 5). Each scenario runs twice, with a plain sentinel and with ICU-like text, and every
 * formatted string (group labels, component labels, trace steps, legal notes, warnings) must be
 * the sentinel's output with the sentinel replaced by that text.
 */
import { formatComputation, formatTrace, type InvoiceComputation } from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { CLIENTS, compute, line, type ClientJson, type LineJson } from "../test/helpers";
import type { GenericConfigInput } from "./config";
import { genericPack } from "./index";

/** Text with ICU meaning: braces, arguments, plural syntax, quoting apostrophes. */
const TEXTS: readonly (readonly [string, string])[] = [
  ["an opening brace", "{"],
  ["a closing brace", "}"],
  ["an apostrophe before a brace (ICU quoting)", "'{"],
  ["an ICU plural argument", "{x, plural, one {#} other {#}}"],
  ["apostrophes", "It's 'quoted' ''"],
  ["a lone apostrophe", "'"],
  ["typographic and ASCII apostrophes", "l’IVA d'Italia"],
  ["the name of a placeholder of the pack", "{label}"],
  ["a number sign", "#"],
];

const SENTINEL = "Zqsentinelqz";
const LOCALES = ["en", "it"] as const;
type Locale = (typeof LOCALES)[number];

interface Scenario {
  readonly config: (text: string) => GenericConfigInput;
  readonly lines: readonly LineJson[];
  readonly client: ClientJson;
  readonly options?: Readonly<Record<string, string>>;
  /** Strings that must appear, exactly, in each category (a check that the text is printed). */
  readonly expected: (
    text: string,
    locale: Locale,
  ) => {
    readonly groups: readonly string[];
    readonly components: readonly string[];
    readonly legalNotes: readonly string[];
    readonly traceIncludes: readonly string[];
  };
}

const LINES: readonly LineJson[] = [
  line("100", undefined, { id: "l1", description: "Design" }),
  line("50", { kind: "exempt" }, { id: "l2", description: "Training" }),
];

const withEverything =
  (taxScope: "per-document" | "per-line") =>
  (text: string): GenericConfigInput => ({
    taxLabel: text,
    tax: { kind: "rate", rate: "20" },
    exemptNote: text,
    reverseCharge: { mode: "foreign-business-clients", supplierCountry: "DE", note: text },
    withholding: { label: text, rate: "10", appliesTo: "business-clients" },
    rounding: { taxScope },
    documentNote: text,
  });

const SCENARIOS: Readonly<Record<string, Scenario>> = {
  "taxed invoice": {
    config: withEverything("per-document"),
    lines: LINES,
    client: CLIENTS.deBusiness,
    expected: (text, locale) => ({
      groups: [`${text} 20%`, locale === "en" ? "Exempt" : "Esente"],
      components: [text, text],
      legalNotes: [text, text],
      traceIncludes:
        locale === "en"
          ? [
              `${text} at 20% on the taxable amount`,
              `${text}: 10% of the amount before tax, disbursements excluded`,
            ]
          : [
              `${text} (aliquota 20%) sull’imponibile`,
              `${text}: 10% dell’importo prima dell’imposta, spese anticipate escluse`,
            ],
    }),
  },
  "per-line tax": {
    config: withEverything("per-line"),
    lines: LINES,
    client: CLIENTS.deBusiness,
    expected: (text, locale) => ({
      groups: [`${text} 20%`, locale === "en" ? "Exempt" : "Esente"],
      components: [text, text],
      legalNotes: [text, text],
      traceIncludes:
        locale === "en"
          ? [
              `${text} at 20% on “Design”`,
              `${text} at 20%: the tax of each line, rounded and added up`,
            ]
          : [
              `${text} (aliquota 20%) su “Design”`,
              `${text} (aliquota 20%): imposta di ogni riga, arrotondata e sommata`,
            ],
    }),
  },
  "reverse charge": {
    config: withEverything("per-document"),
    lines: LINES,
    client: CLIENTS.frBusiness,
    expected: (text, locale) => ({
      groups: locale === "en" ? ["Reverse charge", "Exempt"] : ["Inversione contabile", "Esente"],
      components: [text],
      legalNotes: [text, text, text],
      traceIncludes:
        locale === "en"
          ? [
              `Reverse charge: business client in FR, supplier in DE, so the client accounts for the ${text}. The pack compares countries only: checking that the reverse charge is allowed (EU membership, VAT registration, place of supply) is your responsibility`,
              `No ${text} charged: the reverse charge applies`,
            ]
          : [
              `Inversione contabile: cliente impresa in FR, fornitore in DE, quindi l’imposta (${text}) è assolta dal cliente. Il pacchetto confronta solo i paesi: verificare che l’inversione contabile sia ammessa (appartenenza all’UE, partita IVA, luogo della prestazione) è tua responsabilità`,
              `Nessuna imposta (${text}) addebitata: si applica l’inversione contabile`,
            ],
    }),
  },
  "forced reverse charge": {
    config: withEverything("per-document"),
    lines: [line("100", undefined, { id: "l1", description: "Design" })],
    client: CLIENTS.deBusiness,
    options: { reverseCharge: "apply" },
    expected: (text, locale) => ({
      groups: [locale === "en" ? "Reverse charge" : "Inversione contabile"],
      components: [text],
      legalNotes: [text, text],
      traceIncludes:
        locale === "en"
          ? [`Reverse charge, forced on this invoice: the client accounts for the ${text}`]
          : [
              `Inversione contabile forzata su questa fattura: l’imposta (${text}) è assolta dal cliente`,
            ],
    }),
  },
  "no tax": {
    config: (text) => ({
      taxLabel: text,
      tax: { kind: "none", note: text },
      withholding: { label: text, rate: "10" },
      documentNote: text,
    }),
    lines: [line("100", undefined, { id: "l1", description: "Design" })],
    client: CLIENTS.deBusiness,
    expected: (text, locale) => ({
      groups: [locale === "en" ? `No ${text}` : `Senza ${text}`],
      components: [],
      legalNotes: [text, text],
      traceIncludes:
        locale === "en"
          ? [
              `No ${text}: the tax settings say that no tax applies`,
              `No ${text}: the client is not a withholding agent`,
            ]
          : [
              `Nessuna imposta (${text}): le impostazioni fiscali non prevedono imposta`,
              `Nessuna ritenuta (${text}): il cliente non è sostituto d’imposta`,
            ],
    }),
  },
};

function run(scenario: Scenario, text: string): InvoiceComputation {
  return compute(scenario.config(text), scenario.lines, {
    client: scenario.client,
    ...(scenario.options === undefined ? {} : { options: scenario.options }),
  });
}

/** Every user-visible string of a computation in `locale`. */
function formatted(c: InvoiceComputation, locale: Locale) {
  const computation = formatComputation(c, genericPack, locale);
  return {
    groups: computation.vatSummary.map((row) => row.label),
    components: computation.components.map((component) => component.label),
    trace: formatTrace(c, genericPack, locale).map((step) => [step.text, step.formula ?? ""]),
    legalNotes: computation.legalNotes.map((note) => note.text),
    documentLegalNotes: computation.documentLegalNotes.map((note) => note.text),
    warnings: computation.warnings.map((warning) => warning.text),
  };
}

/** `value` with every string's sentinel replaced by `text` (split/join: no `$` patterns). */
function substitute(value: unknown, text: string): unknown {
  if (typeof value === "string") return value.split(SENTINEL).join(text);
  if (Array.isArray(value)) return value.map((item) => substitute(item, text));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substitute(item, text)]),
    );
  }
  return value;
}

const ROWS = Object.entries(SCENARIOS).flatMap(([name, scenario]) =>
  TEXTS.flatMap(([label, text]) =>
    LOCALES.map((locale) => [name, label, locale, scenario, text] as const),
  ),
);

describe("user-supplied text with ICU-like syntax is printed verbatim", () => {
  it("uses a sentinel that no catalog contains", () => {
    for (const catalog of Object.values(genericPack.messages)) {
      for (const value of Object.values(catalog)) expect(value).not.toContain(SENTINEL);
    }
  });

  it.each(ROWS)("%s, %s, %s", (_name, _label, locale, scenario, text) => {
    const plain = formatted(run(scenario, SENTINEL), locale);
    const tricky = formatted(run(scenario, text), locale);
    expect(tricky).toEqual(substitute(plain, text));

    const expected = scenario.expected(text, locale);
    expect(tricky.groups).toEqual(expected.groups);
    expect(tricky.components).toEqual(expected.components);
    expect(tricky.legalNotes).toEqual(expected.legalNotes);
    expect(tricky.documentLegalNotes).toEqual(expected.legalNotes);
    const texts = tricky.trace.map(([step]) => step);
    for (const step of expected.traceIncludes) expect(texts).toContain(step);
  });
});
