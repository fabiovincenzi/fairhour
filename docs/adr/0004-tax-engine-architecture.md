# ADR-0004: Tax engine architecture: a pure pipeline of cited rules with versioned parameters and a trace

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** @fabiovincenzi (lead maintainer)
- **Backlog:** TAX-001, TAX-002, TAX-003, TAX-009, TAX-011
- **Supersedes:** none

## Context

The tax engine is Fairhour's differentiator: country packs turn billable time into the exact
amounts of an invoice and explain every step with its legal source. The Italian pack is the
reference (regime forfettario and ordinario: INPS rivalsa, professional funds, VAT, withholding,
stamp duty, split payment); a generic VAT/GST pack must work anywhere; contributors (developers,
often guided by accountants) will add countries.

Requirements that shape the architecture:

- **Correctness and auditability.** Every amount must be reproducible years later: the same
  invoice, configuration and pack version must give the same figures, and an invoice snapshot
  must say which rules and which parameter values produced it.
- **Explainability.** Users must see _why_: "VAT 22 % on €1,040.00 = €228.80 (art. 16 DPR
  633/1972)". The explanation is a product feature, localized in at least English and Italian.
- **Law changes over time.** Thresholds, rates and wording change on specific dates (the Italian
  forfettario ceiling went from €65,000 to €85,000 on 2023-01-01). An invoice dated 2022 must
  still compute with 2022 values.
- **Contributions at scale.** A country pack must be a well-scoped pull request that a reviewer
  can check against the law, with fast, objective feedback.
- **Purity and portability.** The engine runs on the server, in the browser preview and in the
  desktop app, and is embeddable by third parties under MIT ([ADR-0002](0002-licensing.md)).
- **Exact money** ([ADR-0003](0003-money-representation.md)).

## Decision drivers

1. Exact, deterministic, reconciled results.
2. Every figure traceable to a rule id, a parameter version and a legal source.
3. Ease of writing and reviewing a country pack, with strong type checking.
4. Versioning by effective date without editing history.
5. Small, pure, dependency-light core that embeds anywhere.

## Considered options

1. **A pure TypeScript pipeline of small rules** with versioned parameters, mandatory sources, a
   localized trace, zod configuration schemas, engine-enforced reconciliation and a shared
   conformance suite (chosen).
2. **Rules as data:** a JSON/YAML DSL of formulas and conditions evaluated by an interpreter.
3. **Per-country hard-coded calculators:** each pack exports `compute(input): result` with free
   internal structure.
4. **An external rules engine:** json-rules-engine, a DMN/Drools service, or OpenFisca.

### Option 1: TypeScript rule pipeline

- Good, because rules are ordinary typed functions: TypeScript strict mode, zod and the
  `@fairhour/money` API catch most mistakes at compile time, and unit tests are trivial.
- Good, because the engine owns the invariants: rules only _append_ groups, components, notes,
  warnings and trace steps; the engine derives the tax summary and totals and asserts that they
  reconcile, so a pack cannot produce an inconsistent invoice.
- Good, because the trace is structural: every component must have a trace step from the rule
  that produced it, with sources.
- Bad, because contributors need TypeScript, and an accountant cannot change a rule without a
  developer (they can review the docs, the fixtures and the parameter tables, which are designed
  to be readable).
- Bad, because the engine contract (groups, allocations, effects) constrains exotic cases, such as
  compound taxes, which will need an engine change.

### Option 2: rules as data (DSL)

- Good, because non-developers could edit formulas, and rules could be loaded at runtime.
- Bad, because we would design, document, version and secure a language: conditions, rounding,
  money types, errors, debugging. Real tax rules (place of supply, exclusions from a withholding
  base, threshold comparisons on subsets of lines) quickly need a general-purpose language.
- Bad, because type checking, IDE support and refactoring are lost or must be rebuilt; runtime
  loading conflicts with the purity and reproducibility requirements.

### Option 3: hard-coded calculators per country

- Good, because it is the fastest way to write the first pack.
- Bad, because nothing enforces explanation, sources, versioning, rounding policy or
  reconciliation; each pack reinvents them, and review cannot rely on a common shape.
- Bad, because the UI cannot render a uniform explanation or tax summary across packs.

### Option 4: external rules engine

- Good, because rule engines and OpenFisca are mature, and OpenFisca models tax-benefit law
  precisely.
- Bad, because json-rules-engine evaluates conditions but not exact money arithmetic or a trace
  of formulas; Drools/DMN implies a JVM service, breaking embeddability and offline use; OpenFisca
  is Python and models populations and periods rather than invoice documents.
- Bad, because a runtime dependency (or service) in every MIT package and a second language for
  contributors.

## Decision

We build `@fairhour/tax-core` (MIT) as specified in
[`docs/design/tax-engine.md`](../design/tax-engine.md#4-fairhourtax-core):

1. **`TaxPack<Config, Params, Facts, Options>`** declares metadata (id, semver version, countries,
   maintainers, docs URL, disclaimer, locales, document locale), a **zod 4 configuration schema**
   that is JSON-in/JSON-out (the settings form is generated from it), a per-invoice options
   schema, **parameter versions**, an ordered list of **rules**, message catalogs (English
   required), a **rounding policy** and optional capabilities (annual revenue thresholds).
2. **Rules** have a stable id (`it.ordinario.vat`), a title, at least one `SourceRef`, an optional
   structural `appliesTo`, and a pure `apply(state, ctx)` that returns what it adds. The engine
   merges the output and enforces a contract (unique ids, invoice currency, non-negative amounts,
   allocations summing to the component, taxes only on taxable groups, a trace step per
   component). Violations throw `RuleContractError`; exceptions become `RuleExecutionError`.
3. **Tax groups and allocations.** Lines are assigned to tax groups (a rate or a VAT-free nature);
   every component that adds to the total is allocated to groups. The engine derives the tax
   summary, taxable base, total, withholdings and net payable from them and checks the
   reconciliation identities (R1 to R8 in the design). A failure is a loud `ReconciliationError`,
   never a partial result.
4. **Parameters are versioned by effective date**: full snapshots with an inclusive
   `effectiveFrom`, ended by the next version, each with its sources and a list of changes.
   Resolution uses the invoice's issue date. A released version is never edited: the
   conformance suite snapshots the timeline so that edits show up in review.
5. **Sources everywhere.** Every rule and parameter version cites its legal basis, with a
   verification status (`verified` against the primary text, an official summary or secondary
   literature, or `to-be-verified`). The same sources appear in `docs/tax-packs/<country>.md`.
6. **Trace and messages.** Every step is a `MessageRef` (key + typed parameters) formatted later
   per locale with an ICU-compatible subset; legal notes are printed in the pack's document locale
   (Italian for Italy) and shown translated to the user. Stored invoice snapshots keep the
   computation JSON and the rendered texts.
7. **Purity and determinism.** `computeInvoice(pack, config, input)` validates input, config and
   options with zod, resolves parameters, computes line totals, runs the rules, derives totals,
   reconciles and returns a deeply frozen `InvoiceComputation` that serializes to byte-identical
   JSON for the same inputs. No I/O, clock, randomness or environment access.
8. **Conformance suite.** `defineConformanceSuite(pack, options)` from
   `@fairhour/tax-core/conformance` registers the same checks for every pack: metadata, message
   completeness, config schema behaviour, parameter timeline, rule identity and sources, golden
   fixtures, and fast-check properties (reconciliation, determinism, permutation invariance,
   non-negativity, currency consistency, rounding bounds, immutability, trace completeness, JSON
   round trip). Checks cannot be skipped.
9. **Golden fixtures** (`fixtures/invoices/<name>.json`, validated by `GoldenFixtureSchema`) pin
   real-world invoices; a behaviour change updates them deliberately in the same commit.
10. **License boundary.** `money`, `tax-core` and `tax-pack-*` are MIT and depend at runtime only
    on each other and `zod`; `vitest` and `fast-check` are optional peers of the conformance entry
    point. `@fairhour/core` (AGPL) builds `InvoiceInput` from time entries and may import them, never
    the reverse. Tax decisions live only in packs, never in `core`.

Deferred: discount lines, tax-inclusive prices, compound taxes, cash rounding and multi-currency
thresholds (see the design's open points); FatturaPA export (phase 10) reads the `exportCodes`
that rules attach to groups and components.

## Consequences

### Positive

- Every figure on an invoice has a rule id, a parameter version, a source and a localized
  explanation; the UI renders the same explanation for every country.
- Packs cannot produce an unbalanced invoice: reconciliation is the engine's job and is checked
  on every computation and by property tests.
- Contributors get objective, fast feedback from the conformance suite; reviewers check a pack
  against a common shape and against the documented sources.
- Old invoices recompute identically with their parameter version; law changes are additive
  versions.
- The engine is pure and small enough to run in the browser, the desktop app and third-party
  software.

### Negative

- Writing a pack requires TypeScript; legal experts contribute through the docs, the fixtures and
  reviews rather than by editing rules directly.
- The engine contract is opinionated (one main tax per line, allocations, three component
  effects); compound or stacked taxes and tax-inclusive pricing need an engine change.
- Maintaining parameter snapshots, sources and two-locale catalogs is ongoing work for every pack,
  and `to-be-verified` items must be tracked until resolved.
- Pack versions become part of stored computations, so pack releases must follow semver
  carefully: any change of output is at least a minor version, with changesets.

### Revisit when

- A country requires compound taxes, tax-inclusive pricing or per-line multiple taxes.
- Contributors without TypeScript experience become the main source of packs (a constrained,
  typed configuration layer over the pipeline could then be considered).
- Performance of the conformance properties becomes a CI bottleneck.

## Compliance and enforcement

- Every `packages/tax-pack-*` contains `src/conformance.test.ts` calling `defineConformanceSuite`;
  CI runs it with the unit tests; coverage ≥ 95 %.
- The engine asserts the merge contract and reconciliation at runtime on every computation.
- ESLint `no-restricted-imports` and the license-boundary CI check (ADR-0002) keep MIT packages
  free of AGPL imports; ESLint money rules from ADR-0003 forbid floats.
- `packages/tax-core/CLAUDE.md`, `packages/tax-pack-template/CLAUDE.md` and the `architect` agent
  carry these rules for AI-assisted sessions; the `reviewer` checks sources, fixtures and docs.

## Links

- [Tax engine design](../design/tax-engine.md), [Italy pack](../tax-packs/it.md),
  [generic pack](../tax-packs/generic.md)
- [ADR-0001: Technology stack](0001-technology-stack.md),
  [ADR-0002: Licensing](0002-licensing.md),
  [ADR-0003: Money representation](0003-money-representation.md)
- OpenFisca: <https://openfisca.org/>, json-rules-engine:
  <https://github.com/CacheControl/json-rules-engine>
