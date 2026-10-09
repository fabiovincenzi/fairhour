# ADR-0003: Money representation: `bigint` minor units, exact decimals, explicit rounding

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** @fabiovincenzi (lead maintainer)
- **Backlog:** CORE-002, TAX-002, TAX-011
- **Supersedes:** none

## Context

Fairhour's purpose is to compute the exact amounts to put on an invoice: line totals, social
security contributions, VAT, withholding tax, stamp duty, totals and the amount payable. Those
figures end up on legal documents and in tax returns, so a one-cent error is a bug with
consequences, and two parts of the system computing the same invoice must agree to the cent.

The same code runs on the server (Node 22), in the browser (live invoice previews) and in the
Tauri desktop webview, and the tax engine is an MIT library meant to be embedded by other
software ([ADR-0002](0002-licensing.md)). ADR-0001 already fixed the principle ("money is never a
float", `@fairhour/money` on `bigint` minor units) and deferred the design to this ADR.

Facts that constrain the design:

- IEEE 754 doubles cannot represent most decimal fractions: `0.1 + 0.2 !== 0.3`, and
  `1.005.toFixed(2)` is `"1.00"`. Any float in a tax computation eventually produces a wrong cent.
- Amounts are integers of a currency's minor unit, whose size varies: 2 decimals for EUR, 0 for
  JPY and KRW, 3 for KWD and TND, 4 for CLF (ISO 4217).
- Rates, quantities and unit prices are **not** whole minor units: 22 %, 1.25 hours, a mileage
  tariff of €0.4253/km, an exchange rate of 161.2500. FatturaPA accepts unit prices with up to 8
  decimals.
- Tax law and accounting practice choose rounding deliberately (half-up to the cent per VAT rate
  in Italy, per-line or per-invoice VAT in the UK, banker's rounding in some ledgers). A hidden
  default rounding mode is a hidden tax rule.
- `bigint` is native in every target runtime, but it is not JSON-serializable and cannot mix with
  `number` in arithmetic.
- ECMA-402 2023 lets `Intl.NumberFormat.format` take a decimal string and format it exactly;
  verified in our toolchain (Node 22.22, ICU 77.1) on 2026-10-09.

## Decision drivers

1. Exactness: no representable input may produce a result that differs from exact decimal
   arithmetic followed by the declared rounding.
2. Explicitness: every rounding has a visible mode at its call site, so reviewers can match code
   to the law.
3. Portability: identical results in Node, browsers and the desktop app; no native modules.
4. Embeddability: small, dependency-free, MIT, tree-shakeable, with types that make misuse hard.
5. Interoperability: lossless JSON for the API, database snapshots and golden fixtures.
6. Performance is secondary: an invoice has tens of lines, not millions.

## Considered options

1. **JavaScript `number` holding floating major units** (`12.34`), rounding with `toFixed`.
2. **JavaScript `number` holding integer minor units** (`1234`).
3. **`bigint` minor units plus our own exact `Decimal` (`bigint` coefficient + scale) and a `Price`
   type**, all rounding explicit (chosen).
4. **An arbitrary-precision decimal library** (decimal.js, big.js, bignumber.js) for everything.
5. **dinero.js**.

### Option 1: floating major units

- Good, because it is what most code does and needs no library.
- Bad, because it is wrong: binary floats cannot hold decimal cents, and errors surface as wrong
  cents in VAT or totals. Unacceptable for the product's core promise.

### Option 2: integer minor units in `number`

- Good, because integer arithmetic on `number` is exact up to 2^53 (about €90 trillion in cents),
  fast and JSON-friendly.
- Bad, because nothing stops a float from creeping in: `cents * 0.22` silently produces a float,
  and intermediate products (amount × rate coefficient × 10^scale) leave the safe-integer range
  quickly. Rates and quantities still need a decimal type. The type system cannot tell an integer
  `number` from a float one.

### Option 3: `bigint` minor units, own `Decimal`, explicit rounding

- Good, because `bigint` arithmetic is exact at any size, and mixing it with `number` is a type
  error and a runtime `TypeError`, so floats cannot creep in silently.
- Good, because one small rounding primitive (`divideAndRound(numerator, denominator, mode)`)
  implements seven named modes and every money operation goes through it; the mode is a required
  argument.
- Good, because `Decimal` (coefficient + scale) is exact for rates, quantities, prices and
  exchange rates parsed from strings, and `Price` keeps sub-cent unit prices until the line
  total is rounded once.
- Good, because it has no dependencies and is a few hundred lines we fully control and test.
- Bad, because we own the code: parsing, rounding, allocation and formatting must be proven
  correct by our tests (table-driven and property-based, ≥ 95 % coverage).
- Bad, because `bigint` needs explicit JSON codecs and is slower than `number` (irrelevant at our
  volumes).

### Option 4: decimal.js / big.js / bignumber.js

- Good, because they are mature and exact for decimal arithmetic, with rounding modes.
- Bad, because they are floating decimals with a global or per-constructor precision and rounding
  configuration: results depend on configuration state, which breaks the purity and determinism
  rules of the tax engine, and divisions round silently to that precision.
- Bad, because they have no notion of currency or minor units, so we would still wrap them for
  `Money`, allocation and currency checks; the wrapper is most of the work.
- Bad, because a runtime dependency in every MIT package, for functionality `bigint` now provides
  natively.

### Option 5: dinero.js

- Good, because it models money with currencies and allocation.
- Bad, because its stable major uses `number` amounts; `bigint` support is part of a newer major
  that uses a pluggable calculator, and its API surface (objects with scale, "toDecimal"
  transformers) is larger than we need.
- Bad, because rates, quantities and exchange rates would still need a separate decimal type, and
  rounding conventions would be split between two libraries.

## Decision

We implement `@fairhour/money` (MIT, zero runtime dependencies) as specified in
[`docs/design/tax-engine.md`](../design/tax-engine.md#3-fairhourmoney):

- **`Money = { readonly amount: bigint; readonly currency: CurrencyCode }`**: integer minor units
  and an ISO 4217 code, as plain deeply frozen objects with a functional API (`add`, `subtract`,
  `sum`, `compare`, `multiply`, `percentage`, `divide`, `allocate`, `convert`...). Operations on
  different currencies throw `CurrencyMismatchError`; conversion needs an explicit rate.
- **ISO 4217 table** with each currency's minor-unit exponent, committed as a reviewed snapshot.
- **`Decimal = { coefficient: bigint; scale: number }`** for rates, quantities and exchange
  rates, parsed only from strings with a strict grammar (no exponents, no locale separators).
  `Price = { amount: Decimal; currency }` for unit prices.
- **Rounding is always explicit.** `RoundingMode` is `halfUp` (ties away from zero), `halfEven`,
  `halfDown`, `up`, `down`, `ceiling`, `floor`; every function that can produce a fraction of a
  minor unit takes the mode as a required parameter. There is no default anywhere. Where and how
  each pack rounds is declared in its rounding policy and documented in
  `docs/tax-packs/<country>.md`.
- **`allocate` uses the largest-remainder method**, so splitting never loses or creates a minor
  unit.
- **JSON uses decimal strings**: `{ "amount": "1234.56", "currency": "EUR" }`. Inside a
  computation, where one currency applies to every amount, amounts are bare strings next to a
  single `currency` field. Parsing is strict: `"1.235"` is not a valid EUR amount.
- **Formatting never converts to `number`**: `Intl.NumberFormat` receives the decimal string with
  the fraction digits pinned to the ISO exponent; engines without exact string formatting use a
  `bigint` + `formatToParts` fallback.
- **Database (phase 3):** amounts are stored as `bigint` (int8) minor units with a `char(3)`
  currency column; rates and quantities as `numeric` read as strings. Drizzle maps `int8` with
  `mode: 'bigint'`. The data-model ADR will confirm this.

Out of scope: cash rounding (CHF 0.05), tax-inclusive price decomposition, currencies without an
ISO numeric minor unit (precious metals), and live exchange rates (rates are always an explicit
input).

## Consequences

### Positive

- Amounts are exact by construction; the class of "floating cent" bugs disappears.
- Rounding decisions are visible in code review and traceable to the documented policy of each
  pack, which is what the explanation trace shows users.
- The same library runs everywhere with no dependencies and is embeddable under MIT.
- JSON documents (API payloads, invoice snapshots, golden fixtures) are human-readable and
  lossless.

### Negative

- We maintain our own arithmetic and formatting code and must keep its tests strong
  (table-driven reference cases, fast-check properties for rounding bounds and allocation sums,
  ≥ 95 % coverage).
- `bigint` values need explicit codecs at every boundary (`JSON.stringify` throws on them); forms
  and the API must parse decimal strings.
- Contributors must learn a small API instead of using `*` and `+` on numbers; some code is more
  verbose.
- `bigint` arithmetic is slower than `number`; irrelevant for invoices, to be watched in reports
  that aggregate many amounts (aggregate in SQL instead).

### Revisit when

- TC39 Decimal (or an equivalent native exact decimal) ships in every target runtime: `Decimal`
  could become a thin adapter.
- A use case needs cash rounding or tax-inclusive pricing: extend `RoundingPolicy.step` and the
  API through a new ADR.

## Compliance and enforcement

- ESLint in `packages/money`, `packages/tax-core`, `packages/tax-pack-*` and `packages/core`:
  `no-restricted-syntax`/`no-restricted-properties` rules forbidding `parseFloat`, `Number(...)`
  on values, `.toFixed`, `Math.round`/`floor`/`ceil` and unary `+` (to be added with the packages
  in phase 2).
- Property-based tests (fast-check) for rounding bounds, allocation sums and parse/print round
  trips in `money`; reconciliation and determinism checks in the tax conformance suite.
- `packages/tax-core/CLAUDE.md` and the `architect` agent rules already require `@fairhour/money`
  and explicit rounding; the reviewer checklist rejects floats on amounts.

## Links

- [Tax engine design, section 3](../design/tax-engine.md#3-fairhourmoney)
- [ADR-0001: Technology stack](0001-technology-stack.md), [ADR-0002: Licensing](0002-licensing.md),
  [ADR-0004: Tax engine architecture](0004-tax-engine-architecture.md)
- ISO 4217 maintenance agency (SIX): <https://www.six-group.com/en/products-services/financial-information/data-standards.html>
- ECMA-402 `Intl.NumberFormat` (string arguments, "Intl mathematical value"):
  <https://tc39.es/ecma402/#sec-intl.numberformat.prototype.format>
- Council Regulation (EC) No 1103/97, art. 5 (euro rounding to the nearest cent):
  <https://eur-lex.europa.eu/eli/reg/1997/1103/oj>
