import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";

import { amountArb, currencyArb, decimalArb, moneyArb, normalizeSpaces } from "../test/arbitraries";
import { withLegacyIntl } from "../test/legacy-intl";
import type { CurrencyCode } from "./currency";
import { minorUnitExponent } from "./currency";
import { MAX_DECIMAL_SCALE, decimal, decimalToString } from "./decimal";
import type { Decimal } from "./decimal";
import {
  exactParts,
  fallbackParts,
  formatDecimal,
  formatMoney,
  formatMoneyToParts,
  formatPercent,
  formatPrice,
  overrideExactStringFormattingForTests,
  pluralProxy,
  supportsExactStringFormatting,
} from "./format";
import type { FormatMoneyOptions } from "./format";
import { money } from "./money";
import { toDecimalString } from "./parse";
import { price } from "./price";

/** Spaces normalized (ICU versions disagree on U+00A0/U+202F) and bidi marks removed. */
function plain(text: string): string {
  return normalizeSpaces(text).replace(/[\u200E\u200F\u061C]/g, "");
}

afterEach(() => {
  overrideExactStringFormattingForTests(undefined);
});

const MONEY_CASES: readonly (readonly [string, CurrencyCode, bigint, string])[] = [
  ["en-US", "USD", 123456n, "$1,234.56"],
  ["en-US", "USD", -123456n, "-$1,234.56"],
  ["en-US", "EUR", 1234567890123456789n, "€12,345,678,901,234,567.89"],
  ["en-US", "JPY", 1234567n, "¥1,234,567"],
  ["en-US", "KWD", 1234567n, "KWD 1,234.567"],
  ["en-US", "CLF", 12345n, "CLF 1.2345"],
  ["it-IT", "EUR", 1234567n, "12.345,67 €"],
  ["it-IT", "EUR", -50n, "-0,50 €"],
  ["it-IT", "EUR", 1234567890123456789015n, "12.345.678.901.234.567.890,15 €"],
  ["de-CH", "CHF", 123456789n, "CHF 1’234’567.89"],
  ["de-CH", "CHF", -123456789n, "CHF-1’234’567.89"],
  ["fr-FR", "EUR", 123456n, "1 234,56 €"],
  ["fr-FR", "EUR", -123456n, "-1 234,56 €"],
  ["fr-FR", "CHF", 5n, "0,05 CHF"],
  ["ja-JP", "JPY", 1234567n, "￥1,234,567"],
  ["ja-JP", "JPY", -5n, "-￥5"],
  ["ja-JP", "EUR", 123456n, "€1,234.56"],
  ["ar-EG", "KWD", 1234567n, "١٬٢٣٤٫٥٦٧ د.ك."],
  ["ar-EG", "KWD", -5n, "-٠٫٠٠٥ د.ك."],
  ["ar-KW", "KWD", 1234567n, "١٬٢٣٤٫٥٦٧ د.ك."],
  ["ar-EG", "EUR", 0n, "٠٫٠٠ €"],
];

describe("formatMoney", () => {
  it.each(MONEY_CASES)("%s %s %s -> %s", (locale, currency, amount, expected) => {
    expect(plain(formatMoney(money(amount, currency), locale))).toBe(expected);
  });

  it("keeps every digit of huge values (a float would not)", () => {
    const huge = money(123456789012345678901234567890123456789n, "EUR");
    expect(formatMoney(huge, "en-US", { useGrouping: false })).toBe(
      "€1234567890123456789012345678901234567.89",
    );
  });

  it("uses the ISO exponent, not CLDR's display digits", () => {
    // CLDR shows IQD with 0 decimals; ISO 4217 says 3.
    expect(plain(formatMoney(money(1500n, "IQD"), "en-US"))).toBe("IQD 1.500");
  });

  it("does not round like a float would (1.005 is 1.00499... as a double)", () => {
    expect(formatMoney(money(1005n, "KWD"), "en-US", { currencyDisplay: "code" })).toMatch(
      /1\.005$/,
    );
  });

  it.each([
    [{ currencyDisplay: "code" }, 123456n, "EUR 1,234.56"],
    [{ currencyDisplay: "name" }, 123456n, "1,234.56 euros"],
    [{ currencyDisplay: "narrowSymbol" }, 123456n, "€1,234.56"],
    [{ currencyDisplay: "symbol" }, 123456n, "€1,234.56"],
    [{ signDisplay: "always" }, 123456n, "+€1,234.56"],
    [{ signDisplay: "always" }, 0n, "+€0.00"],
    [{ signDisplay: "exceptZero" }, 0n, "€0.00"],
    [{ signDisplay: "exceptZero" }, -50n, "-€0.50"],
    [{ signDisplay: "negative" }, -50n, "-€0.50"],
    [{ signDisplay: "negative" }, 50n, "€0.50"],
    [{ signDisplay: "never" }, -100n, "€1.00"],
    [{ signDisplay: "auto" }, -100n, "-€1.00"],
    [{ useGrouping: false }, 123456n, "€1234.56"],
    [{ useGrouping: true }, 123456n, "€1,234.56"],
    [{}, 123456n, "€1,234.56"],
  ] as const)("applies %j", (options: FormatMoneyOptions, amount, expected) => {
    expect(plain(formatMoney(money(amount, "EUR"), "en-US", options))).toBe(expected);
  });

  it("accepts a list of locales and rejects invalid ones", () => {
    expect(formatMoney(money(100n, "EUR"), ["zz", "en-US"])).toBe("€1.00");
    expect(() => formatMoney(money(100n, "EUR"), "not a locale!")).toThrow(RangeError);
  });

  it("ignores options it does not know (fraction digits stay pinned)", () => {
    const sneaky = { maximumFractionDigits: 0 } as unknown as FormatMoneyOptions;
    expect(formatMoney(money(123456n, "EUR"), "en-US", sneaky)).toBe("€1,234.56");
  });

  it("formatMoneyToParts returns frozen parts", () => {
    const parts = formatMoneyToParts(money(-123456n, "EUR"), "en-US");
    expect(parts.map((part) => part.type)).toEqual([
      "minusSign",
      "currency",
      "integer",
      "group",
      "integer",
      "decimal",
      "fraction",
    ]);
    expect(Object.isFrozen(parts)).toBe(true);
    expect(Object.isFrozen(parts[0])).toBe(true);
  });

  it("formats Arabic-Indic digits with the right parts", () => {
    const parts = formatMoneyToParts(money(-1234567n, "KWD"), "ar-EG");
    const numeric = parts
      .filter((part) =>
        ["minusSign", "integer", "group", "decimal", "fraction"].includes(part.type),
      )
      .map((part) => part.value)
      .join("");
    expect(numeric).toBe("-١٬٢٣٤٫٥٦٧");
    expect(parts.find((part) => part.type === "currency")?.value).toBe("د.ك.");
  });

  it("strips to the digits of toDecimalString (en-US, code, no grouping)", () => {
    fc.assert(
      fc.property(moneyArb, (value) => {
        const formatted = formatMoney(value, "en-US", {
          useGrouping: false,
          currencyDisplay: "code",
        });
        expect(formatted.replace(/[^\d-]/g, "")).toBe(toDecimalString(value).replace(".", ""));
      }),
    );
  });
});

describe("exact string formatting", () => {
  it("is detected on this runtime and memoized", () => {
    expect(supportsExactStringFormatting()).toBe(true);
    expect(supportsExactStringFormatting()).toBe(true);
  });

  it("can be forced off for tests, and re-detected", () => {
    overrideExactStringFormattingForTests(false);
    expect(supportsExactStringFormatting()).toBe(false);
    overrideExactStringFormattingForTests(undefined);
    expect(supportsExactStringFormatting()).toBe(true);
  });
});

describe("fallback formatting (engines without Intl.NumberFormat v3)", () => {
  const LOCALES = [
    "en-US",
    "it-IT",
    "de-CH",
    "fr-FR",
    "ja-JP",
    "ar-EG",
    "ar-KW",
    // Plural rules that depend on the fraction digits ("0,01 euros" but "1,00 euro").
    "es-ES",
    "lv-LV",
    "ga-IE",
    "en-IN",
    "hi-IN-u-nu-deva",
    "th-TH-u-nu-thai",
    "zh-CN-u-nu-hanidec",
    "en-u-nu-adlm",
  ];
  const CURRENCIES: readonly CurrencyCode[] = ["EUR", "JPY", "KWD", "CHF", "CLF", "USD"];
  const AMOUNTS = [0n, 1n, -1n, 5n, -5n, 50n, -50n, 99n, 100n, -100n, 123456n, -123456n];
  AMOUNTS.push(201n, 1000000n, 10n ** 25n + 7n, -(10n ** 25n) - 7n);
  const OPTIONS: readonly FormatMoneyOptions[] = [
    {},
    { currencyDisplay: "code" },
    { currencyDisplay: "name" },
    { signDisplay: "always" },
    { signDisplay: "exceptZero" },
    { signDisplay: "negative" },
    { signDisplay: "never" },
    { useGrouping: false },
  ];

  function base(currency: CurrencyCode, options: FormatMoneyOptions): Intl.NumberFormatOptions {
    return { style: "currency", currency, ...options };
  }

  // Exhaustive cross product (15 locales × 6 currencies × amounts × options): ~2.5 s alone, over
  // 10 s when Turborepo runs every package's tests in parallel, hence the explicit timeout.
  it(
    "gives parts identical to the exact path for every locale, currency, amount and option",
    {
      timeout: 60_000,
    },
    () => {
      for (const locale of LOCALES) {
        for (const currency of CURRENCIES) {
          const e = minorUnitExponent(currency);
          for (const amount of AMOUNTS) {
            for (const options of OPTIONS) {
              const value = { coefficient: amount, scale: e };
              const exact = exactParts(locale, base(currency, options), value, e, e);
              const fallback = fallbackParts(locale, base(currency, options), value, e, e);
              expect(
                fallback,
                `${locale} ${currency} ${amount} ${JSON.stringify(options)}`,
              ).toEqual(exact);
            }
          }
        }
      }
    },
  );

  it("localizes astral digits (Adlam) correctly", () => {
    const value = { coefficient: -5n, scale: 2 };
    const parts = fallbackParts("en-u-nu-adlm", { style: "decimal" }, value, 2, 2);
    expect(parts.map((part) => part.value).join("")).toBe("-𞥐.𞥐𞥕");
  });

  it("gives identical parts for random amounts, prices and decimals", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LOCALES),
        currencyArb,
        amountArb,
        decimalArb,
        (locale, currency, amount, raw) => {
          const e = minorUnitExponent(currency);
          const options = base(currency, {});
          const value = { coefficient: amount, scale: e };
          expect(fallbackParts(locale, options, value, e, e)).toEqual(
            exactParts(locale, options, value, e, e),
          );
          const max = Math.max(e, raw.scale);
          expect(fallbackParts(locale, options, raw, e, max)).toEqual(
            exactParts(locale, options, raw, e, max),
          );
          const plainNumber = { style: "decimal" } as const;
          expect(fallbackParts(locale, plainNumber, raw, raw.scale, raw.scale)).toEqual(
            exactParts(locale, plainNumber, raw, raw.scale, raw.scale),
          );
        },
      ),
    );
  });

  it("is used by the public functions when the engine lacks exact string formatting", () => {
    const value = money(-1234567890123456789n, "EUR");
    const expected = formatMoney(value, "it-IT");
    const expectedPrice = formatPrice(price("0.4250", "EUR"), "fr-FR");
    const expectedDecimal = formatDecimal(decimal("-0.05"), "ar-EG");
    const expectedPercent = formatPercent(decimal("22.5"), "de-DE");
    overrideExactStringFormattingForTests(false);
    expect(formatMoney(value, "it-IT")).toBe(expected);
    expect(
      formatMoneyToParts(value, "it-IT")
        .map((part) => part.value)
        .join(""),
    ).toBe(expected);
    expect(formatPrice(price("0.4250", "EUR"), "fr-FR")).toBe(expectedPrice);
    expect(formatDecimal(decimal("-0.05"), "ar-EG")).toBe(expectedDecimal);
    expect(formatPercent(decimal("22.5"), "de-DE")).toBe(expectedPercent);
  });
});

/** The sign and digits of formatted parts, without the words around them. */
function numberOf(formatted: readonly Intl.NumberFormatPart[]): string {
  const types = ["minusSign", "plusSign", "integer", "group", "decimal", "fraction"];
  return formatted
    .filter((part) => types.includes(part.type))
    .map((part) => part.value)
    .join("");
}

/** Runs `format` on the exact path, the forced fallback and a simulated legacy engine. */
function onEveryPath(format: () => string): readonly string[] {
  const exact = format();
  overrideExactStringFormattingForTests(false);
  const fallback = format();
  overrideExactStringFormattingForTests(undefined);
  return [exact, fallback, withLegacyIntl(format)].map(plain);
}

/** Locales whose plural category depends on the fraction digits (CLDR operands v, f, t, n). */
const FRACTION_PLURAL_LOCALES = ["es-ES", "lv-LV", "lt-LT", "ga-IE", "cy-GB", "br-FR", "gd-GB"];

describe("plural-dependent words (currencyDisplay: name) on every path", () => {
  // Each row is a case where a template with a zero fraction ("0.01" formatted as "1.00", "2.01" as
  // "2.00") has another plural category, so its words would be wrong.
  it.each([
    ["es-ES", "EUR", 1n, "0,01 euros"],
    ["es-ES", "EUR", 100n, "1,00 euro"],
    ["es-ES", "EUR", -101n, "-1,01 euros"],
    ["lv-LV", "USD", 2n, "0,02 ASV dolāri"],
    ["lv-LV", "USD", 201n, "2,01 ASV dolārs"],
    ["lt-LT", "EUR", 1n, "0,01 euro"],
    ["lt-LT", "EUR", 100n, "1,00 euras"],
    ["lt-LT", "EUR", 1001n, "10,01 euro"],
    ["ga-IE", "GBP", 1n, "0.01 punt steirling"],
    ["ga-IE", "USD", 201n, "2.01 dollar S.A.M."],
    ["cy-GB", "GBP", 1n, "0.01 punt Prydain"],
    ["cy-GB", "USD", 201n, "2.01 doler UDA"],
    ["br-FR", "USD", 201n, "2,01 dollar SU"],
    ["gd-GB", "EUR", 301n, "3.01 Eòro"],
    ["gd-GB", "GBP", 1n, "0.01 punnd Sasannach"],
  ] as const)("%s %s %s -> %s", (locale, currency, amount, expected) => {
    const value = money(amount, currency);
    const paths = onEveryPath(() => formatMoney(value, locale, { currencyDisplay: "name" }));
    expect(paths).toEqual([expected, expected, expected]);
  });

  it("matches the exact path for every amount of at most 15 significant digits", () => {
    const names: readonly CurrencyCode[] = ["EUR", "USD", "GBP", "JPY", "KWD", "CLF"];
    fc.assert(
      fc.property(
        fc.constantFrom(...FRACTION_PLURAL_LOCALES),
        fc.constantFrom(...names),
        fc.bigInt({ min: -(10n ** 15n) + 1n, max: 10n ** 15n - 1n }),
        fc.constantFrom<FormatMoneyOptions>({}, { signDisplay: "always" }),
        (locale, currency, amount, options) => {
          const e = minorUnitExponent(currency);
          const base = {
            style: "currency",
            currency,
            currencyDisplay: "name",
            ...options,
          } as const;
          const value = { coefficient: amount, scale: e };
          expect(fallbackParts(locale, base, value, e, e)).toEqual(
            exactParts(locale, base, value, e, e),
          );
        },
      ),
    );
  });

  it("keeps every digit beyond 15 significant digits (only ICU's float-based words can differ)", () => {
    // Above 15 significant digits ICU itself picks the plural category from a float approximation
    // (lt-LT: 10^23 + 0.07 is "few" because the double nearest to 10^23 ends in 2), while the
    // fallback's proxy keeps the residues of the exact value (0.07, "many"). Digits never differ.
    fc.assert(
      fc.property(
        fc.constantFrom(...FRACTION_PLURAL_LOCALES),
        fc.bigInt({ min: -(10n ** 40n), max: 10n ** 40n }),
        fc.integer({ min: 0, max: 4 }),
        (locale, amount, scale) => {
          const base = { style: "currency", currency: "EUR", currencyDisplay: "name" } as const;
          const value = { coefficient: amount, scale };
          const min = Math.min(2, scale);
          expect(numberOf(fallbackParts(locale, base, value, min, scale))).toBe(
            numberOf(exactParts(locale, base, value, min, scale)),
          );
        },
      ),
    );
  });
});

const ASCII_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

describe("pluralProxy (internal)", () => {
  it.each([
    ["only zeros after the point", false, 0n, "00", undefined],
    ["no fraction", false, 7n, "", undefined],
    ["a short value, as is", true, 0n, "01", ["-0.01", 2]],
    ["15 significant digits, as is", false, 12345678901234n, "5", ["12345678901234.5", 1]],
    ["13 significant digits, 12 decimals", false, 5n, "000000000012", ["5.000000000012", 12]],
    ["16 digits: integer modulo 10^6, plus 10^6", false, 123456789012345n, "50", ["1012345.50", 2]],
    ["the last 18 integer digits, as ICU", true, 10n ** 18n + 2000001n, "5", ["-1000001.5", 1]],
    ["integer digits beyond 18 dropped", false, 10n ** 23n, "07", ["0.07", 2]],
    ["21 decimals: fraction compressed", false, 0n, `${"0".repeat(20)}1`, ["0.00000001", 8]],
    ["at most 3 significant decimals kept", false, 2n, "0000000000000000123", ["2.00000123", 8]],
    [
      "last 3 behind a 1, 3 trailing zeros",
      false,
      1n,
      "123456789012345678900000",
      ["1.01789000", 8],
    ],
  ] as const)("%s", (_name, negative, integer, fraction, expected) => {
    const proxy = pluralProxy(negative, integer, fraction);
    expect(proxy === undefined ? undefined : [proxy.text, proxy.fractionDigits]).toEqual(expected);
  });

  it("never has more than 15 significant digits or 20 decimals", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.bigInt({ min: 0n, max: 10n ** 45n }),
        fc.string({ unit: fc.constantFrom(...ASCII_DIGITS), maxLength: MAX_DECIMAL_SCALE }),
        (negative, integer, fraction) => {
          const proxy = pluralProxy(negative, integer, fraction);
          if (proxy === undefined) return;
          const [whole = "", decimals = ""] = proxy.text.replace("-", "").split(".");
          expect(`${whole}${decimals}`.replace(/^0+/, "").length).toBeLessThanOrEqual(15);
          expect(decimals.length).toBe(proxy.fractionDigits);
          expect(proxy.fractionDigits).toBeLessThanOrEqual(20);
        },
      ),
    );
  });
});

describe("on an engine without Intl.NumberFormat v3 (simulated)", () => {
  it("takes the fallback, as the simulated engine only offers ES2020 Intl", () => {
    withLegacyIntl(() => {
      expect(supportsExactStringFormatting()).toBe(false);
      expect(() => new Intl.NumberFormat("en-US", { maximumFractionDigits: 21 })).toThrow(
        RangeError,
      );
      expect(() => new Intl.NumberFormat("en-US", { signDisplay: "negative" })).toThrow(RangeError);
      expect(new Intl.NumberFormat("en-US").format("9007199254740993")).toBe(
        "9,007,199,254,740,992",
      );
    });
    expect(supportsExactStringFormatting()).toBe(true);
  });

  /** Decimals with 21 to 40 decimals: the template is formatted with at most 20. */
  const WIDE_SCALES = [
    `0.${"0".repeat(20)}1`,
    "-1234.5678901234567890123456789",
    `0.${"0".repeat(39)}1`,
    `-${"9".repeat(40)}.${"9".repeat(40)}`,
    "-0.1000000000000000000000",
    "12.000000000000000000000000",
  ];
  const WIDE_LOCALES = ["en-US", "fr-FR", "ar-EG", "es-ES", "hi-IN-u-nu-deva", "en-u-nu-adlm"];

  function formatAll(value: Decimal, locale: string): readonly string[] {
    const unitPrice = price(decimalToString(value), "EUR");
    return [
      formatDecimal(value, locale),
      formatPercent(value, locale),
      formatPrice(unitPrice, locale),
      formatPrice(unitPrice, locale, { signDisplay: "negative", currencyDisplay: "code" }),
      formatPrice(unitPrice, locale, { signDisplay: "exceptZero", useGrouping: false }),
    ];
  }

  it.each(WIDE_SCALES)("formats %s (scale above 20) like the exact path", (text) => {
    const value = decimal(text);
    for (const locale of WIDE_LOCALES) {
      const exact = formatAll(value, locale);
      expect(
        withLegacyIntl(() => formatAll(value, locale)),
        locale,
      ).toEqual(exact);
    }
  });

  it("formats any decimal of up to 80 digits and 40 decimals like the exact path", () => {
    const wideDecimalArb = fc
      .tuple(
        fc.bigInt({ min: -(10n ** 40n), max: 10n ** 40n }),
        fc.integer({ min: 0, max: MAX_DECIMAL_SCALE }),
      )
      .map(([coefficient, scale]) => decimal(decimalToString({ coefficient, scale })));
    fc.assert(
      fc.property(fc.constantFrom(...WIDE_LOCALES), wideDecimalArb, (locale, value) => {
        const unitPrice = price(decimalToString(value), "KWD");
        const format = () => [
          formatDecimal(value, locale),
          formatPrice(unitPrice, locale),
          formatPrice(unitPrice, locale, { currencyDisplay: "code", signDisplay: "always" }),
        ];
        expect(withLegacyIntl(format)).toEqual(format());
      }),
    );
  });

  it("gives the words of the exact path too, up to 15 significant digits", () => {
    const shortDecimalArb = fc
      .tuple(
        fc.bigInt({ min: -(10n ** 15n) + 1n, max: 10n ** 15n - 1n }),
        fc.integer({ min: 0, max: MAX_DECIMAL_SCALE }),
      )
      .map(([coefficient, scale]) => decimal(decimalToString({ coefficient, scale })));
    fc.assert(
      fc.property(
        fc.constantFrom(...FRACTION_PLURAL_LOCALES, ...WIDE_LOCALES),
        shortDecimalArb,
        currencyArb,
        (locale, value, currency) => {
          const unitPrice = price(decimalToString(value), currency);
          const format = () => [
            formatPercent(value, locale),
            formatPrice(unitPrice, locale, { currencyDisplay: "name" }),
            formatPrice(unitPrice, locale, { currencyDisplay: "name", signDisplay: "negative" }),
          ];
          expect(withLegacyIntl(format)).toEqual(format());
        },
      ),
    );
  });
});

describe("formatPrice", () => {
  it.each([
    ["it-IT", "0.4253", "EUR", "0,4253 €"],
    ["en-US", "50", "EUR", "€50.00"],
    ["en-US", "0.4250", "EUR", "€0.425"],
    ["en-US", "0.4200", "EUR", "€0.42"],
    ["en-US", "0.12345678", "EUR", "€0.12345678"],
    ["ja-JP", "1500.5", "JPY", "￥1,500.5"],
    ["ja-JP", "1500", "JPY", "￥1,500"],
    ["en-US", "0.4", "KWD", "KWD 0.400"],
    ["de-CH", "-12.5", "CHF", "CHF-12.50"],
  ] as const)("%s %s %s -> %s", (locale, amount, currency, expected) => {
    expect(plain(formatPrice(price(amount, currency), locale))).toBe(expected);
  });

  it("applies the money options", () => {
    expect(formatPrice(price("0.4253", "EUR"), "en-US", { currencyDisplay: "code" })).toBe(
      "EUR\u00A00.4253",
    );
  });
});

describe("formatDecimal and formatPercent", () => {
  it.each([
    ["de-DE", "1234.50", "1.234,50"],
    ["en-US", "-0.000001", "-0.000001"],
    ["en-US", "1234567890123456789.123456789", "1,234,567,890,123,456,789.123456789"],
    ["fr-FR", "1234567.25", "1 234 567,25"],
    ["ar-EG", "1234.5", "١٬٢٣٤٫٥"],
    ["en-US", "7", "7"],
  ])("formatDecimal %s %s -> %s", (locale, value, expected) => {
    expect(plain(formatDecimal(decimal(value), locale))).toBe(expected);
  });

  it.each([
    ["en-US", "22", "22%"],
    ["it-IT", "22", "22%"],
    ["fr-FR", "22", "22 %"],
    ["de-DE", "4.5", "4,5 %"],
    ["en-US", "-0.5", "-0.5%"],
    ["en-US", "22.00", "22.00%"],
  ])("formatPercent %s %s -> %s", (locale, value, expected) => {
    expect(plain(formatPercent(decimal(value), locale))).toBe(expected);
  });
});
