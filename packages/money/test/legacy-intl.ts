import { overrideExactStringFormattingForTests } from "../src/format";

/** The real constructor, captured before any test replaces it. */
const ModernNumberFormat = Intl.NumberFormat;

const FRACTION_OPTIONS = ["minimumFractionDigits", "maximumFractionDigits"] as const;

/**
 * `Intl.NumberFormat` as engines without Intl.NumberFormat v3 (ECMA-402 2023) implement it:
 * Chrome/Edge before 106, Firefox before 116, Safari before 15.4.
 *
 * - fraction digits above 20 throw a `RangeError` (v3 raised the cap to 100);
 * - `signDisplay: "negative"` throws a `RangeError` (added by v3);
 * - strings are converted to a float before formatting (v3 formats them exactly).
 */
class LegacyNumberFormat extends ModernNumberFormat {
  constructor(locales?: string | readonly string[], options?: Intl.NumberFormatOptions) {
    for (const key of FRACTION_OPTIONS) {
      const digits = options?.[key];
      if (digits !== undefined && (digits < 0 || digits > 20)) {
        throw new RangeError(`${key} value is out of range.`);
      }
    }
    if (options?.signDisplay === "negative") {
      throw new RangeError("Value negative out of range for Intl.NumberFormat options property");
    }
    super(locales as string | string[] | undefined, options);
  }

  override format(value: number | bigint | Intl.StringNumericLiteral): string {
    return super.format(typeof value === "string" ? Number(value) : value);
  }

  // Optional like the ES2018 overload `formatToParts(number?: number | bigint)` it overrides.
  override formatToParts(
    value?: number | bigint | Intl.StringNumericLiteral,
  ): Intl.NumberFormatPart[] {
    return super.formatToParts(typeof value === "string" ? Number(value) : value);
  }
}

/**
 * Runs `run` with `Intl.NumberFormat` replaced by {@link LegacyNumberFormat}, so that the package
 * detects an engine without exact string formatting by itself and takes the fallback path.
 */
export function withLegacyIntl<T>(run: () => T): T {
  Object.defineProperty(Intl, "NumberFormat", {
    value: LegacyNumberFormat,
    writable: true,
    configurable: true,
  });
  overrideExactStringFormattingForTests(undefined);
  try {
    return run();
  } finally {
    Object.defineProperty(Intl, "NumberFormat", {
      value: ModernNumberFormat,
      writable: true,
      configurable: true,
    });
    overrideExactStringFormattingForTests(undefined);
  }
}
