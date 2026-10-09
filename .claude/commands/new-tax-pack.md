---
description: Scaffold a new country tax pack from the template, designed by the architect, with conformance tests and docs.
argument-hint: <ISO-3166 alpha-2 country code, e.g. de>
---

Create a tax pack for country `$ARGUMENTS`. This work belongs to the `architect` subagent
end to end (design *and* implementation); do not use `explorer`, `i18n` or `triage` for it.

1. Ask `architect` to research the regime(s) for `$ARGUMENTS` and write the design first:
   regimes in scope, configuration schema, rule pipeline, parameters by effective date,
   rounding policy, legal wording (English + local language), and the sources for each rule.
   The design goes into `docs/tax-packs/$ARGUMENTS.md` and, if it introduces a new concept in
   `tax-core`, an ADR.
2. Scaffold: copy `packages/tax-pack-template` to `packages/tax-pack-$ARGUMENTS`, rename the
   package to `@fairhour/tax-pack-$ARGUMENTS`, and follow `docs/contributing/tax-packs.md`.
3. Implement the rules with source citations, golden fixtures in `fixtures/invoices/*.json`
   covering every regime and edge case (zero lines, thresholds, rounding ties, credit notes),
   and the shared conformance suite (`defineConformanceSuite` from `@fairhour/tax-core/conformance`).
4. Register the pack where packs are listed (see the guide), add docs to the docs site, and a
   changeset.
5. `test-writer` may add property-based tests from the architect's test plan.
6. Verify (`pnpm --filter @fairhour/tax-pack-$ARGUMENTS lint typecheck test`, coverage ≥ 95%),
   get `reviewer` approval, commit with `git commit -s`, and open a PR
   (`feat(tax-pack-$ARGUMENTS): add <country> tax pack`).
