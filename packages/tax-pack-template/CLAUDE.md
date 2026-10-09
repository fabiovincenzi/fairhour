# Tax pack template: rules for Claude Code sessions

This package is the starting point for a new country pack (`/new-tax-pack <cc>`). It is owned by
the `architect` subagent. The full rules are in `packages/tax-core/CLAUDE.md`; read them first.

Checklist when turning the template into a real pack:

1. Copy the folder to `packages/tax-pack-<cc>` and rename the package to `@fairhour/tax-pack-<cc>`.
2. Replace every `TEMPLATE` marker: pack `id`, `name`, `countries`, wording, sources.
3. Model the configuration with zod (regime, rates, options). Defaults must be the most
   common, conservative choice for that country.
4. Version parameters by effective date with a source for each version.
5. Implement each rule as a small pure function with a stable `id`, a `sources` list and a
   trace message. Money only through `@fairhour/money` with explicit rounding.
6. Golden fixtures in `fixtures/invoices/*.json` for every regime and edge case.
7. Keep `src/conformance.test.ts` (the shared suite) green; coverage ≥ 95%.
8. Document the pack in `docs/tax-packs/<cc>.md` (rules, sources, rounding, limitations) and
   state that results are informational and must be verified with an accountant.
