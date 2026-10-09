# Tax engine design: `@fairhour/money`, `@fairhour/tax-core`, conformance suite and the core bridge

- **Status:** Accepted design, ready for implementation (phase 2)
- **Date:** 2026-10-09
- **Owner:** `architect` subagent (design and implementation of `packages/tax-*`)
- **Backlog:** CORE-002, CORE-009, TAX-002, TAX-003, TAX-009, TAX-011 (the country packs, TAX-004 to
  TAX-008, are specified in [`docs/tax-packs/it.md`](../tax-packs/it.md) and
  [`docs/tax-packs/generic.md`](../tax-packs/generic.md))
- **Decisions:** [ADR-0003 Money representation](../adr/0003-money-representation.md),
  [ADR-0004 Tax engine architecture](../adr/0004-tax-engine-architecture.md),
  [ADR-0002 Licensing](../adr/0002-licensing.md)

This document is the contract between the packages. It is written so that `money`, `tax-core`,
the packs and the `core` bridge can be implemented **in parallel by different people** and still
fit together. Every public type and function signature is given; where this document and an
implementation disagree, the implementation is wrong or this document must be amended in the
same pull request.

Contents:

1. [Package map and license boundary](#1-package-map-and-license-boundary)
2. [Global invariants](#2-global-invariants)
3. [`@fairhour/money`](#3-fairhourmoney)
4. [`@fairhour/tax-core`](#4-fairhourtax-core)
5. [Conformance suite](#5-conformance-suite)
6. [Golden fixtures](#6-golden-fixtures)
7. [Core to engine bridge (`@fairhour/core`)](#7-core-to-engine-bridge-fairhourcore)
8. [Pack package layout](#8-pack-package-layout)
9. [Implementation plan](#9-implementation-plan)
10. [Open points](#10-open-points)

---

## 1. Package map and license boundary

```text
                     MIT (embeddable)                         |   AGPL-3.0-only (product)
                                                              |
  @fairhour/money  <──  @fairhour/tax-core  <──  @fairhour/tax-pack-it          |
        ^                  ^    ^                @fairhour/tax-pack-generic     |
        |                  |    └─────────────── @fairhour/tax-pack-template    |
        |                  |                                                     |
        └──────────────────┴──────────────────────────────  @fairhour/core  <── @fairhour/api <── apps/web
                                                              |               (also db, pdf, desktop)
```

Arrows point from the importer to the imported package. Rules (from ADR-0002, made concrete):

- `money` has **no runtime dependencies**. Its optional `@fairhour/money/zod` entry point has
  `zod` (MIT) as an optional peer dependency.
- `tax-core` depends at runtime on `money` and `zod` only. Its `@fairhour/tax-core/conformance`
  entry point additionally uses `vitest` and `fast-check` (both MIT) as **optional peer
  dependencies**; the main entry point must never import them.
- `tax-pack-*` depend at runtime on `money`, `tax-core` and `zod` only.
- No MIT package imports an AGPL workspace package (`core`, `db`, `api`, `ui`, `pdf`, `config` at
  runtime, apps). AGPL packages may import MIT ones freely.
- Logic that a pack might need (date arithmetic on ISO dates, money math, message formatting) lives
  in `money` or `tax-core`, never in `core`.

Enforcement (implemented with the packages, phase 2):

1. `"license": "MIT"` and an MIT `LICENSE` file in `packages/money`, `packages/tax-core` and every
   `packages/tax-pack-*`.
2. ESLint `no-restricted-imports` in the MIT packages: only `@fairhour/money`,
   `@fairhour/tax-core` (not from `money`), `zod`, and (in `tax-core/src/conformance/**` and test
   files) `vitest`, `fast-check`, `node:fs`, `node:path`, `node:url` are allowed among bare
   specifiers. `money` itself imports nothing but `zod` in `src/zod.ts`.
3. The license-boundary CI check announced in ADR-0002 (a tested script under `scripts/`) fails
   when an MIT package lists a non-allowlisted runtime dependency or any AGPL workspace package.

---

## 2. Global invariants

These hold everywhere in `money`, `tax-core` and the packs. Reviewers check them; tests enforce
the testable ones.

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | No JavaScript `number` ever holds an amount, rate, quantity or exchange rate. Forbidden on such values: floats, `Number(...)`, `parseFloat`, `parseInt`, `toFixed`, `Math.round`/`floor`/`ceil`, `+x`. ESLint `no-restricted-syntax`/`no-restricted-globals` rules in the MIT packages flag them. `number` is allowed for counts, indexes, scales and exponents. |
| G2  | Amounts are `Money` (`bigint` minor units + ISO 4217 code). Rates, quantities, exchange rates and unit prices are exact `Decimal`/`Price` values parsed from strings.                                                                                                                                                                                            |
| G3  | Every operation that can produce a fraction of a minor unit takes an explicit `RoundingMode`. There is no default rounding mode anywhere in the public API.                                                                                                                                                                                                      |
| G4  | Values are plain, deeply frozen objects. Functions never mutate their arguments.                                                                                                                                                                                                                                                                                 |
| G5  | Purity: no I/O, no `Date.now()`, no `new Date()` without an explicit input, no `Math.random`, no environment access, no network, no global mutable state (the only allowed cache is a memoized feature detection of `Intl`, see [3.9](#39-formatting-without-floats)).                                                                                           |
| G6  | Determinism: the same `(pack version, config, input)` produces a byte-identical `InvoiceComputation` JSON (key order included).                                                                                                                                                                                                                                  |
| G7  | Totals reconcile exactly; the engine asserts it and throws `ReconciliationError` otherwise.                                                                                                                                                                                                                                                                      |
| G8  | All amounts in a computation are non-negative and in the invoice currency. Credit notes carry positive magnitudes; `documentKind` gives the direction.                                                                                                                                                                                                           |
| G9  | JSON never carries a `bigint` or a float for money: amounts, decimals and prices are decimal strings.                                                                                                                                                                                                                                                            |
| G10 | Every rule and every parameter version cites at least one `SourceRef`; uncertain citations say so (`verification.status = 'to-be-verified'`).                                                                                                                                                                                                                    |

---

## 3. `@fairhour/money`

MIT. Zero runtime dependencies. Works unchanged in Node 22+, modern browsers and the Tauri
webview. Backlog: CORE-002. Decision record: ADR-0003.

### 3.1 Module layout

```text
packages/money/
  package.json            exports: "." -> src/index.ts, "./zod" -> src/zod.ts
  LICENSE                 MIT
  src/
    index.ts              public re-exports (everything below except internals)
    errors.ts             MoneyError and subclasses
    currencies.data.ts    ISO 4217 snapshot (generated once, committed, reviewed)
    currency.ts           CurrencyCode, CurrencyInfo, lookup and guards
    rounding.ts           RoundingMode, divideAndRound
    decimal.ts            Decimal type, parser, exact arithmetic, rescaling
    money.ts              Money type, constructors, add/subtract/compare/sum
    arithmetic.ts         multiply, percentage, divide, allocate, convert
    price.ts              Price (unit price with sub-minor-unit precision), extend
    parse.ts              parseMoney, toDecimalString, toDecimal, fromDecimal
    format.ts             formatMoney, formatMoneyToParts, formatPrice, formatDecimal
    json.ts               MoneyJson/PriceJson codecs
    zod.ts                zod 4 schemas (optional entry point, zod is an optional peer)
    *.test.ts             unit and property tests next to the code
```

### 3.2 Currencies

```ts
// src/currency.ts
import { CURRENCY_DATA } from "./currencies.data";

/** Every active ISO 4217 alphabetic code in the snapshot, as a literal union. */
export type CurrencyCode = keyof typeof CURRENCY_DATA;

export type MinorUnitExponent = 0 | 2 | 3 | 4;

export interface CurrencyInfo {
  readonly code: CurrencyCode;
  /** ISO 4217 numeric code, three digits, zero-padded ("036"). */
  readonly numeric: string;
  /** ISO 4217 "minor unit": number of decimal places of the minor unit. */
  readonly exponent: MinorUnitExponent;
  /** English name from the ISO list. */
  readonly name: string;
}

export function isCurrencyCode(value: string): value is CurrencyCode;
/** Throws InvalidCurrencyError. Accepts only the exact upper-case code. */
export function assertCurrencyCode(value: string): CurrencyCode;
export function currencyInfo(code: CurrencyCode): CurrencyInfo;
export function minorUnitExponent(code: CurrencyCode): MinorUnitExponent;
/** All codes, sorted alphabetically (stable, for pickers and tests). */
export const CURRENCY_CODES: readonly CurrencyCode[];
```

`currencies.data.ts` is a frozen `as const` object built from the ISO 4217 List One published by
SIX (the maintenance agency). It contains every active alphabetic code that has a numeric minor
unit, excludes precious metals and test codes (`XAU`, `XAG`, `XPD`, `XPT`, `XBA`-`XBD`, `XDR`,
`XSU`, `XUA`, `XTS`, `XXX`), and records the snapshot date in a header comment. The file must
contain at least the following codes with exactly these values (unit-tested):

| Code | Numeric | Exp. | Code | Numeric | Exp. | Code | Numeric | Exp. | Code | Numeric | Exp. |
| ---- | ------- | ---- | ---- | ------- | ---- | ---- | ------- | ---- | ---- | ------- | ---- |
| EUR  | 978     | 2    | PLN  | 985     | 2    | AUD  | 036     | 2    | ZAR  | 710     | 2    |
| USD  | 840     | 2    | CZK  | 203     | 2    | NZD  | 554     | 2    | TRY  | 949     | 2    |
| GBP  | 826     | 2    | HUF  | 348     | 2    | BRL  | 986     | 2    | KWD  | 414     | 3    |
| CHF  | 756     | 2    | RON  | 946     | 2    | MXN  | 484     | 2    | BHD  | 048     | 3    |
| JPY  | 392     | 0    | BGN  | 975     | 2    | INR  | 356     | 2    | TND  | 788     | 3    |
| SEK  | 752     | 2    | CAD  | 124     | 2    | CNY  | 156     | 2    | ISK  | 352     | 0    |
| NOK  | 578     | 2    | DKK  | 208     | 2    | KRW  | 410     | 0    | CLP  | 152     | 0    |

Every code whose exponent is not 2 (unit-tested as a complete list against the snapshot):
exponent 0: BIF, CLP, DJF, GNF, ISK, JPY, KMF, KRW, PYG, RWF, UGX, UYI, VND, VUV, XAF, XOF, XPF;
exponent 3: BHD, IQD, JOD, KWD, LYD, OMR, TND; exponent 4: CLF, UYW.

Notes:

- The exponent is the **ISO 4217** minor unit, not the CLDR display digits. They differ for some
  currencies (CLDR shows 0 decimals for IQD and RSD, for example); formatting therefore always
  passes the ISO exponent to `Intl` explicitly (see [3.9](#39-formatting-without-floats)).
- Bulgaria adopted the euro on 2026-01-01 and the lev stopped being legal tender on 2026-02-01.
  `BGN` stays in the table so that historical invoices remain readable; when ISO moves it to the
  historic list, a new snapshot keeps it under a `HISTORIC_CURRENCY_DATA` export rather than
  deleting it.
- Updating the snapshot is a reviewed change with its own test diff, never an automatic job.

### 3.3 Rounding

```ts
// src/rounding.ts
/**
 * halfUp    ties away from zero (ECMA-402 "halfExpand", Java HALF_UP): 2.5 -> 3, -2.5 -> -3
 * halfEven  ties to the even neighbour (banker's rounding):           2.5 -> 2,  3.5 -> 4
 * halfDown  ties toward zero:                                          2.5 -> 2, -2.5 -> -2
 * up        away from zero:                                            2.1 -> 3, -2.1 -> -3
 * down      toward zero (truncation):                                  2.9 -> 2, -2.9 -> -2
 * ceiling   toward +infinity:                                          2.1 -> 3, -2.9 -> -2
 * floor     toward -infinity:                                          2.9 -> 2, -2.1 -> -3
 */
export type RoundingMode = "halfUp" | "halfEven" | "halfDown" | "up" | "down" | "ceiling" | "floor";

export const ROUNDING_MODES: readonly RoundingMode[];
export function isRoundingMode(value: string): value is RoundingMode;

/**
 * numerator / denominator rounded to an integer with `mode`.
 * The single rounding primitive: every other function in the package delegates to it.
 * @throws DivisionByZeroError when denominator is 0n
 */
export function divideAndRound(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint;
```

Algorithm (normative):

1. If `denominator < 0n`, negate both. Let `q = numerator / denominator` (bigint division truncates
   toward zero) and `r = numerator % denominator`. If `r === 0n`, return `q`.
2. Let `s = numerator < 0n ? -1n : 1n` and `c = compare(2n * |r|, denominator)` (`-1 | 0 | 1`).
3. Return, by mode: `down`: `q`; `up`: `q + s`; `ceiling`: `s > 0n ? q + 1n : q`; `floor`:
   `s < 0n ? q - 1n : q`; `halfUp`: `c >= 0 ? q + s : q`; `halfDown`: `c > 0 ? q + s : q`;
   `halfEven`: `c > 0 ? q + s : c < 0 ? q : (q % 2n === 0n ? q : q + s)`.

Reference table (the table-driven test must contain at least these rows):

| exact | halfUp | halfEven | halfDown | up  | down | ceiling | floor |
| ----- | ------ | -------- | -------- | --- | ---- | ------- | ----- |
| 2.5   | 3      | 2        | 2        | 3   | 2    | 3       | 2     |
| -2.5  | -3     | -2       | -2       | -3  | -2   | -2      | -3    |
| 3.5   | 4      | 4        | 3        | 4   | 3    | 4       | 3     |
| 2.4   | 2      | 2        | 2        | 3   | 2    | 3       | 2     |
| -2.6  | -3     | -3       | -3       | -3  | -2   | -2      | -3    |
| 0.5   | 1      | 0        | 0        | 1   | 0    | 1       | 0     |
| -0.5  | -1     | 0        | 0        | -1  | 0    | 0       | -1    |
| 7     | 7      | 7        | 7        | 7   | 7    | 7       | 7     |

### 3.4 `Decimal`

```ts
// src/decimal.ts
/** Exact decimal: value = coefficient × 10^(-scale). Not normalized: "1.50" keeps scale 2. */
export interface Decimal {
  readonly coefficient: bigint;
  /** Integer, 0 ≤ scale ≤ MAX_DECIMAL_SCALE. */
  readonly scale: number;
}

export const MAX_DECIMAL_SCALE = 40;
/** Maximum number of digits accepted by the parser (integer + fraction), a DoS guard. */
export const MAX_DECIMAL_DIGITS = 80;

export const DECIMAL_ZERO: Decimal; // 0, scale 0
export const DECIMAL_ONE: Decimal; // 1, scale 0
export const DECIMAL_HUNDRED: Decimal; // 100, scale 0

/** Strict parser. @throws InvalidAmountError (reason "syntax" | "out-of-range") */
export function decimal(value: string): Decimal;
export function tryDecimal(value: string): Decimal | undefined;
export function isDecimalString(value: string): boolean;
export function isDecimal(value: unknown): value is Decimal;
export function decimalFromInteger(value: bigint): Decimal;

/** Canonical text keeping the scale: decimal("1.50") -> "1.50", decimal("-0.0") -> "0.0". */
export function decimalToString(value: Decimal): string;
/** Strips trailing fractional zeros: 1.50 -> 1.5, 2.000 -> 2, 0.00 -> 0. */
export function normalizeDecimal(value: Decimal): Decimal;
/** Changes the scale, rounding with `mode` when digits are dropped. */
export function rescaleDecimal(value: Decimal, scale: number, mode: RoundingMode): Decimal;

export function addDecimal(a: Decimal, b: Decimal): Decimal; // exact, scale = max
export function subtractDecimal(a: Decimal, b: Decimal): Decimal; // exact, scale = max
/** Exact; scale = a.scale + b.scale, normalized if it exceeds MAX_DECIMAL_SCALE.
 *  @throws InvalidAmountError (reason "scale-overflow") if it still exceeds it. */
export function multiplyDecimal(a: Decimal, b: Decimal): Decimal;
/** a / b rounded to `scale` digits. @throws DivisionByZeroError */
export function divideDecimal(a: Decimal, b: Decimal, scale: number, mode: RoundingMode): Decimal;
export function negateDecimal(value: Decimal): Decimal;
export function absDecimal(value: Decimal): Decimal;
export function compareDecimal(a: Decimal, b: Decimal): -1 | 0 | 1;
/** Equality by value: decimal("1.5") equals decimal("1.50"). */
export function decimalEquals(a: Decimal, b: Decimal): boolean;
export function isZeroDecimal(value: Decimal): boolean;
export function signDecimal(value: Decimal): -1 | 0 | 1;
```

Parser grammar (strict, locale-independent, no surrounding whitespace):

```text
decimal  = ["-"] integer ["." digit+]
integer  = "0" | nonzero digit*
```

Accepted: `"0"`, `"22"`, `"0.5"`, `"-1.25"`, `"1.50"`, `"-0"` (becomes 0). Rejected (`syntax`): `""`,
`"+1"`, `"1."`, `".5"`, `"01"`, `"1e3"`, `"1,5"`, `" 1"`, `"1_000"`, `"NaN"`, `"Infinity"`, `"0x10"`.
More than `MAX_DECIMAL_DIGITS` digits or a scale above `MAX_DECIMAL_SCALE` is `out-of-range`.

### 3.5 `Money`

```ts
// src/money.ts
export interface Money {
  /** Integer number of minor units (cents for EUR, yen for JPY, fils for KWD). */
  readonly amount: bigint;
  readonly currency: CurrencyCode;
}

/** Frozen constructor. @throws InvalidCurrencyError */
export function money(amount: bigint, currency: CurrencyCode): Money;
export function zero(currency: CurrencyCode): Money;
export function isMoney(value: unknown): value is Money;

/** @throws CurrencyMismatchError when currencies differ (all binary operations below). */
export function add(a: Money, b: Money): Money;
export function subtract(a: Money, b: Money): Money;
export function negate(value: Money): Money;
export function abs(value: Money): Money;
/** Sum of `items`; `currency` is required so that an empty list has a well-defined result. */
export function sum(items: readonly Money[], currency: CurrencyCode): Money;
export function multiplyByInteger(value: Money, factor: bigint): Money; // exact

export function compare(a: Money, b: Money): -1 | 0 | 1;
/** Same currency and amount. Different currencies -> false (never throws). */
export function equals(a: Money, b: Money): boolean;
export function lessThan(a: Money, b: Money): boolean;
export function lessThanOrEqual(a: Money, b: Money): boolean;
export function greaterThan(a: Money, b: Money): boolean;
export function greaterThanOrEqual(a: Money, b: Money): boolean;
export function min(first: Money, ...rest: readonly Money[]): Money;
export function max(first: Money, ...rest: readonly Money[]): Money;
export function isZero(value: Money): boolean;
export function isPositive(value: Money): boolean;
export function isNegative(value: Money): boolean;
```

### 3.6 Arithmetic with rounding

```ts
// src/arithmetic.ts
/** value × factor, rounded to minor units. Exact formula: amount × coefficient / 10^scale. */
export function multiply(value: Money, factor: Decimal, mode: RoundingMode): Money;

/** value × ratePercent / 100. percentage(m, decimal("22"), "halfUp") is 22 % of m.
 *  Exact formula: amount × coefficient / 10^(scale + 2). */
export function percentage(value: Money, ratePercent: Decimal, mode: RoundingMode): Money;

/** value / divisor. @throws DivisionByZeroError */
export function divide(value: Money, divisor: Decimal, mode: RoundingMode): Money;

/**
 * Splits `value` proportionally to `ratios` with the largest-remainder method.
 * Never loses or creates a minor unit: sum(result) === value.
 * @throws InvalidAmountError (reason "no-ratios" | "negative-ratio"), DivisionByZeroError (all ratios 0)
 */
export function allocate(value: Money, ratios: readonly Decimal[]): readonly Money[];

/**
 * Converts with an explicit rate: `rate` units of `to` (major units) per 1 unit of `value.currency`.
 * @throws InvalidAmountError (reason "non-positive-rate"; or "same-currency-rate" when the
 *         currencies are equal and rate ≠ 1)
 */
export function convert(value: Money, to: CurrencyCode, rate: Decimal, mode: RoundingMode): Money;
```

`allocate` algorithm (normative, deterministic):

1. Bring every ratio to the common scale `S = max(scale_i)`: integer weights
   `w_i = coefficient_i × 10^(S − scale_i)`; `W = Σ w_i`. Reject an empty list or a negative ratio;
   `W = 0` is a division by zero.
2. `A = |value.amount|`. For each `i`: `share_i = (A × w_i) / W` (truncated), `rem_i = (A × w_i) % W`.
3. `L = A − Σ share_i` (always `0 ≤ L < count of positive weights`). Add `1n` to the `L` shares with
   the largest `rem_i`, ties broken by the lower index.
4. If `value.amount < 0`, negate every share. Return a frozen array of `Money`.

Examples: `allocate(€1.00, [1, 1, 1])` = `[0.34, 0.33, 0.33]`; `allocate(-€1.00, [1, 1, 1])` =
`[-0.34, -0.33, -0.33]`; `allocate(€0.05, [0, 1])` = `[0.00, 0.05]`;
`allocate(€10.00, [0.3, 0.7])` = `[3.00, 7.00]`; `allocate(¥100, [1, 2])` = `[33, 67]`.

`convert` formula: with source exponent `e_f`, target exponent `e_t` and `rate = c × 10^(−s)`,
`k = e_t − e_f − s`; the result is `amount × c × 10^k` when `k ≥ 0`, otherwise
`divideAndRound(amount × c, 10^(−k), mode)`. Example: €12.34 to JPY at `"161.25"`: `1234 × 16125`
over `10^4` = 1989.8... -> `¥1,990` (halfUp).

### 3.7 `Price`: unit prices with sub-minor-unit precision

Unit prices legitimately carry more decimals than the currency's minor unit: mileage tariffs
such as €0.4253/km, a day rate divided by eight hours, or FatturaPA's `PrezzoUnitario`, which
allows up to 8 decimals. A unit price is therefore not a `Money`. Line totals are.

```ts
// src/price.ts
export interface Price {
  /** Major units, exact. Scale ≥ the currency exponent is not required ("50" is €50). */
  readonly amount: Decimal;
  readonly currency: CurrencyCode;
}

/** @throws InvalidAmountError, InvalidCurrencyError */
export function price(amount: string, currency: CurrencyCode): Price;
export function priceFromMoney(value: Money): Price; // exact, scale = exponent
export function isPrice(value: unknown): value is Price;
/** quantity × unitPrice rounded to the currency's minor units: the line total. */
export function extend(unitPrice: Price, quantity: Decimal, mode: RoundingMode): Money;
/** Exact conversion of a unit price (no rounding): amount × rate. */
export function convertPrice(value: Price, to: CurrencyCode, rate: Decimal): Price;
```

### 3.8 Parsing and decimal strings

```ts
// src/parse.ts
/**
 * "1234.56" in EUR -> 123456n. Same grammar as `decimal`. Extra fractional digits are accepted
 * only when they are zeros ("1.230" EUR is fine, "1.235" throws reason "too-precise").
 * @throws InvalidAmountError, InvalidCurrencyError
 */
export function parseMoney(value: string, currency: CurrencyCode): Money;
/** Exactly `exponent` fractional digits: EUR "-0.50", JPY "1234", KWD "1.234". */
export function toDecimalString(value: Money): string;
export function toDecimal(value: Money): Decimal; // exact
export function fromDecimal(value: Decimal, currency: CurrencyCode, mode: RoundingMode): Money;
```

### 3.9 Formatting without floats

```ts
// src/format.ts
export interface FormatMoneyOptions {
  readonly currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
  readonly signDisplay?: "auto" | "always" | "exceptZero" | "negative" | "never";
  readonly useGrouping?: boolean;
}

export function formatMoney(
  value: Money,
  locales: string | readonly string[],
  options?: FormatMoneyOptions,
): string;
export function formatMoneyToParts(
  value: Money,
  locales: string | readonly string[],
  options?: FormatMoneyOptions,
): readonly Intl.NumberFormatPart[];
/** Shows at least the currency exponent and at most the price's own scale. */
export function formatPrice(
  value: Price,
  locales: string | readonly string[],
  options?: FormatMoneyOptions,
): string;
/** Plain number (style "decimal"), exactly `value.scale` fractional digits. */
export function formatDecimal(value: Decimal, locales: string | readonly string[]): string;
/** Percent units: decimal("22") -> "22%" (en), "22%" (it), "22 %" (fr). */
export function formatPercent(value: Decimal, locales: string | readonly string[]): string;
/** Memoized feature detection, exported for tests. */
export function supportsExactStringFormatting(): boolean;
```

Mechanism:

- `formatMoney` builds `new Intl.NumberFormat(locales, { style: 'currency', currency,
minimumFractionDigits: e, maximumFractionDigits: e, ...options })` with `e` the ISO exponent and
  passes **the decimal string** from `toDecimalString` (typed as `Intl.StringNumericLiteral`).
  Because the string has exactly `e` fractional digits and the formatter is pinned to `e`, `Intl`
  never rounds.
- ECMA-402 2023 (Intl.NumberFormat v3) defines string arguments as exact decimal values ("Intl
  mathematical values") instead of converting them to `Number`. **Verified in this repository's
  toolchain** (Node 22.22.0, V8 12.4, ICU 77.1) on 2026-10-09:
  - `format("12345678901234567890.15")` in `it-IT`/EUR gives `12.345.678.901.234.567.890,15 €`
    (all digits kept; a float would print `...567.890,00` or lose digits);
  - `format("1.005")` with 2 digits gives `1,01 €` (exact half-expand; the float `1.005` is
    `1.00499...` and would print `1,00 €`);
  - `format(12345678901234567890n)` (bigint) is exact as well;
  - invalid strings do **not** throw: `format("abc")` returns `€NaN`, which is why only strings
    produced by `toDecimalString` are ever passed;
  - `format("-0")` prints `-€0.00`; `toDecimalString` never produces a negative zero.
- Browser support for exact string formatting (MDN compatibility data, not re-verified here):
  Chrome/Edge 106+, Firefox 116+, Safari 15.4+. `supportsExactStringFormatting()` detects it
  once: `new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 0 })
.format('9007199254740993')` must equal `'9007199254740993'` (2^53 + 1, which a float rounds).
- **Fallback** (engines without v3, still exact): split the amount into the integer part `I`
  (bigint) and the fraction digits `F`. Format a bigint template with `formatToParts`: `I` itself,
  or `±1n` when `I = 0` (to obtain the sign and symbol layout), with
  `minimumFractionDigits = maximumFractionDigits = e`. Replace the `integer` parts by the localized
  digits of `0` when the template was `±1n`, and replace the `fraction` part by `F` transliterated
  into the locale's numbering system (digits obtained from `formatToParts(1234567890n)`).
  Bigint formatting has been exact since ES2020, so neither path converts to `Number`.
- Tests compare `formatToParts` output or normalize U+00A0/U+202F spaces, because ICU versions
  differ in the space they put between number and symbol.

### 3.10 JSON

`bigint` is not JSON-serializable, so every boundary uses explicit codecs (G9).

```ts
// src/json.ts
export interface MoneyJson {
  readonly amount: string;
  readonly currency: string;
} // "1234.56", "EUR"
export interface PriceJson {
  readonly amount: string;
  readonly currency: string;
} // "0.4253", "EUR"
export function moneyToJson(value: Money): MoneyJson; // amount via toDecimalString
/** @throws InvalidAmountError, InvalidCurrencyError */
export function moneyFromJson(json: MoneyJson): Money; // strict parseMoney
export function priceToJson(value: Price): PriceJson;
export function priceFromJson(json: PriceJson): Price;
```

```ts
// src/zod.ts   (entry point "@fairhour/money/zod"; zod ^4 optional peer dependency)
import * as z from "zod";
export const currencyCodeSchema: z.ZodType<CurrencyCode, string>;
/** Validated decimal string (stays a string: for JSON configs and forms). */
export const decimalStringSchema: z.ZodString;
/** Decimal string -> Decimal. */
export const decimalSchema: z.ZodType<Decimal, string>;
/** { amount: "1234.56", currency: "EUR" } -> Money. */
export const moneyJsonSchema: z.ZodType<Money, MoneyJson>;
/** Amount string in a currency fixed by the caller -> Money. */
export function moneyStringSchema(currency: CurrencyCode): z.ZodType<Money, string>;
export const priceJsonSchema: z.ZodType<Price, PriceJson>;
```

### 3.11 Errors

```ts
// src/errors.ts
export type MoneyErrorCode =
  "invalid-amount" | "invalid-currency" | "currency-mismatch" | "division-by-zero";

export abstract class MoneyError extends Error {
  abstract readonly code: MoneyErrorCode;
}
export type InvalidAmountReason =
  | "syntax"
  | "out-of-range"
  | "too-precise"
  | "scale-overflow"
  | "no-ratios"
  | "negative-ratio"
  | "non-positive-rate"
  | "same-currency-rate";

export class InvalidAmountError extends MoneyError {
  readonly code = "invalid-amount";
  readonly reason: InvalidAmountReason;
  constructor(reason: InvalidAmountReason, message: string);
}
export class InvalidCurrencyError extends MoneyError {
  readonly code = "invalid-currency";
  readonly value: string;
  constructor(value: string);
}
export class CurrencyMismatchError extends MoneyError {
  readonly code = "currency-mismatch";
  readonly left: CurrencyCode;
  readonly right: CurrencyCode;
  constructor(left: CurrencyCode, right: CurrencyCode);
}
export class DivisionByZeroError extends MoneyError {
  readonly code = "division-by-zero";
}
```

Error messages never include the offending amount when it could be user data in logs; they name
the reason and, for syntax errors, the length of the input.

### 3.12 Test plan (`money`)

Coverage ≥ 95 % lines, branches, functions and statements.

Table-driven (`*.test.ts`):

1. `divideAndRound`: the reference table of 3.3 for all seven modes, plus negative denominators
   and `0n` numerator; division by zero throws.
2. `decimal`: at least 25 valid/invalid strings from 3.4 with the expected coefficient/scale or
   error reason; `decimalToString` round-trips every valid input except `"-0"`.
3. `parseMoney`/`toDecimalString` for EUR, JPY, KWD, CLF (exponent 4): `"0"`, `"0.5"` (EUR 50n),
   `"1.230"` (accepted), `"1.235"` (`too-precise`), `"-0.50"`, the largest 80-digit value.
4. `multiply`/`percentage` with ties in every mode: 22 % of €0.25 = 0.055 -> halfUp 0.06,
   halfEven 0.06, halfDown 0.05, down 0.05, ceiling 0.06; 10 % of €0.25 = 0.025 -> halfEven 0.02;
   4 % of €0.13 = 0.0052 -> halfUp 0.01, down 0.00, up 0.01; negative amounts mirror these.
5. `allocate`: the examples of 3.6, all-zero ratios, a single ratio, 1 000 ratios.
6. `convert`: EUR->JPY, JPY->EUR, EUR->KWD, a rate with 6 decimals, same currency.
7. Formatting: `en-US` USD, `it-IT` EUR, `de-CH` CHF (apostrophe grouping), `ja-JP` JPY, `ar-KW`
   KWD (Arabic-Indic digits), negative values, huge values; the fallback path with a stubbed
   `supportsExactStringFormatting` returning `false` must give identical parts.
8. JSON codecs and zod schemas: valid, invalid, round trip.
9. Currency table: the mandatory rows above and the complete non-2-exponent list.

Property-based (fast-check 4, arbitraries `bigint` amounts in `[-10^18, 10^18]`, decimals with
scale 0..8):

- `add` is associative and commutative; `zero` is neutral; `subtract(a, a)` is zero;
  `negate(negate(a)) = a`; `sum` equals a left fold of `add`.
- Rounding bounds: for `multiply(m, d, mode)` the result differs from the exact rational value by
  at most ½ minor unit for `halfUp`/`halfEven`/`halfDown` and less than 1 for the directed modes;
  `floor ≤ exact ≤ ceiling`; `down` is toward zero; symmetric modes satisfy
  `round(-x) = -round(x)`.
- `percentage(m, 100) = m`; `multiply(m, 1) = m`; `multiply` by an integer decimal equals
  `multiplyByInteger`.
- `allocate`: the shares sum to the input; each share is within 1 minor unit of its exact
  proportional value; scaling every ratio by a positive constant does not change the result; the
  result is identical across runs.
- `parseMoney(toDecimalString(m)) = m`; `decimal(decimalToString(d))` has the same coefficient and
  scale.
- `formatMoney` (en-US, `useGrouping: false`, `currencyDisplay: 'code'`): stripping everything but
  digits and the minus sign from the output gives the digits of `toDecimalString(m)`.

### 3.13 Changes during implementation

Recorded with CORE-002 (2026-10-09). No public signature changed.

- **Currency snapshot.** 166 codes, taken from the `datasets/currency-codes` mirror of SIX List One
  (SIX's own download was unreachable from the build environment; re-check against `list-one.xml`
  at the next update). ISO had already withdrawn `BGN` (2026-01); it stays in `CURRENCY_DATA` (so
  `CurrencyCode` includes it, as the table above requires) instead of moving to a
  `HISTORIC_CURRENCY_DATA` export, which is deferred until a second historic code is needed.
- **zod schemas are codecs.** The transforming schemas of 3.10 are built with `z.codec`, so
  `z.encode(schema, value)` produces the JSON form; their declared types are unchanged.
- **`formatPercent`** formats with `style: "unit", unit: "percent"` (input in percent units)
  rather than `style: "percent"`, so the bigint fallback of 3.9 works unchanged; the output is the
  same (`"22%"`, `"22 %"`).
- **Fallback digits.** The fallback transliterates fraction digits by formatting the bigint
  `"1" + digits` in the formatter's numbering system and dropping the leading one (handles leading
  zeros and astral digits, such as Adlam), instead of indexing the digits of `1234567890n`.
- **Errors made explicit.** `convertPrice` applies the checks of `convert` (`InvalidCurrencyError`,
  `non-positive-rate`, `same-currency-rate`) and can throw `scale-overflow` from
  `multiplyDecimal`; `rescaleDecimal` and `divideDecimal` throw `InvalidAmountError`
  (`out-of-range`) for a scale outside `0..MAX_DECIMAL_SCALE`; `DivisionByZeroError` takes an
  optional message. Calls from untyped code with a non-`bigint` amount or factor, or an unknown
  rounding mode, throw a plain `TypeError` (a programming error, not a `MoneyError`).

---

## 4. `@fairhour/tax-core`

MIT. Pure engine: types, schemas, the computation pipeline, message formatting, the conformance
suite (separate entry point) and helpers for pack authors. Backlog: TAX-002, TAX-003, TAX-011.
Decision record: ADR-0004.

### 4.1 Module layout and entry points

```text
packages/tax-core/
  package.json      exports: "."            -> src/index.ts
                             "./conformance" -> src/conformance/index.ts
                    dependencies: @fairhour/money, zod ^4
                    peerDependencies (optional): vitest ^5, fast-check ^4
  LICENSE           MIT
  src/
    index.ts                 public API (no vitest/fast-check/node:* imports, ever)
    version.ts               ENGINE_VERSION (equals package.json version; a test checks it)
    primitives.ts            IsoDate, CountryCode, LocaleTag, ids, JsonValue, guards
    countries.data.ts        ISO 3166-1 alpha-2 assigned codes
    sources.ts               SourceRef, SourceVerification
    messages/
      types.ts               MessageRef, MessageParam, MessageCatalogs
      params.ts              `p` helpers that build MessageParam values
      format.ts              formatMessage (ICU subset), parseMessage
      core-messages.ts       the engine's own catalog (en, it), keys prefixed "core."
    input/
      types.ts               InvoiceInput and friends
      schema.ts              InvoiceInputJsonSchema (JSON -> typed), validateInvoiceInput (typed)
      json.ts                parseInvoiceInput, invoiceInputToJson
    pack/
      types.ts               TaxPack, PackMeta, ParameterVersion, RoundingPolicy, capabilities
      rule.ts                Rule, RuleContext, RuleOutput, ComputationState, drafts
      handle.ts              toPackHandle (type-erased registry entry)
    engine/
      compute.ts             computeInvoice
      lines.ts               line totals (core trace steps)
      merge.ts               applies RuleOutput to the state, contract checks
      summary.ts             tax summary and totals derivation
      reconcile.ts           reconciliation assertions
      parameters.ts          resolveParameters, listParameters
      freeze.ts              deepFreeze
    computation/
      types.ts               InvoiceComputation and nested types
      json.ts                computationToJson, computationFromJson, InvoiceComputationJsonSchema
    format/
      trace.ts               formatTrace
      computation.ts         formatComputation
    thresholds/types.ts      AnnualThresholdsCapability (revenue tracker contract)
    helpers/                 functions for rule authors (section 4.11)
    fixtures/schema.ts       GoldenFixtureSchema (exported from "." for packs and tooling)
    errors.ts
    testing/test-pack.ts     internal pack used by tax-core's own tests (not exported)
    conformance/             defineConformanceSuite and checks (section 5)
  fixtures/invoices/*.json   golden fixtures for the internal test pack
```

### 4.2 Primitives

```ts
// src/primitives.ts
/** "YYYY-MM-DD", a real Gregorian date between 1900-01-01 and 9999-12-31. */
export type IsoDate = string & { readonly __brand: "IsoDate" };
/** @throws InvalidIsoDateError */
export function isoDate(value: string): IsoDate;
export function isIsoDate(value: string): value is IsoDate;
export function compareIsoDate(a: IsoDate, b: IsoDate): -1 | 0 | 1; // lexicographic
/** Pure calendar arithmetic (uses Date.UTC on the explicit input only). */
export function addDays(date: IsoDate, days: number): IsoDate;
export function daysBetweenInclusive(from: IsoDate, to: IsoDate): number;
export function yearOf(date: IsoDate): number;

/** ISO 3166-1 alpha-2, upper case, an assigned code. */
export type CountryCode = string & { readonly __brand: "CountryCode" };
export function countryCode(value: string): CountryCode;
export function isCountryCode(value: string): value is CountryCode;

/** BCP 47 tag accepted by Intl.getCanonicalLocales ("en", "it", "it-IT"). */
export type LocaleTag = string;

/** Rule ids: "<packId>.<segment>[.<segment>...]"; see RULE_ID_PATTERN. */
export type RuleId = string;
export const RULE_ID_PATTERN: RegExp; // /^[a-z][a-z0-9-]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
```

### 4.3 Sources

```ts
// src/sources.ts
export type SourceKind =
  | "statute" // laws, decrees with force of law (L., DPR, DL, D.Lgs.)
  | "regulation" // ministerial decrees, regulations
  | "eu-law" // directives, regulations, Council decisions
  | "ruling" // tax authority rulings, answers to interpelli, resolutions
  | "guidance" // circulars, official guides, FAQs
  | "technical-specification" // e.g. FatturaPA specifications
  | "case-law"
  | "professional-practice" // established practice, professional bodies' opinions
  | "user-configuration"; // values supplied by the user (generic pack)

export type SourceVerification =
  | {
      readonly status: "verified";
      readonly on: IsoDate;
      /**
       * primary-text:     the consolidated legal text was read in full;
       * official-summary: an official publication (tax authority guide, ruling, FAQ, Gazette
       *                   notice) or a quoted extract of it confirms the point;
       * secondary:        consistent professional literature confirms it.
       */
      readonly against: "primary-text" | "official-summary" | "secondary";
    }
  | { readonly status: "to-be-verified"; readonly reason: string };

export interface SourceRef {
  /** Unique within a pack: "it.l-190-2014.c54-89". */
  readonly id: string;
  readonly kind: SourceKind;
  /** Official title in the source's language: "Legge 23 dicembre 2014, n. 190". */
  readonly title: string;
  /** Pinpoint citation: "art. 1, commi 54-89". */
  readonly citation: string;
  /** https only. */
  readonly url?: string;
  readonly verification: SourceVerification;
  readonly note?: string;
}
```

The UI shows verified sources normally and `to-be-verified` ones with a visible marker; the docs
of each pack list how every source was checked. Upgrading a verification (for example from
`secondary` to `primary-text`) is a metadata change and does not need a new parameter version.

### 4.4 Messages

Every user-visible text produced by the engine is a `MessageRef`: a key plus typed parameters,
formatted per locale later. English is required for every key; packs add their own locales
(`it` is required for the Italian pack).

```ts
// src/messages/types.ts
/** Dotted key: "core.subtotal", "it.ordinario.vat.trace". */
export type MessageKey = string;

export type MessageParam =
  | { readonly type: "money"; readonly value: Money }
  | { readonly type: "price"; readonly value: Price }
  | { readonly type: "decimal"; readonly value: Decimal }
  | { readonly type: "percent"; readonly value: Decimal } // percent units: 22 -> "22%"
  | { readonly type: "date"; readonly value: IsoDate }
  | { readonly type: "text"; readonly value: string } // verbatim, never translated
  | { readonly type: "message"; readonly value: MessageRef }; // nested, translated

export interface MessageRef {
  readonly key: MessageKey;
  readonly params?: Readonly<Record<string, MessageParam>>;
}

export type MessageCatalog = Readonly<Record<MessageKey, string>>;
/** "en" is mandatory; other keys are locale tags ("it"). */
export type MessageCatalogs = Readonly<{ en: MessageCatalog }> &
  Readonly<Record<LocaleTag, MessageCatalog>>;

// src/messages/params.ts
export const p: {
  money(value: Money): MessageParam;
  price(value: Price): MessageParam;
  decimal(value: Decimal): MessageParam;
  percent(value: Decimal): MessageParam;
  date(value: IsoDate): MessageParam;
  text(value: string): MessageParam;
  message(value: MessageRef): MessageParam;
};
export function message(
  key: MessageKey,
  params?: Readonly<Record<string, MessageParam>>,
): MessageRef;

// src/messages/format.ts
/**
 * Formats with the ICU-compatible subset described below.
 * Locale resolution: exact tag, then its language subtag ("it-IT" -> "it"), then "en".
 * @throws MissingMessageError (key absent from "en"), MessageFormatError (missing parameter,
 *         malformed message, nesting deeper than 4)
 */
export function formatMessage(
  ref: MessageRef,
  catalogs: MessageCatalogs,
  locale: LocaleTag,
): string;
/** Placeholder names used by a message; MessageFormatError if malformed. */
export function parseMessage(text: string): readonly string[];
```

Message syntax (a strict subset of ICU MessageFormat, so the same strings are valid ICU):

- Placeholders are `{name}` with `name` matching `/^[a-zA-Z][a-zA-Z0-9_]*$/`. The parameter's
  `type` decides formatting; there are no ICU argument types (`{x, number}`), no `plural`/`select`
  (use separate keys) and no apostrophe escaping. Literal `{` and `}` are not allowed.
- Formatting by type: `money` -> `formatMoney`; `price` -> `formatPrice`; `decimal` ->
  `formatDecimal`; `percent` -> `formatPercent`; `date` -> `Intl.DateTimeFormat(locale,
{ dateStyle: 'long', timeZone: 'UTC' })` on `Date.UTC(y, m - 1, d)`; `text` verbatim;
  `message` recursively.

`tax-core` ships its own catalog (`core.*` keys, `en` and `it`) for engine steps: line totals,
subtotal, total, deductions, net payable, empty invoice warning. Packs must not define `core.*`
keys; `formatMessage` callers pass `mergeCatalogs(coreMessages, pack.messages)`.

### 4.5 Invoice input

```ts
// src/input/types.ts
export type LineKind =
  | "service" // professional services, time or fixed price (part of the fee)
  | "expense" // costs recharged to the client as part of the fee ("rimborso spese")
  | "reimbursement" // amounts paid in the client's name and on the client's behalf (disbursements)
  | "mileage" // kilometres × rate per km (part of the fee)
  | "goods"; // sale of goods/equipment

export type LineUnit = "hour" | "day" | "km" | "item" | "lump-sum";

/** How a line is treated by the pack's main tax (VAT/GST/sales tax). Rates are percent units. */
export type LineTaxTreatment =
  | { readonly kind: "standard" } // the pack's normal treatment
  | { readonly kind: "rate"; readonly rate: Decimal } // explicit rate, e.g. reduced 10
  | { readonly kind: "exempt"; readonly reference?: string } // exempt by law, with reference
  | { readonly kind: "out-of-scope"; readonly reference?: string } // not subject (place of supply...)
  | { readonly kind: "excluded" }; // outside the taxable amount

export type ClientKind = "business" | "individual" | "public-administration";

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
```

Validation rules (`validateInvoiceInput`, typed form; `InvoiceInputJsonSchema`, JSON form). Each
violation is an issue with a path; all issues are collected before throwing `InvalidInputError`:

| Rule                                                             | Issue code                             |
| ---------------------------------------------------------------- | -------------------------------------- |
| `issueDate` is a valid `IsoDate`                                 | `invalid-date`                         |
| `currency` is a known `CurrencyCode`                             | `invalid-currency`                     |
| every `unitPrice.currency === currency`                          | `currency-mismatch`                    |
| `quantity` and `unitPrice` within the bounds above, non-negative | `out-of-range`                         |
| `quantity` and `unitPrice` scale ≤ 8                             | `too-precise`                          |
| line ids unique and well-formed                                  | `duplicate-line-id`, `invalid-line-id` |
| `treatment.rate` within 0..100, scale ≤ 4                        | `invalid-rate`                         |
| `client.country` assigned ISO code                               | `invalid-country`                      |
| `vatId` 1..32 characters `[A-Za-z0-9]`                           | `invalid-vat-id`                       |
| `exchangeRates[].rate > 0`, `from !== currency`                  | `invalid-exchange-rate`                |
| at most 500 lines                                                | `too-many-lines`                       |

Zero lines are valid (the engine returns an all-zero computation with the warning
`core.no-lines`), so the UI can preview an empty draft.

JSON form (API, database snapshots, fixtures): amounts are decimal strings in the invoice
currency, defaults are filled in by the schema.

```ts
// src/input/schema.ts, src/input/json.ts
export interface InvoiceInputJson {
  issueDate: string;
  documentKind?: DocumentKind; // default "invoice"
  currency: string;
  client: { country: string; kind: ClientKind; isWithholdingAgent: boolean; vatId?: string };
  lines: Array<{
    id: string;
    kind: LineKind;
    description: string;
    quantity: string; // decimal string
    unit: LineUnit;
    unitPrice: string; // decimal string in `currency`
    /** Default: { kind: "excluded" } for kind "reimbursement", { kind: "standard" } otherwise. */
    treatment?:
      | { kind: "standard" }
      | { kind: "rate"; rate: string }
      | { kind: "exempt"; reference?: string }
      | { kind: "out-of-scope"; reference?: string }
      | { kind: "excluded" };
  }>;
  options?: Record<string, JsonValue>;
  exchangeRates?: Array<{ from: string; rate: string; date: string; source?: string }>;
}

export const InvoiceInputJsonSchema: z.ZodType<InvoiceInput, InvoiceInputJson>;
/** @throws InvalidInputError */
export function parseInvoiceInput(json: unknown): InvoiceInput;
export function invoiceInputToJson(input: InvoiceInput): InvoiceInputJson;
/** Validates the typed form (bigint/Decimal shapes and every rule above). @throws InvalidInputError */
export function validateInvoiceInput(input: InvoiceInput): InvoiceInput;
```

### 4.6 The pack contract

```ts
// src/pack/types.ts
export interface Maintainer {
  readonly name: string;
  readonly github?: string;
}

export interface PackMeta {
  /** /^[a-z][a-z0-9-]{1,31}$/: "it", "generic". Rule ids start with `${id}.`. */
  readonly id: string;
  /** English display name; localized through the key "meta.name". */
  readonly name: string;
  /** Semver of the pack; must equal its package.json version. Part of every computation. */
  readonly version: string;
  readonly countries: readonly CountryCode[] | "any";
  /** English; localized through "meta.description". */
  readonly description: string;
  readonly maintainers: readonly Maintainer[]; // at least one
  /** https URL of docs/tax-packs/<id>.md on the docs site. */
  readonly docsUrl: string;
  /** Key "meta.disclaimer": figures are informational, verify with an accountant. */
  readonly disclaimer: MessageRef;
  /** Locales with a complete catalog; must include "en". */
  readonly locales: readonly LocaleTag[];
  /** Language in which legal notes must be printed on the document ("it"); absent: user locale. */
  readonly documentLocale?: LocaleTag;
}

export interface ParameterVersion<P> {
  /** Unique, stable: "it-2023-01-01". Never reused, never edited after release. */
  readonly id: string;
  /** Inclusive. The next version's effectiveFrom ends this one. */
  readonly effectiveFrom: IsoDate;
  /** Full snapshot of every parameter (copy forward, change what the law changed). */
  readonly params: P;
  /** Why this version exists: the source of each change. At least one. */
  readonly sources: readonly SourceRef[];
  /** Human summary of what changed compared with the previous version (English). */
  readonly changes: readonly string[];
}

export interface RoundingPolicy {
  /** Rounding always targets the currency's minor unit (cash rounding is out of scope). */
  readonly step: "minor-unit";
  /** quantity × unit price -> line total. */
  readonly lines: { readonly mode: RoundingMode };
  /** Percentage contributions and surcharges, rounded once per tax group. */
  readonly contributions: { readonly mode: RoundingMode; readonly scope: "per-group" };
  /** Taxes: once per tax group (rate) or once per line, then summed per group. */
  readonly taxes: { readonly mode: RoundingMode; readonly scope: "per-group" | "per-line" };
  /** Withholdings: once on the document's withholding base. */
  readonly withholdings: { readonly mode: RoundingMode; readonly scope: "per-document" };
  /** Human description shown in the UI and the docs. */
  readonly description: MessageRef;
}

export type FactValue = boolean | string | Decimal | Money | null;
/**
 * Facts let a rule tell later rules what it decided (IT: { withholdingApplied: boolean }).
 * Declare a pack's facts with a `type` alias, not an `interface`: interfaces have no implicit
 * index signature and are not assignable to this record type.
 */
export type PackFacts = Readonly<Record<string, FactValue>>;

export interface InputIssue {
  readonly path: readonly (string | number)[];
  readonly code: string; // "it.currency-not-eur"
  readonly message: MessageRef; // localizable explanation
}

export interface PackCapabilities<C> {
  /** Annual revenue thresholds (e.g. the Italian forfettario ceiling). */
  readonly annualThresholds?: AnnualThresholdsCapability<C>;
}

export interface TaxPack<C, P, F extends PackFacts, O> {
  readonly meta: PackMeta;
  /**
   * zod 4 schema of the workspace configuration. JSON in, JSON out: no transforms, no bigint, no
   * Date, defaults via .default()/.prefault() only. Must be idempotent and convertible with
   * z.toJSONSchema (the settings form is generated from it, WEB-008).
   */
  readonly configSchema: z.ZodType<C>;
  /** Per-invoice options (same JSON-only rules). Packs without options use z.object({}).strict(). */
  readonly invoiceOptionsSchema: z.ZodType<O>;
  /** Strictly increasing effectiveFrom, at least one version. */
  readonly parameters: readonly ParameterVersion<P>[];
  /** The pipeline, executed in this order. */
  readonly rules: readonly Rule<C, P, F, O>[];
  readonly initialFacts: F;
  readonly messages: MessageCatalogs;
  readonly roundingPolicy: (config: C) => RoundingPolicy;
  /** Pack-specific refusals ("not supported by this pack"), after schema validation. */
  readonly validateInput?: (input: InvoiceInput, config: C, options: O) => readonly InputIssue[];
  readonly capabilities: PackCapabilities<C>;
}
```

`TaxPack` is invariant in `C` (it appears in parameter positions), so a heterogeneous registry
cannot be typed as `TaxPack<unknown, ...>[]` without `any`. The registry uses type-erased handles:

```ts
// src/pack/handle.ts
export interface PackHandle {
  readonly meta: PackMeta;
  readonly messages: MessageCatalogs; // merged with the core catalog
  readonly configJsonSchema: Readonly<Record<string, JsonValue>>; // z.toJSONSchema(configSchema)
  readonly parseConfig: (
    config: unknown,
  ) =>
    | { readonly ok: true; readonly config: JsonValue }
    | { readonly ok: false; readonly issues: readonly SchemaIssue[] };
  readonly compute: (config: unknown, input: InvoiceInput) => InvoiceComputation;
  readonly listParameters: () => readonly ParameterTimelineEntryJson[];
  readonly roundingPolicy: (config: unknown) => RoundingPolicy; // throws InvalidConfigError
  readonly annualThresholds?: {
    readonly countableRevenue: (config: unknown, computation: InvoiceComputation) => Money;
    readonly evaluate: (config: unknown, input: RevenueTrackerInput) => RevenueStatus;
  };
}
export function toPackHandle<C, P, F extends PackFacts, O>(pack: TaxPack<C, P, F, O>): PackHandle;
```

### 4.7 Rules and the pipeline state

```ts
// src/pack/rule.ts
export interface RuleContext<C, P, O> {
  readonly input: InvoiceInput; // validated
  readonly config: C; // parsed by configSchema
  readonly options: O; // parsed by invoiceOptionsSchema
  readonly params: P; // resolved for input.issueDate
  readonly parameterVersion: { readonly id: string; readonly effectiveFrom: IsoDate };
  readonly rounding: RoundingPolicy; // pack.roundingPolicy(config)
  readonly currency: CurrencyCode; // input.currency
  readonly zero: Money; // zero(currency)
}

/** A line with its total, computed by the engine before any rule runs. */
export interface NetLine {
  readonly id: string;
  readonly kind: LineKind;
  readonly description: string;
  readonly quantity: Decimal;
  readonly unit: LineUnit;
  readonly unitPrice: Price;
  readonly treatment: LineTaxTreatment;
  readonly net: Money; // extend(unitPrice, quantity, rounding.lines.mode)
}

export type TaxTreatmentKind = "taxable" | "exempt" | "out-of-scope" | "excluded";

/** A row of the tax summary ("VAT 22%", "N2.2", "art. 15"). Registered by rules. */
export interface TaxGroup {
  /** Unique within the computation: "vat-22", "n2.2", "n1". /^[a-z0-9][a-z0-9.-]{0,31}$/ */
  readonly id: string;
  readonly treatment: TaxTreatmentKind;
  /** Percent units. Required when treatment is "taxable" (may be 0), forbidden otherwise. */
  readonly rate?: Decimal;
  readonly label: MessageRef;
  /** Legal reference printed with the summary row. */
  readonly reference?: MessageRef;
  /** Data for e-invoicing exporters, e.g. { "fatturapa.Natura": "N2.2" }. */
  readonly exportCodes?: Readonly<Record<string, string>>;
}

export type ComponentKind =
  "contribution" | "surcharge" | "tax" | "withholding" | "stamp-duty" | "other";
export type ComponentEffect = "adds-to-total" | "deducted-from-payable" | "informational";

/** The part of an adds-to-total component that belongs to one tax group. */
export interface Allocation {
  readonly groupId: string;
  /** For a tax: the group's taxable base. Otherwise: the part of the component's base in this group. */
  readonly base: Money;
  readonly amount: Money;
}

export interface ComponentDraft {
  /** Unique within the computation: "it.inps-rivalsa". */
  readonly id: string;
  readonly kind: ComponentKind;
  readonly label: MessageRef;
  readonly effect: ComponentEffect;
  readonly base: Money;
  /**
   * Percent units, when the amount is base × rate. A tax spanning several groups (22 % and 10 %)
   * omits it: each tax allocation's rate is its group's rate.
   */
  readonly rate?: Decimal;
  readonly amount: Money;
  /** Required and non-empty when effect is "adds-to-total"; forbidden otherwise. */
  readonly allocations?: readonly Allocation[];
  readonly exportCodes?: Readonly<Record<string, string>>;
  /** Defaults to the emitting rule's sources. */
  readonly sources?: readonly SourceRef[];
}

export interface LegalNoteDraft {
  /** Unique within the computation: "it.note.forfettario". */
  readonly id: string;
  readonly message: MessageRef;
  readonly sources?: readonly SourceRef[];
}

export type WarningSeverity = "info" | "warning";
export interface WarningDraft {
  readonly code: string; // "it.forfettario.foreign-business-client"
  readonly severity: WarningSeverity;
  readonly message: MessageRef;
}

export interface TraceDraft {
  /** What happened, in words: "INPS rivalsa: 4% of the fees". */
  readonly message: MessageRef;
  /** The arithmetic: "{base} × {rate} = {amount}". */
  readonly formula?: MessageRef;
  readonly amount?: Money;
  /** Links the step to a component (required for at least one step per component). */
  readonly componentId?: string;
  /** Defaults to the rule's sources. */
  readonly sources?: readonly SourceRef[];
}

export interface ComputationState<F extends PackFacts> {
  readonly lines: readonly NetLine[];
  readonly groups: readonly TaxGroup[]; // registration order
  readonly lineGroups: Readonly<Record<string, string>>; // line id -> group id
  readonly components: readonly Component[];
  readonly legalNotes: readonly LegalNote[];
  readonly warnings: readonly Warning[];
  readonly trace: readonly TraceStep[];
  readonly facts: F;
}

/** What a rule adds. Everything is append-only; the engine merges and checks it. */
export interface RuleOutput<F extends PackFacts> {
  readonly groups?: readonly TaxGroup[];
  readonly lineGroups?: Readonly<Record<string, string>>;
  readonly components?: readonly ComponentDraft[];
  readonly legalNotes?: readonly LegalNoteDraft[];
  readonly warnings?: readonly WarningDraft[];
  readonly trace?: readonly TraceDraft[];
  readonly facts?: Partial<F>;
}

export interface Rule<C, P, F extends PackFacts, O> {
  /** Stable, matches RULE_ID_PATTERN and starts with `${meta.id}.`: "it.ordinario.vat". */
  readonly id: RuleId;
  /** Short title (catalog key), shown in the trace and the docs. */
  readonly title: MessageRef;
  /** At least one. */
  readonly sources: readonly SourceRef[];
  /**
   * Structural applicability (regime, configured options). When false the rule is skipped
   * silently. Business outcomes ("no withholding: private client") are expressed by `apply`
   * returning a trace step instead.
   */
  readonly appliesTo?: (ctx: RuleContext<C, P, O>) => boolean;
  /** Pure. Must not throw for valid input; exceptions become RuleExecutionError. */
  readonly apply: (state: ComputationState<F>, ctx: RuleContext<C, P, O>) => RuleOutput<F>;
}
```

Merge contract, checked by the engine after each rule (violations throw `RuleContractError` with
the rule id and a reason code):

| Check                                                                                                                    | Reason                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| group ids unique; `rate` present iff `treatment === 'taxable'`, `0 ≤ rate ≤ 100`                                         | `invalid-group`           |
| every `lineGroups` key is an existing line, value an existing group; a line is assigned once                             | `invalid-line-assignment` |
| component ids unique; every `Money` in the invoice currency; `base ≥ 0`, `amount ≥ 0`                                    | `invalid-component`       |
| `adds-to-total` has non-empty allocations to existing groups, `Σ allocation.amount = amount`, `Σ allocation.base = base` | `invalid-allocations`     |
| `deducted-from-payable`/`informational` have no allocations                                                              | `invalid-allocations`     |
| `kind: 'tax'` allocates only to `taxable` groups; `kind: 'withholding'` is `deducted-from-payable`                       | `invalid-component`       |
| legal note ids unique; warning codes unique                                                                              | `duplicate-id`            |
| `facts` keys exist in `initialFacts`                                                                                     | `unknown-fact`            |
| after the rule: each component it emitted has at least one trace step with that `componentId`                            | `missing-trace`           |

### 4.8 The computation

```ts
// src/computation/types.ts
export interface ComputedLine extends NetLine {
  readonly groupId: string;
}

export interface Component extends ComponentDraft {
  readonly ruleId: RuleId;
  readonly allocations: readonly Allocation[]; // [] when not adds-to-total
  readonly sources: readonly SourceRef[];
}

export interface LegalNote {
  readonly id: string;
  readonly ruleId: RuleId;
  readonly message: MessageRef;
  readonly sources: readonly SourceRef[];
}

export interface Warning {
  readonly code: string;
  readonly severity: WarningSeverity;
  readonly ruleId: RuleId | "core";
  readonly message: MessageRef;
}

export interface TraceStep {
  /** 1-based, contiguous. */
  readonly step: number;
  readonly ruleId: RuleId | "core";
  readonly message: MessageRef;
  readonly formula?: MessageRef;
  readonly amount?: Money;
  readonly componentId?: string;
  readonly sources: readonly SourceRef[];
}

export interface TaxSummaryEntry {
  readonly groupId: string;
  readonly treatment: TaxTreatmentKind;
  readonly rate?: Decimal;
  readonly label: MessageRef;
  readonly reference?: MessageRef;
  /** Lines in the group + non-tax adds-to-total allocations to it. */
  readonly base: Money;
  /** Tax allocations to it (0 unless taxable). */
  readonly tax: Money;
  readonly exportCodes?: Readonly<Record<string, string>>;
}

export interface InvoiceComputation {
  readonly schemaVersion: 1;
  readonly engine: { readonly name: "@fairhour/tax-core"; readonly version: string };
  readonly pack: { readonly id: string; readonly version: string };
  readonly parameters: { readonly id: string; readonly effectiveFrom: IsoDate };
  readonly issueDate: IsoDate;
  readonly documentKind: DocumentKind;
  readonly currency: CurrencyCode;
  readonly client: ClientInput;
  readonly exchangeRates?: readonly ExchangeRecord[];
  readonly lines: readonly ComputedLine[];
  /** Σ line totals. */
  readonly subtotal: Money;
  readonly components: readonly Component[];
  /** One entry per tax group that has lines or allocations, in registration order. */
  readonly vatSummary: readonly TaxSummaryEntry[];
  /** Consideration before taxes: non-excluded lines + contribution/surcharge allocations to non-excluded groups. */
  readonly taxableBase: Money;
  /** Σ amounts of adds-to-total components of kind "tax". */
  readonly taxTotal: Money;
  /** subtotal + Σ amounts of adds-to-total components. The document total. */
  readonly total: Money;
  /** Σ amounts of components of kind "withholding". */
  readonly withholdingTotal: Money;
  /** total − Σ amounts of deducted-from-payable components. What the client pays. */
  readonly netPayable: Money;
  readonly legalNotes: readonly LegalNote[];
  readonly warnings: readonly Warning[];
  readonly trace: readonly TraceStep[];
}
```

Reconciliation assertions (`ReconciliationError` with the check id, the expected and the actual
amount). They run on every computation and are re-checked independently by the conformance suite:

| Id  | Assertion                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `subtotal = Σ lines.net`                                                                                                                                                               |
| R2  | for each group `g`: `base(g) = Σ net of lines in g + Σ allocation.amount to g of adds-to-total components whose kind ≠ 'tax'`; `tax(g) = Σ allocation.amount to g of 'tax' components` |
| R3  | for every tax allocation: `allocation.base = base(g)` of the final summary (a tax was not computed on a stale base)                                                                    |
| R4  | `total = subtotal + Σ adds-to-total amounts = Σ base(g) + Σ tax(g)`                                                                                                                    |
| R5  | `netPayable = total − Σ deducted-from-payable amounts`, `withholdingTotal ≤ total`                                                                                                     |
| R6  | every line is assigned to exactly one group                                                                                                                                            |
| R7  | every `Money` in the computation is in the invoice currency and `≥ 0`                                                                                                                  |
| R8  | `taxTotal = Σ tax(g)`; `taxableBase` matches its definition                                                                                                                            |

### 4.9 Engine API and algorithm

```ts
// src/engine/compute.ts
/**
 * @throws InvalidInputError, InvalidConfigError, InvalidOptionsError, UnsupportedInputError,
 *         ParameterNotFoundError, RuleExecutionError, RuleContractError, ReconciliationError
 */
export function computeInvoice<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
  config: unknown,
  input: InvoiceInput,
): InvoiceComputation;

// src/engine/parameters.ts
/** Latest version with effectiveFrom ≤ date. @throws ParameterNotFoundError */
export function resolveParameters<P>(
  parameters: readonly ParameterVersion<P>[],
  packId: string,
  date: IsoDate,
): ParameterVersion<P>;

export interface ParameterTimelineEntry<P> extends ParameterVersion<P> {
  /** Inclusive last day (the day before the next version), absent for the current version. */
  readonly effectiveUntil?: IsoDate;
}
export function listParameters<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
): readonly ParameterTimelineEntry<P>[];

export interface ParameterTimelineEntryJson {
  readonly id: string;
  readonly effectiveFrom: IsoDate;
  readonly effectiveUntil?: IsoDate;
  readonly params: JsonValue;
  readonly sources: readonly SourceRef[];
  readonly changes: readonly string[];
}
/** Decimal/Price become decimal strings, Money becomes MoneyJson; key order preserved. */
export function parametersToJson<P>(
  timeline: readonly ParameterTimelineEntry<P>[],
): readonly ParameterTimelineEntryJson[];
/** The same conversion for any value (used for params inside UIs and snapshots). */
export function toJsonValue(value: unknown): JsonValue;
```

`computeInvoice` steps (normative order):

1. `validateInvoiceInput(input)` -> `InvalidInputError` with all issues.
2. `pack.configSchema.safeParse(config)` -> `InvalidConfigError` (zod issues mapped to
   `SchemaIssue { path, code, message }`).
3. `pack.invoiceOptionsSchema.safeParse(input.options ?? {})` -> `InvalidOptionsError`.
4. `pack.validateInput?.(input, config, options)`; non-empty -> `UnsupportedInputError`.
5. `resolveParameters(pack.parameters, pack.meta.id, input.issueDate)`.
6. `rounding = pack.roundingPolicy(config)`; build the context.
7. Line totals: `net = extend(unitPrice, quantity, rounding.lines.mode)`; one `core` trace step
   per line (`core.line`: "{description}: {quantity} × {unitPrice} = {amount}") and one for the
   subtotal (`core.subtotal`). Zero lines: warning `core.no-lines`.
8. For each rule in order: skip if `appliesTo` returns false; call `apply` inside try/catch
   (exceptions -> `RuleExecutionError(ruleId, cause)`); merge its output with the contract checks
   of 4.7; number trace steps sequentially.
9. Every line must be assigned to a group (R6) -> otherwise `RuleContractError('unassigned-line')`.
10. Derive `vatSummary`, `taxTotal`, `taxableBase`, `total`, `withholdingTotal`, `netPayable`; add
    `core.total` and `core.net-payable` trace steps (and `core.deductions` when there are
    deductions).
11. Run R1 to R8.
12. Build the result with keys in the order of the `InvoiceComputation` type, deep-freeze it and
    return it.

Determinism and purity rules for the engine and every pack:

- No `Date`, randomness, environment, I/O; only the explicit input, config and pack.
- Iterate arrays in order. Objects are built with literal key order; never iterate `Object.keys`
  of user-provided records to build output (the `lineGroups` record is internal and output is
  produced from `lines`, in input order).
- No `Map`/`Set` in outputs. `Intl` is used only for formatting, never during computation.
- Rules must not depend on object identity or on the order of `options` keys.

### 4.10 Formatting and serialization

```ts
// src/format/trace.ts
export interface FormattedTraceStep {
  readonly step: number;
  readonly ruleId: RuleId | "core";
  readonly ruleTitle?: string; // from the rule's title key, absent for "core"
  readonly text: string;
  readonly formula?: string;
  readonly amount?: string; // formatMoney
  readonly sources: readonly SourceRef[];
}
export function formatTrace<C, P, F extends PackFacts, O>(
  computation: InvoiceComputation,
  pack: TaxPack<C, P, F, O>,
  locale: LocaleTag,
): readonly FormattedTraceStep[];

// src/format/computation.ts
export interface FormattedComputation {
  readonly locale: LocaleTag;
  readonly components: readonly {
    readonly id: string;
    readonly label: string;
    readonly amount: string;
    readonly base: string;
    readonly rate?: string;
  }[];
  readonly vatSummary: readonly {
    readonly groupId: string;
    readonly label: string;
    readonly reference?: string;
    readonly base: string;
    readonly tax: string;
  }[];
  readonly totals: {
    readonly subtotal: string;
    readonly taxableBase: string;
    readonly taxTotal: string;
    readonly total: string;
    readonly withholdingTotal: string;
    readonly netPayable: string;
  };
  /** Legal notes in the user's locale (for reading)… */
  readonly legalNotes: readonly { readonly id: string; readonly text: string }[];
  /** …and in pack.meta.documentLocale (the text to print on the document). */
  readonly documentLegalNotes: readonly { readonly id: string; readonly text: string }[];
  readonly warnings: readonly {
    readonly code: string;
    readonly severity: WarningSeverity;
    readonly text: string;
  }[];
  readonly disclaimer: string;
}
export function formatComputation<C, P, F extends PackFacts, O>(
  computation: InvoiceComputation,
  pack: TaxPack<C, P, F, O>,
  locale: LocaleTag,
): FormattedComputation;

// src/computation/json.ts
/** Canonical JSON: amounts as decimal strings in `currency`, keys in type order. */
export type InvoiceComputationJson = { readonly [key: string]: JsonValue };
export function computationToJson(computation: InvoiceComputation): InvoiceComputationJson;
/** @throws InvalidInputError when the document does not match InvoiceComputationJsonSchema. */
export function computationFromJson(json: unknown): InvoiceComputation;
export const InvoiceComputationJsonSchema: z.ZodType<InvoiceComputation, InvoiceComputationJson>;
```

In the JSON form every `Money` is a decimal string in the computation's `currency` (one currency
per computation), `Decimal` and `Price` are decimal strings, and `MessageParam` values follow the
same rule. Stored snapshots (WEB-007) keep the computation JSON **and** the
`FormattedComputation` for `en` and the document locale, so that an old invoice renders the same
even after a pack update changes its catalog.

### 4.11 Helpers for rule authors

```ts
// src/helpers/index.ts (exported from ".")
export interface GroupBase {
  readonly groupId: string;
  readonly base: Money;
}

export function groupOf<F extends PackFacts>(state: ComputationState<F>, lineId: string): TaxGroup;
export function linesInGroup<F extends PackFacts>(
  state: ComputationState<F>,
  groupId: string,
): readonly NetLine[];
export function sumNet<F extends PackFacts>(
  state: ComputationState<F>,
  predicate: (line: NetLine, group: TaxGroup | undefined) => boolean,
  currency: CurrencyCode,
): Money;
/**
 * Bases per group, in group registration order, omitting zero bases: Σ net of matching lines,
 * plus the allocations of the listed components (e.g. a contribution computed on fees + surcharge).
 */
export function basesByGroup<F extends PackFacts>(
  state: ComputationState<F>,
  options: {
    readonly lines: (line: NetLine, group: TaxGroup) => boolean;
    readonly includeComponents?: readonly string[];
  },
): readonly GroupBase[];
/** One allocation per group base: percentage(base, rate, mode). */
export function percentageByGroup(
  bases: readonly GroupBase[],
  ratePercent: Decimal,
  mode: RoundingMode,
): readonly Allocation[];
export function sumAllocations(
  allocations: readonly Allocation[],
  currency: CurrencyCode,
): { readonly base: Money; readonly amount: Money };
/** Current base of a group (lines + non-tax allocations), for tax rules. */
export function groupBase<F extends PackFacts>(state: ComputationState<F>, groupId: string): Money;
/**
 * One tax allocation per taxable group with a non-zero base, following `policy`:
 * "per-group" rounds rate × group base once; "per-line" rounds rate × amount for every item of the
 * group (each line net and each non-tax allocation) and sums the results. `base` is always the
 * group base, so R3 holds.
 */
export function taxAllocations<F extends PackFacts>(
  state: ComputationState<F>,
  policy: RoundingPolicy["taxes"],
  currency: CurrencyCode,
): readonly Allocation[];
export function findComponent<F extends PackFacts>(
  state: ComputationState<F>,
  id: string,
): Component | undefined;
export function mergeCatalogs(...catalogs: readonly MessageCatalogs[]): MessageCatalogs;
/** Pro-rata share for partial payments: amount × part / whole, halfUp. */
export function proRata(amount: Money, part: Money, whole: Money): Money;
```

### 4.12 Annual thresholds capability (revenue tracker)

Used by TAX-007 (the Italian forfettario ceiling) and available to any pack.

```ts
// src/thresholds/types.ts
export interface RevenueReceipt {
  readonly date: IsoDate; // collection date (cash basis)
  /** The countable part of what was collected, see countableRevenue and proRata. */
  readonly amount: Money;
  readonly reference?: string;
}

export interface RevenueTrackerInput {
  readonly year: number;
  readonly currency: CurrencyCode;
  readonly receipts: readonly RevenueReceipt[];
  /** First day of activity, when it falls in `year` (thresholds may be pro-rated). */
  readonly activityStartDate?: IsoDate;
  /** Injected "today" (purity): receipts after it are ignored. */
  readonly asOf: IsoDate;
}

export type RevenueStatusKind =
  "not-applicable" | "ok" | "approaching" | "exceeded" | "immediate-exit";

export interface RevenueThresholdStatus {
  readonly id: string; // "it.forfettario.ceiling"
  readonly label: MessageRef;
  readonly limit: Money;
  /** total / limit, 4 decimals, halfUp. */
  readonly ratio: Decimal;
  /** Date of the receipt that first made the total exceed the limit. */
  readonly crossedOn?: IsoDate;
  readonly sources: readonly SourceRef[];
}

export interface RevenueStatus {
  readonly status: RevenueStatusKind;
  readonly year: number;
  readonly total: Money;
  readonly thresholds: readonly RevenueThresholdStatus[];
  readonly parameters: { readonly id: string; readonly effectiveFrom: IsoDate };
  readonly explanation: readonly TraceStep[];
  readonly warnings: readonly Warning[];
}

export interface AnnualThresholdsCapability<C> {
  /** The amount of an invoice that counts as revenue once it is fully collected. */
  readonly countableRevenue: (config: C, computation: InvoiceComputation) => Money;
  readonly evaluate: (config: C, input: RevenueTrackerInput) => RevenueStatus;
}
```

The app stores receipts with their collection date; for a partial payment it records
`proRata(countableRevenue, paid, computation.netPayable)`.

### 4.13 Errors

```ts
// src/errors.ts
export type TaxEngineErrorCode =
  | "invalid-input"
  | "invalid-config"
  | "invalid-options"
  | "unsupported-input"
  | "parameters-not-found"
  | "rule-failed"
  | "rule-contract-violated"
  | "reconciliation-failed"
  | "missing-message"
  | "message-format"
  | "invalid-iso-date";

/** From zod: English, developer-facing. */
export interface SchemaIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
}

export abstract class TaxEngineError extends Error {
  abstract readonly code: TaxEngineErrorCode;
}

export class InvalidInputError extends TaxEngineError {
  readonly code = "invalid-input";
  readonly issues: readonly SchemaIssue[];
}
export class InvalidConfigError extends TaxEngineError {
  readonly code = "invalid-config";
  readonly issues: readonly SchemaIssue[];
}
export class InvalidOptionsError extends TaxEngineError {
  readonly code = "invalid-options";
  readonly issues: readonly SchemaIssue[];
}
/** The pack refuses an input it does not model (localizable issues). */
export class UnsupportedInputError extends TaxEngineError {
  readonly code = "unsupported-input";
  readonly issues: readonly InputIssue[];
}
export class ParameterNotFoundError extends TaxEngineError {
  readonly code = "parameters-not-found";
  readonly packId: string;
  readonly date: IsoDate;
  readonly firstEffectiveFrom: IsoDate;
}
export class RuleExecutionError extends TaxEngineError {
  readonly code = "rule-failed";
  readonly ruleId: RuleId;
  readonly cause: unknown;
}
export class RuleContractError extends TaxEngineError {
  readonly code = "rule-contract-violated";
  readonly ruleId: RuleId | "core";
  readonly reason: string;
}
export class ReconciliationError extends TaxEngineError {
  readonly code = "reconciliation-failed";
  readonly check: string;
  readonly expected: string;
  readonly actual: string;
}
export class MissingMessageError extends TaxEngineError {
  readonly code = "missing-message";
  readonly key: string;
  readonly locale: LocaleTag;
}
export class MessageFormatError extends TaxEngineError {
  readonly code = "message-format";
  readonly key: string;
  readonly reason: string;
}
export class InvalidIsoDateError extends TaxEngineError {
  readonly code = "invalid-iso-date";
}
```

`RuleExecutionError`, `RuleContractError` and `ReconciliationError` are bugs in a pack or in the
engine; the API maps them to HTTP 500 and the UI shows "this computation failed, please report
it", never a partial result. The others are user errors (HTTP 422 with issues).

### 4.14 Test plan (`tax-core`)

Coverage ≥ 95 %. The internal test pack (`src/testing/test-pack.ts`) is a small fictional
country ("xx") with: line classification (standard -> 20 % group, `exempt`, `excluded`), a 10 %
contribution allocated per group, a 20 % tax per group or per line (config), a 10 % withholding
for withholding agents, a fixed €1.50 charge on non-taxed amounts above €50.00 (charged or
informational), a per-invoice option, two parameter versions and `en`/`it` catalogs.

Table-driven:

1. `isoDate`, `countryCode`, `addDays`, `daysBetweenInclusive` (leap years, month ends).
2. `formatMessage`: each param type in `en` and `it`, nested messages, locale fallback
   (`it-CH` -> `it`, `de` -> `en`), missing key, missing param, malformed braces, depth limit.
3. `resolveParameters`: before the first version (error carries `firstEffectiveFrom`), on each
   boundary day, the day before a boundary, far future.
4. `validateInvoiceInput` / `parseInvoiceInput`: one row per rule of 4.5 plus defaults.
5. Contract violations: a rule factory produces each violation of the 4.7 table; the expected
   `RuleContractError.reason` is asserted.
6. Reconciliation: a deliberately misordered pack (tax before a contribution) triggers R3.
7. Engine: zero lines; credit note; per-group vs per-line tax rounding; options; skipped rules
   leave no trace; `RuleExecutionError` wraps a throwing rule.
8. `computationToJson`/`computationFromJson` round trip; JSON byte stability.
9. `formatTrace`/`formatComputation` for the test pack in `en` and `it`.

Property-based (fast-check), on the test pack with `invoiceInputArbitrary` from the conformance
module: R1 to R8 hold, determinism (two runs give byte-identical JSON), permutation invariance
(shuffling lines changes no total, component amount or summary), non-negativity, rounding bounds,
deep immutability. Golden fixtures for the test pack in `packages/tax-core/fixtures/invoices/`.
Finally, `src/conformance.test.ts` runs `defineConformanceSuite(testPack, ...)`, and
`runConformanceChecks` is tested against deliberately broken packs (missing `it` key, unsorted
parameters, rule without sources, non-idempotent config schema, non-deterministic rule) to prove
that each check fails when it should.

---

## 5. Conformance suite

Entry point `@fairhour/tax-core/conformance` (TAX-003). Every pack's `src/conformance.test.ts`
is a single call and must stay green.

```ts
// src/conformance/index.ts
import type { GoldenFixture } from "../fixtures/schema";

type FixtureSource =
  | { readonly fixturesDir: string; readonly fixtures?: never } // absolute path, *.json files
  | { readonly fixtures: readonly GoldenFixture[]; readonly fixturesDir?: never };

export type ConformanceOptions = FixtureSource & {
  /** At least one. Every one must parse; they seed property tests. */
  readonly validConfigs: readonly unknown[];
  /** At least one; each must be rejected by configSchema. */
  readonly invalidConfigs: readonly { readonly config: unknown; readonly reason: string }[];
  /** At least one valid input (JSON form) per regime the pack supports. */
  readonly sampleInputs: readonly InvoiceInputJson[];
  /** Per-invoice option objects to exercise (default [{}]). */
  readonly invoiceOptions?: readonly unknown[];
  /** Shape of generated inputs; defaults: the pack's countries (or a few), ["EUR"], the parameter timeline. */
  readonly input?: {
    readonly currencies?: readonly CurrencyCode[];
    readonly clientCountries?: readonly CountryCode[];
    readonly dateRange?: { readonly from: IsoDate; readonly to: IsoDate };
  };
  readonly properties?: { readonly numRuns?: number; readonly seed?: number }; // default 200 runs
  /** The pack's package.json version, compared with meta.version. */
  readonly packageVersion?: string;
};

/** Registers a vitest `describe` block named `conformance: <pack id>` with one test per check. */
export function defineConformanceSuite<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
  options: ConformanceOptions,
): void;

/** Union of the check ids in the table below ("meta.identity" | "messages.complete" | ...). */
export type ConformanceCheckId = string; // implement as a literal union

/** The same checks as plain functions, for testing the suite itself. */
export interface ConformanceCheckResult {
  readonly id: ConformanceCheckId;
  readonly ok: boolean;
  readonly failures: readonly string[];
}
export function runConformanceChecks<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
  options: ConformanceOptions,
): readonly ConformanceCheckResult[];

/** fast-check arbitraries, also for packs' own property tests. */
export function invoiceInputArbitrary(options: {
  readonly currency: CurrencyCode;
  readonly dateRange: { readonly from: IsoDate; readonly to: IsoDate };
  readonly clientCountries: readonly CountryCode[];
  readonly maxLines?: number; // default 8
  readonly treatments?: readonly LineTaxTreatment["kind"][];
  readonly documentKinds?: readonly DocumentKind[];
}): fc.Arbitrary<InvoiceInput>;
export function decimalArbitrary(options: {
  readonly min: string;
  readonly max: string;
  readonly maxScale: number;
}): fc.Arbitrary<Decimal>;
export function priceArbitrary(
  currency: CurrencyCode,
  options?: { readonly max?: string; readonly maxScale?: number },
): fc.Arbitrary<Price>;
```

A pack's suite, for example `packages/tax-pack-it/src/conformance.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConformanceSuite } from "@fairhour/tax-core/conformance";
import { itPack } from "./index";
import { invalidConfigs, sampleInputs, validConfigs } from "./conformance.data";
import packageJson from "../package.json" with { type: "json" };

defineConformanceSuite(itPack, {
  fixturesDir: fileURLToPath(new URL("../fixtures/invoices", import.meta.url)),
  validConfigs,
  invalidConfigs,
  sampleInputs,
  invoiceOptions: [{}, { stampDuty: "absorb" }, { splitPayment: "skip" }],
  input: { currencies: ["EUR"] },
  packageVersion: packageJson.version,
});
```

Checks registered (`ConformanceCheckId`), all mandatory; there is no option to skip one:

| Id                         | What it checks                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `meta.identity`            | id pattern, semver version (equal to `packageVersion` when given), countries assigned ISO codes or `'any'`, https `docsUrl`, at least one maintainer, `locales` includes `en` and is canonical                                                                                                                                                               |
| `meta.disclaimer`          | `meta.disclaimer`, `meta.name`, `meta.description` keys exist in every locale                                                                                                                                                                                                                                                                                |
| `messages.complete`        | every locale has exactly the key set of `en`; no `core.*` keys                                                                                                                                                                                                                                                                                               |
| `messages.syntax`          | every message parses; each locale's placeholders equal the `en` placeholders for that key                                                                                                                                                                                                                                                                    |
| `config.valid`             | every `validConfigs` entry parses                                                                                                                                                                                                                                                                                                                            |
| `config.invalid`           | every `invalidConfigs` entry fails                                                                                                                                                                                                                                                                                                                           |
| `config.idempotent`        | `parse(parse(x))` deep-equals `parse(x)` and survives a JSON round trip                                                                                                                                                                                                                                                                                      |
| `config.json-schema`       | `z.toJSONSchema(configSchema)` and of `invoiceOptionsSchema` succeed                                                                                                                                                                                                                                                                                         |
| `parameters.timeline`      | at least one version; valid, strictly increasing `effectiveFrom`; unique ids; each version has sources and `changes`; params deeply frozen                                                                                                                                                                                                                   |
| `parameters.snapshot`      | `parametersToJson(listParameters(pack))` matches the committed vitest snapshot, so editing a released version shows up in review                                                                                                                                                                                                                             |
| `parameters.resolution`    | each version resolves on its first day and the previous one on the day before; a date before the first version throws `ParameterNotFoundError`                                                                                                                                                                                                               |
| `rules.identity`           | at least one rule; unique ids matching `RULE_ID_PATTERN` and prefixed with the pack id; title keys exist                                                                                                                                                                                                                                                     |
| `rules.sources`            | every rule and parameter version has at least one well-formed source (https URL when present); reports `to-be-verified` sources as a list (informational, not a failure)                                                                                                                                                                                     |
| `rounding.policy`          | `roundingPolicy(config)` is valid for every valid config, description key exists                                                                                                                                                                                                                                                                             |
| `fixtures.schema`          | every fixture validates against `GoldenFixtureSchema`, `name` equals the file name, `pack` equals the pack id; at least one fixture                                                                                                                                                                                                                          |
| `fixtures.golden`          | each fixture computes to its `expected` subset or throws its `expectedError`                                                                                                                                                                                                                                                                                 |
| `samples.compute`          | every sample input computes with every valid config (or throws `UnsupportedInputError`)                                                                                                                                                                                                                                                                      |
| `property.reconciliation`  | R1 to R8 re-checked from the output alone                                                                                                                                                                                                                                                                                                                    |
| `property.determinism`     | two computations of the same input (and of a structural clone) give byte-identical `computationToJson`                                                                                                                                                                                                                                                       |
| `property.permutation`     | shuffling lines changes no total, component amount or summary row                                                                                                                                                                                                                                                                                            |
| `property.non-negative`    | every `Money` in the output is ≥ 0, including for credit notes                                                                                                                                                                                                                                                                                               |
| `property.currency`        | every `Money` in the output is in the input currency                                                                                                                                                                                                                                                                                                         |
| `property.rounding-bounds` | tax allocations: the distance between `amount` and `base × group.rate / 100` is at most ½ minor unit, times the number of items in the group (lines and non-tax allocations) when `taxes.scope` is `per-line`; allocations of other components with a `rate`, and components with a `rate` and no allocations: at most ½ minor unit from `base × rate / 100` |
| `property.immutability`    | the result is deeply frozen                                                                                                                                                                                                                                                                                                                                  |
| `property.trace`           | steps numbered 1..n; every component has a trace step by its rule; every trace, legal note and warning formats in every locale                                                                                                                                                                                                                               |
| `property.json`            | `computationFromJson(computationToJson(c))` deep-equals `c`                                                                                                                                                                                                                                                                                                  |
| `property.invalid-input`   | malformed inputs (negative quantity, foreign-currency price, duplicate line id) throw `InvalidInputError`, never another error                                                                                                                                                                                                                               |
| `thresholds.contract`      | when `annualThresholds` exists: zero receipts give `ok` (or `not-applicable`), adding receipts never lowers the status, `countableRevenue ≤ total`                                                                                                                                                                                                           |

---

## 6. Golden fixtures

One JSON file per scenario in `<package>/fixtures/invoices/<name>.json` (kebab-case name equal to
the file name). A fixture pins the legally relevant output of a real-world invoice. A behaviour
change updates the fixture deliberately in the same commit, and the commit message says why.

```ts
// src/fixtures/schema.ts (exported from "@fairhour/tax-core")
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
```

Matching semantics: amounts compare as strings against `toDecimalString` (so `"1042.00"`, not
`"1042"`); every field present in `expected` must match, absent fields are not checked; lists
marked exhaustive must match in content and order.

Example (`packages/tax-pack-it/fixtures/invoices/forfettario-rivalsa-bollo-charged.json`):

```json
{
  "name": "forfettario-rivalsa-bollo-charged",
  "description": "Forfettario professional in the INPS Gestione Separata: €1,000 of fees, 4% rivalsa, €2 stamp duty charged to the client.",
  "pack": "it",
  "sources": [
    { "title": "Legge 23 dicembre 2014, n. 190", "citation": "art. 1, commi 54-89" },
    { "title": "Legge 23 dicembre 1996, n. 662", "citation": "art. 1, comma 212" },
    {
      "title": "DPR 26 ottobre 1972, n. 642",
      "citation": "Tariffa, parte I, art. 13, comma 1 e nota 2, lett. a)"
    }
  ],
  "config": {
    "regime": "forfettario",
    "socialSecurity": { "kind": "inps-gestione-separata", "rivalsa": true },
    "stampDuty": { "charge": "client" }
  },
  "input": {
    "issueDate": "2026-03-15",
    "currency": "EUR",
    "client": {
      "country": "IT",
      "kind": "business",
      "isWithholdingAgent": true,
      "vatId": "01234567890"
    },
    "lines": [
      {
        "id": "l1",
        "kind": "service",
        "description": "UX design",
        "quantity": "20",
        "unit": "hour",
        "unitPrice": "50"
      }
    ]
  },
  "expected": {
    "parameters": "it-2023-01-01",
    "subtotal": "1000.00",
    "components": [
      {
        "id": "it.inps-rivalsa",
        "kind": "contribution",
        "base": "1000.00",
        "rate": "4",
        "amount": "40.00",
        "effect": "adds-to-total"
      },
      { "id": "it.stamp-duty", "kind": "stamp-duty", "amount": "2.00", "effect": "adds-to-total" }
    ],
    "vatSummary": [
      { "groupId": "n2.2", "treatment": "out-of-scope", "base": "1042.00", "tax": "0.00" }
    ],
    "taxableBase": "1040.00",
    "taxTotal": "0.00",
    "total": "1042.00",
    "withholdingTotal": "0.00",
    "netPayable": "1042.00",
    "legalNotes": [
      "it.note.forfettario",
      "it.note.forfettario-no-withholding",
      "it.note.stamp-duty"
    ],
    "warnings": [],
    "traceRuleIds": [
      "core",
      "it.common.classify-lines",
      "it.common.inps-rivalsa",
      "it.forfettario.no-vat",
      "it.forfettario.no-withholding",
      "it.common.stamp-duty",
      "core"
    ]
  }
}
```

---

## 7. Core to engine bridge (`@fairhour/core`)

`@fairhour/core` is AGPL. It turns billable time, rates and extra items into an `InvoiceInput`
(CORE-009). It imports `@fairhour/money` and `@fairhour/tax-core` (allowed direction); nothing in
the MIT packages may import from it. The entry/project/rate types below are the bridge's own;
the implementer maps database rows to them in phase 3.

```ts
// packages/core/src/invoice/draft.ts
import type { ClientInput, InvoiceInput, IsoDate, LineTaxTreatment } from "@fairhour/tax-core";
import type { CurrencyCode, Decimal, Money, Price, RoundingMode } from "@fairhour/money";

export type DurationRounding =
  | { readonly kind: "none" }
  | {
      readonly kind: "step";
      readonly minutes: 6 | 15 | 30;
      readonly direction: "up" | "nearest" | "down";
    };

export type BillingMode =
  | { readonly kind: "hourly" }
  | { readonly kind: "fixed"; readonly amount: Money }
  | { readonly kind: "day-rate"; readonly hoursPerDay: Decimal; readonly halfDayMaxHours: Decimal };

export interface BillableEntry {
  readonly id: string;
  readonly projectId: string;
  readonly taskId?: string;
  readonly description: string;
  /** UTC instants, ISO 8601 ("2026-03-02T08:00:00Z"). Running entries are not billable. */
  readonly start: string;
  readonly end: string;
  /** Rate already resolved by resolveRate (task > project > client > workspace), CORE-005. */
  readonly rate: Price;
}

export interface ProjectBilling {
  readonly id: string;
  readonly name: string;
  readonly mode: BillingMode;
  readonly rounding: DurationRounding;
  /** Apply duration rounding to each entry (default) or to each line's total. */
  readonly roundingScope: "entry" | "line";
}

export type ExtraLine =
  | {
      readonly kind: "expense" | "reimbursement" | "goods";
      readonly id: string;
      readonly description: string;
      readonly quantity: Decimal;
      readonly unitPrice: Price;
      readonly treatment?: LineTaxTreatment;
    }
  | {
      readonly kind: "mileage";
      readonly id: string;
      readonly description: string;
      readonly kilometres: Decimal;
      readonly ratePerKm: Price;
    };

export interface InvoiceDraftOptions {
  readonly issueDate: IsoDate;
  /** Local dates, inclusive, interpreted in `timeZone`. */
  readonly period: { readonly from: IsoDate; readonly to: IsoDate };
  readonly timeZone: string; // IANA
  readonly grouping: "project" | "task" | "entry" | "single";
  /** Decimals of hour quantities on the invoice (2 is customary). */
  readonly hoursScale: 2 | 3 | 4;
  readonly hoursRounding: RoundingMode; // default "halfUp"
  readonly currency: CurrencyCode; // the client's currency
  readonly exchangeRates: readonly {
    readonly from: CurrencyCode;
    readonly rate: Decimal;
    readonly date: IsoDate;
    readonly source?: string;
  }[];
  readonly client: ClientInput;
  readonly extraLines: readonly ExtraLine[];
  /** Optional per-invoice pack options passed through untouched. */
  readonly packOptions?: InvoiceInput["options"];
}

export interface LineProvenance {
  readonly lineId: string;
  readonly entryIds: readonly string[];
}

export type DraftAdjustment =
  | {
      readonly kind: "duration-rounded";
      readonly entryId: string;
      readonly fromSeconds: bigint;
      readonly toSeconds: bigint;
    }
  | {
      readonly kind: "quantity-rounded";
      readonly lineId: string;
      readonly exact: string;
      readonly rounded: Decimal;
    }
  | {
      readonly kind: "price-converted";
      readonly lineId: string;
      readonly from: Price;
      readonly to: Price;
    };

export interface InvoiceDraft {
  readonly input: InvoiceInput; // validates with validateInvoiceInput
  readonly provenance: readonly LineProvenance[];
  readonly adjustments: readonly DraftAdjustment[];
}

/** Pure. @throws DraftError (missing exchange rate, entry outside the period, running entry) */
export function buildInvoiceDraft(
  entries: readonly BillableEntry[],
  projects: readonly ProjectBilling[],
  options: InvoiceDraftOptions,
): InvoiceDraft;
```

Algorithm:

1. **Select.** Keep entries whose local start date (in `timeZone`, DST-safe through CORE-003)
   lies in `period`. Entries spanning midnight belong to the day they start for invoicing (the
   reporting split of CORE-003 does not apply to billing).
2. **Durations** in whole seconds (`bigint`). With `roundingScope: 'entry'`, round each entry's
   duration with the project's `DurationRounding` (record `duration-rounded`).
3. **Group** by `grouping`, then always by `(projectId, rate, billing mode)`: entries with
   different rates never share a line. Line ids are deterministic (`p:<projectId>`,
   `t:<taskId>`, `e:<entryId>`, `all`, suffixed `:<n>` when split by rate). Line order: project
   name, then task, then first entry start.
4. **Quantities.**
   - Hourly: `seconds` summed (rounded per line when `roundingScope: 'line'`), converted to
     hours as `divideDecimal(decimalFromInteger(seconds), decimal("3600"), hoursScale,
hoursRounding)`. With 6/15/30-minute rounding the result is exact (0.1/0.25/0.5 h); otherwise
     a `quantity-rounded` adjustment is recorded. The invoice line is then
     `quantity × unitPrice`, exactly what the client reads on the document.
   - Day rate: per local day, `hours ≤ halfDayMaxHours` counts 0.5 day and more counts 1 day
     (`unit: 'day'`, quantities are exact multiples of 0.5).
   - Fixed price: one line, `quantity "1"`, `unit: 'lump-sum'`, `unitPrice = priceFromMoney(amount)`,
     regardless of hours (the hours stay in the provenance for the effective rate, CORE-007).
5. **Extra lines.** Expenses, reimbursements and goods pass through; mileage becomes
   `quantity = kilometres`, `unit: 'km'`, `unitPrice = ratePerKm` (sub-cent precision kept: the
   only rounding is the line total in the engine).
6. **Currency.** Any price not in `options.currency` is converted with `convertPrice` (exact)
   using the matching explicit rate, then rescaled to at most 8 decimals with `halfUp`
   (`price-converted` adjustment). A missing rate throws `DraftError('missing-exchange-rate')`:
   mixing currencies without an explicit rate is an error. The rates used are copied to
   `input.exchangeRates`.
7. **Treatments.** Lines get `{ kind: 'standard' }`, reimbursements `{ kind: 'excluded' }`,
   unless the extra line specifies one.
8. **Validate.** The result goes through `validateInvoiceInput` (CORE-009 acceptance); a failure
   is a bug in the bridge and throws.

The bridge never decides tax matters (no VAT, contributions or withholding): that is the pack's
job, so that every tax decision has a rule id, a source and a trace step.

---

## 8. Pack package layout

Every `packages/tax-pack-<id>` follows the template (TAX-009):

```text
packages/tax-pack-<id>/
  package.json              "license": "MIT", deps: @fairhour/money, @fairhour/tax-core, zod
  LICENSE                   MIT
  src/
    index.ts                export const <id>Pack: TaxPack<Config, Params, Facts, Options>; export types
    config.ts               configSchema + Config type (z.output)
    options.ts              invoiceOptionsSchema + Options type
    parameters.ts           ParameterVersion<Params>[] (append-only)
    sources.ts              SourceRef constants (one per cited provision)
    groups.ts               TaxGroup factories
    rules/<rule>.ts         one file per rule, each with <rule>.test.ts (table-driven)
    messages/en.ts, <xx>.ts message catalogs
    revenue-tracker.ts      optional capability
    conformance.test.ts     defineConformanceSuite(pack, {...})
  fixtures/invoices/*.json  golden fixtures
```

---

## 9. Implementation plan

Parallel by package; each work package is self-contained once this document is merged.

| Wave | Package                                                   | Backlog            | Depends on            | Notes                                                                 |
| ---- | --------------------------------------------------------- | ------------------ | --------------------- | --------------------------------------------------------------------- |
| A    | `@fairhour/money`                                         | CORE-002           | none                  | Can start immediately.                                                |
| A    | `tax-core` types and schemas (4.2 to 4.8, 4.12, 4.13)     | TAX-002            | money's types only    | Write against the signatures above; stub money imports until A lands. |
| B    | `tax-core` engine, formatting, JSON, helpers              | TAX-002, TAX-011   | A                     |                                                                       |
| B    | conformance suite                                         | TAX-003            | A                     |                                                                       |
| C    | `tax-pack-it` forfettario, ordinario, stamp duty, tracker | TAX-004 to TAX-007 | B                     | Spec: `docs/tax-packs/it.md`.                                         |
| C    | `tax-pack-generic`                                        | TAX-008            | B                     | Spec: `docs/tax-packs/generic.md`.                                    |
| C    | `tax-pack-template` and contributor guide                 | TAX-009            | B                     |                                                                       |
| C    | core bridge                                               | CORE-009           | B, CORE-003, CORE-005 |                                                                       |
| C    | docs and fixtures review                                  | TAX-010, TAX-011   | packs                 |                                                                       |

Definition of done per package: the tests of its test plan, coverage ≥ 95 %, conformance green,
`pnpm --filter <pkg> lint typecheck test` clean, docs updated, reviewer approval.

---

## 10. Open points

1. **Discount lines.** v1 has no negative lines; discounts are folded into unit prices by the
   bridge. A follow-up ADR may add a `discount` line kind with per-group allocation.
2. **Cash rounding** (CHF 0.05, SEK whole kronor on payments) is out of scope (`step: 'minor-unit'`).
3. **Tax-inclusive prices** are out of scope for every pack in v1.
4. **Compound taxes** (a tax on a base that includes another tax) cannot be expressed: R3
   requires a tax allocation's base to be the group base. A pack that needs it requires an ADR.
5. **Multiple invoice currencies for thresholds**: packs with monetary thresholds (Italy) refuse
   non-EUR invoices in v1 (`UnsupportedInputError`); the bridge converts to EUR.
