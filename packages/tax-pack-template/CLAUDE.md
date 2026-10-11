# Tax pack template: rules for Claude Code sessions

This package is the starting point for a new country pack (`/new-tax-pack <cc>`): a complete,
working pack for the fictional country of Exampleland (pack id `xx`). It is owned by the
`architect` subagent. The full rules are in `packages/tax-core/CLAUDE.md`; read them first, then
the contributor guide `docs/contributing/tax-packs.md`, which this package illustrates.

## Working on the template itself

- Keep it a working pack: `lint`, `typecheck`, `test` (conformance suite, coverage ≥ 95 %) and
  `build` pass. Never register it in the app: its figures mean nothing.
- Keep it small. It shows one example of each kind of rule (classification, a tax, a legal note,
  a withholding); a new engine feature belongs here only if most packs will need it.
- When `tax-core`'s contract changes, update the template, its `TEMPLATE:` comments and the guide
  in the same change.
- Keep in sync: `README.md` with `src/readme.test.ts` (its examples are executed), the list of
  files with markers in `src/template.test.ts` with the markers themselves, and the snippets of the
  guide with the code they quote.
- Exampleland's sources stay `to-be-verified` with the reason "fictional", and their URLs stay on
  `example.com` (RFC 2606).

## Turning the template into a real pack

1. Copy the folder to `packages/tax-pack-<cc>` and rename the package and identifiers with the
   commands of the guide (section 4); run `pnpm install` from the root.
2. Replace every `TEMPLATE:` marker and every mention of Exampleland: `src/template.test.ts` fails
   until none is left. Then delete this `CLAUDE.md` from the copy.
3. Model the configuration with zod (strict objects, `.prefault({})`, no transforms). Defaults are
   the most common, conservative choice for that country.
4. Version parameters by effective date, append-only, with a source for each version.
5. Implement each rule as a small pure function with a stable `id`, a `sources` list and trace
   messages. Money only through `@fairhour/money` with the rounding policy's mode. At most one tax
   allocation per group; a tax component's rate equals its groups' rates.
6. Golden fixtures in `fixtures/invoices/*.json` for every regime and edge case, hand-computed,
   each pinning `total` and `netPayable`.
7. Keep `src/conformance.test.ts` (the shared suite) green; coverage ≥ 95 %.
8. Document the pack in `docs/tax-packs/<cc>.md` (rules, sources with verification marks,
   rounding, limitations) and state that results are informational and must be verified with an
   accountant. Register it (guide, section 15) and add a changeset.
