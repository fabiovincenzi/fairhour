# packages/tax-* rules (read before touching any tax package)

These rules apply to `@fairhour/tax-core` and every `@fairhour/tax-pack-*`. Work here is owned
by the `architect` subagent (design and implementation). `test-writer` may add tests only
from an architect-written test plan. Never use `explorer`, `i18n` or `triage` here.

## Purity

- No I/O, no `Date.now()`/`new Date()` without an explicit input, no randomness, no env access,
  no network. A computation is a pure function of (pack, config, input).
- Same input ⇒ byte-identical `InvoiceComputation` (the conformance suite checks determinism).

## Money types

- Amounts are `Money` from `@fairhour/money`: `bigint` minor units + ISO 4217 currency.
- Rates and quantities are `Decimal` values parsed from strings (`decimal("22")`), never JS numbers.
- Forbidden on amounts: floats, `Number(...)`, `parseFloat`, `toFixed`, `Math.round`.
- Every multiplication/division that can produce fractions of a minor unit goes through
  `multiply(money, decimal, rounding)` with an explicit `RoundingMode`.

## Rounding

- Each pack declares a `roundingPolicy` (mode, step, and *where* rounding happens: per line,
  per component, per document) and documents it in `docs/tax-packs/<country>.md`.
- Round once per legally relevant amount, then derive totals by addition so the document
  reconciles exactly (`total = Σ components`, `netPayable = total − withholdings`).

## Rule versioning

- Parameters (rates, thresholds, fixed amounts, wording) are versioned by **effective date**
  (`effectiveFrom`, inclusive; the next version's start ends it). Resolution uses the invoice
  issue date. Never edit a released version: add a new one with its source.
- Rules have stable `id`s (`it.ordinario.vat`), which appear in the explanation trace.

## Source citations

- Every rule and every parameter version carries `sources: SourceRef[]` (title, citation,
  URL when one exists). Mirror them in `docs/tax-packs/<country>.md`.
- If a citation is uncertain, say so in the docs ("to be verified") instead of inventing one.
- UI and docs state that figures are informational and must be verified with an accountant.

## Tests required for every change

1. Table-driven unit tests for each rule.
2. Golden fixtures in `fixtures/invoices/*.json` (input, config, expected computation). A
   behaviour change updates the fixture *deliberately* in the same commit, with the reason.
3. Property-based tests (fast-check): totals reconcile, no amount is negative for non-credit
   invoices, scaling invariants, rounding within one minor unit of the exact value.
4. The shared conformance suite: `defineConformanceSuite(pack, options)` from
   `@fairhour/tax-core/conformance` must pass for every pack.
5. Coverage ≥ 95% (lines, branches, functions, statements).
