# @fairhour/money

Exact money and decimal arithmetic for JavaScript and TypeScript, on `bigint` minor units, with
**explicit rounding** everywhere. Zero runtime dependencies. MIT.

Part of [Fairhour](https://github.com/fabiovincenzi/fairhour), where it computes the amounts that
end up on invoices: line totals, VAT, withholding tax and totals that reconcile to the cent.

```ts
import { add, decimal, extend, formatMoney, percentage, price } from "@fairhour/money";

// 7.5 hours at €60 = €450.00, then 22 % VAT = €99.00
const net = extend(price("60", "EUR"), decimal("7.5"), "halfUp");
const vat = percentage(net, decimal("22"), "halfUp");
formatMoney(add(net, vat), "it-IT"); // "549,00 €"
```

## Why

- `0.1 + 0.2 !== 0.3` and `(1.005).toFixed(2) === "1.00"`: binary floats cannot hold cents, and
  every float in a tax computation eventually produces a wrong cent.
- Rounding is a legal decision (half-up to the cent per VAT rate in Italy, banker's rounding in some
  ledgers). A hidden default rounding mode is a hidden tax rule, so this library has none.

## Install

```sh
npm install @fairhour/money
# optional, only for the schemas in "@fairhour/money/zod"
npm install zod
```

Requires a runtime with `bigint` (Node 18+, every current browser). ESM only, fully typed.

## The three types

| Type      | Shape                                    | Use it for                                           |
| --------- | ---------------------------------------- | ---------------------------------------------------- |
| `Money`   | `{ amount: bigint; currency: "EUR" }`    | Amounts, as integer **minor units** (cents, yen...)  |
| `Decimal` | `{ coefficient: bigint; scale: number }` | Rates, quantities, exchange rates (`1.25` = 125/10²) |
| `Price`   | `{ amount: Decimal; currency: "EUR" }`   | Unit prices with sub-cent precision (€0.4253/km)     |

All values are plain, deeply frozen objects; no function mutates its arguments. `Decimal` and
`Price` are only ever parsed from **strings**, never from JavaScript numbers.

```ts
import { decimal, money, parseMoney, price } from "@fairhour/money";

money(123456n, "EUR"); // €1,234.56 from minor units
parseMoney("1234.56", "EUR"); // the same, from a decimal string
parseMoney("1.235", "EUR"); // throws InvalidAmountError (reason "too-precise")
decimal("22"); // { coefficient: 22n, scale: 0 }
price("0.4253", "EUR"); // a unit price, not a Money
```

Currencies are the ISO 4217 alphabetic codes, typed as a literal union (`CurrencyCode`), with
their ISO minor-unit exponent: 2 for EUR, 0 for JPY, 3 for KWD, 4 for CLF.

## Rounding modes

Every operation that can produce a fraction of a minor unit takes a `RoundingMode` argument.
There is no default.

| Mode       | Rule                             | 2.5 | -2.5 | 2.4 | -2.6 | 3.5 |
| ---------- | -------------------------------- | --- | ---- | --- | ---- | --- |
| `halfUp`   | nearest, ties away from zero     | 3   | -3   | 2   | -3   | 4   |
| `halfEven` | nearest, ties to even (banker's) | 2   | -2   | 2   | -3   | 4   |
| `halfDown` | nearest, ties toward zero        | 2   | -2   | 2   | -3   | 3   |
| `up`       | away from zero                   | 3   | -3   | 3   | -3   | 4   |
| `down`     | toward zero (truncation)         | 2   | -2   | 2   | -2   | 3   |
| `ceiling`  | toward +infinity                 | 3   | -2   | 3   | -2   | 4   |
| `floor`    | toward -infinity                 | 2   | -3   | 2   | -3   | 3   |

`halfUp` is ECMA-402's `halfExpand` and Java's `HALF_UP`. One primitive implements all seven:
`divideAndRound(numerator, denominator, mode)` on `bigint`.

## Examples

### Arithmetic

```ts
import {
  add,
  allocate,
  convert,
  decimal,
  divide,
  multiply,
  parseMoney,
  percentage,
  sum,
  toDecimalString,
} from "@fairhour/money";

const eur = (text: string) => parseMoney(text, "EUR");

add(eur("1.10"), eur("2.20")); // €3.30, exactly
sum([eur("1"), eur("2")], "EUR"); // €3.00 (the currency makes an empty list well defined)
add(eur("1"), parseMoney("1", "USD")); // throws CurrencyMismatchError

percentage(eur("0.25"), decimal("22"), "halfUp"); // 0.055 -> €0.06
percentage(eur("0.25"), decimal("22"), "halfDown"); // 0.055 -> €0.05
multiply(eur("100.00"), decimal("0.4253"), "halfEven"); // €42.53
divide(eur("10.00"), decimal("3"), "halfUp"); // €3.33

// Largest-remainder allocation: never loses or creates a cent.
allocate(eur("1.00"), [decimal("1"), decimal("1"), decimal("1")]).map(toDecimalString);
// ["0.34", "0.33", "0.33"]

// Conversion always takes an explicit rate (units of `to` per 1 unit of the source currency).
convert(eur("12.34"), "JPY", decimal("161.25"), "halfUp"); // 1989.825 -> ¥1,990
```

### Unit prices and line totals

```ts
import { decimal, extend, price } from "@fairhour/money";

// 123.45 km at €0.4253/km = 52.502785, rounded once, at the line total.
extend(price("0.4253", "EUR"), decimal("123.45"), "halfUp"); // €52.50
```

### Decimals

```ts
import { decimal, decimalToString, divideDecimal, rescaleDecimal } from "@fairhour/money";

decimalToString(decimal("1.50")); // "1.50" (the scale is kept)
divideDecimal(decimal("5400"), decimal("3600"), 2, "halfUp"); // 1.50 (hours from seconds)
rescaleDecimal(decimal("1.005"), 2, "halfEven"); // 1.00
```

The parser is strict and locale-independent: `"0"`, `"-1.25"` and `"1.50"` are accepted;
`"+1"`, `"1."`, `".5"`, `"01"`, `"1e3"`, `"1,5"`, `" 1"` and `"NaN"` are not. At most 80 digits
and 40 decimals.

### Formatting

```ts
import { formatMoney, formatPercent, formatPrice, decimal, money, price } from "@fairhour/money";

formatMoney(money(1234567n, "EUR"), "it-IT"); // "12.345,67 €"
formatMoney(money(123456789n, "CHF"), "de-CH"); // "CHF 1’234’567.89"
formatMoney(money(1234567n, "KWD"), "ar-EG"); // "١٬٢٣٤٫٥٦٧ د.ك." (with bidi marks)
formatMoney(money(-50n, "USD"), "en-US", { currencyDisplay: "code" }); // "-USD 0.50"
formatPrice(price("0.4253", "EUR"), "en-US"); // "€0.4253"
formatPercent(decimal("22"), "fr-FR"); // "22 %"
```

Formatting never converts to a `number`: `Intl.NumberFormat` receives the exact decimal string
(ECMA-402 2023), with the fraction digits pinned to the currency's **ISO 4217** exponent.

Older engines (before Chrome/Edge 106, Firefox 116 and Safari 15.4) get a `bigint` +
`formatToParts` fallback that needs only ES2020 `Intl` and supports every `FormatMoneyOptions`
option and every scale up to 40 decimals. Its digits, signs and separators are always those of the
exact path. So are plural-dependent words (`currencyDisplay: "name"`, the percent unit) for values
of up to 15 significant digits: `es-ES` 0.01 EUR is `"0,01 euros"` and 1.00 EUR is `"1,00 euro"`
on both paths. Beyond 15 significant digits ICU itself picks those words from a float
approximation, and the fallback may pick another plural form of the word (never other digits).

### JSON and zod

`bigint` is not JSON-serializable, so amounts travel as decimal strings:

```ts
import { moneyFromJson, moneyToJson, money } from "@fairhour/money";

moneyToJson(money(123456n, "EUR")); // { amount: "1234.56", currency: "EUR" }
moneyFromJson({ amount: "1234.56", currency: "EUR" }); // strict: "1.235" EUR throws
```

Encoding is symmetric with decoding: an amount of more than 80 digits (only arithmetic produces
one), which no decoder would read back, throws `InvalidAmountError` (reason `out-of-range`) from
`moneyToJson`, `priceToJson` and the zod encoders below, `z.safeEncode` included.

With zod 4 installed, `@fairhour/money/zod` provides schemas (codecs, so `z.encode` works too):

```ts
import * as z from "zod";
import { money } from "@fairhour/money";
import { decimalSchema, moneyJsonSchema, moneyStringSchema } from "@fairhour/money/zod";

const Line = z.object({ unitPrice: moneyJsonSchema, quantity: decimalSchema });
Line.parse({ unitPrice: { amount: "60.00", currency: "EUR" }, quantity: "7.5" });
z.encode(moneyJsonSchema, money(123456n, "EUR")); // { amount: "1234.56", currency: "EUR" }
moneyStringSchema("EUR").parse("1234.56"); // Money
```

Also exported: `currencyCodeSchema`, `decimalStringSchema`, `priceJsonSchema`.

## Errors

Every domain error extends `MoneyError` and has a `code`:

| Class                   | `code`              | When                                                                                                                                          |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `InvalidAmountError`    | `invalid-amount`    | `reason`: `syntax`, `out-of-range`, `too-precise`, `scale-overflow`, `no-ratios`, `negative-ratio`, `non-positive-rate`, `same-currency-rate` |
| `InvalidCurrencyError`  | `invalid-currency`  | Not an exact, upper-case ISO 4217 code of the table                                                                                           |
| `CurrencyMismatchError` | `currency-mismatch` | A binary operation on two currencies (`left`, `right`)                                                                                        |
| `DivisionByZeroError`   | `division-by-zero`  | Division, allocation or rounding by zero                                                                                                      |

Messages never include the offending amount, which may be user data headed for a log. Calling the
API from untyped code with a `number` where a `bigint` is expected, or with an unknown rounding mode,
throws a `TypeError`; a mode is checked on every call, even when no rounding is needed.

## Guarantees

- **Exact.** No floats anywhere: amounts are `bigint`, rates are exact decimals parsed from strings.
  Every result equals exact decimal arithmetic followed by the declared rounding.
- **Explicit.** No default rounding mode; every rounding is visible at its call site.
- **Lossless allocation.** `allocate` shares always sum to the input and differ from their exact
  proportional value by less than one minor unit.
- **Pure and deterministic.** No I/O, no clock, no randomness, no global mutable state (the only
  cache is a one-time feature detection of `Intl`). Same input, same output, in Node, browsers and
  webviews.
- **Immutable.** Every returned value is frozen.
- **Tested.** Table-driven tests for every function and rounding mode, property-based tests
  (fast-check) for rounding bounds, allocation, round trips and formatting; coverage of at least
  95 % on every metric is enforced.

Out of scope: cash rounding (CHF 0.05), tax-inclusive price decomposition, precious metals, and
live exchange rates (a rate is always an explicit input).

## Currency table

`CURRENCY_CODES` and `currencyInfo(code)` expose a reviewed snapshot of ISO 4217 List One (SIX):
every active code with a numeric minor unit (166 codes, snapshot of 2026-10-09). Precious metals,
bond-market units, `XDR`, `XSU`, `XUA`, `XTS` and `XXX` are excluded. `BGN` stays after its 2026
withdrawal so that historical invoices remain readable.

## Design

The decisions behind this library are recorded in
[ADR-0003](https://github.com/fabiovincenzi/fairhour/blob/main/docs/adr/0003-money-representation.md)
and specified in the
[tax engine design, section 3](https://github.com/fabiovincenzi/fairhour/blob/main/docs/design/tax-engine.md#3-fairhourmoney).

## License

[MIT](./LICENSE)
