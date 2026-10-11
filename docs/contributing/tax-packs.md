# Adding a tax pack for your country

A **tax pack** is the part of Fairhour that knows the rules of one country. The engine hands it an
invoice (lines, client, issue date, the freelancer's settings) and the pack returns the exact
amounts to put on that invoice, each with an explanation and its legal source. This guide walks
you from "my country is missing" to a merged pack, step by step.

You do not need to be both a tax expert and a TypeScript developer: an accountant who knows the
rules and a developer who knows the toolchain make a good pair, and the research and the
specification (steps 1 to 3) need no code at all.

> [!CAUTION]
> Fairhour's figures are **informational**. Every pack says so in its metadata, its documentation
> and the app, and every pack is reviewed against its sources, but none of it is tax or legal
> advice: users must verify their invoices with an accountant. Write your pack, its messages and
> its docs in that spirit.

What you will build, in the order of this guide:

1. [Open a tax pack request](#1-open-a-tax-pack-request)
2. [Research the law](#2-research-the-law)
3. [Write the specification](#3-write-the-specification)
4. [Copy the template](#4-copy-the-template)
5. [Model the configuration](#5-model-the-configuration)
6. [Version the parameters by effective date](#6-version-the-parameters-by-effective-date)
7. [Cite the sources](#7-cite-the-sources)
8. [Write the rules](#8-write-the-rules)
9. [Choose the rounding policy](#9-choose-the-rounding-policy)
10. [Write the messages](#10-write-the-messages)
11. [Refuse what the pack does not model](#11-refuse-what-the-pack-does-not-model)
12. [Pin golden fixtures](#12-pin-golden-fixtures)
13. [Test every rule](#13-test-every-rule)
14. [Pass the conformance suite](#14-pass-the-conformance-suite)
15. [Document and register the pack](#15-document-and-register-the-pack)
16. [Add a changeset and open the pull request](#16-add-a-changeset-and-open-the-pull-request)
17. [Using Claude Code](#17-using-claude-code)
18. [After the merge: stewardship](#18-after-the-merge-stewardship)

Throughout, the examples come from the template, [`packages/tax-pack-template`](../../packages/tax-pack-template/README.md):
a complete, working pack for **Exampleland**, a fictional country with the pack id `xx`. Its law
is small but realistic: a VAT with a standard and a reduced rate that changed on 1 January 2026, a
small-business exemption that requires a note on the invoice, and a withholding tax on fees. Two
real packs show the level of detail expected: the [Italy tax pack](../tax-packs/it.md) (the
reference) and the [generic pack](../tax-packs/generic.md). The engine contract is in the
[tax engine design](../design/tax-engine.md), and the short version of the rules for every
package under `packages/tax-*` is [`packages/tax-core/CLAUDE.md`](../../packages/tax-core/CLAUDE.md).

## 1. Open a tax pack request

Before you write anything, open a
[tax pack request](https://github.com/fabiovincenzi/fairhour/issues/new?template=tax_pack_request.yml).
It asks for the country code, the regimes and who uses them, the rules that appear on an invoice,
the official sources and one worked example. The request lets us:

- check that nobody else is working on the same country (requests are listed under the
  [`tax-pack-request` label](https://github.com/fabiovincenzi/fairhour/issues?q=is%3Aissue+label%3Atax-pack-request));
- check whether the [generic pack](../tax-packs/generic.md) already covers the case (a single VAT
  rate, an optional withholding and a note are enough for many freelancers);
- agree on the **scope** of a first version. Start with the regime most freelancers use, invoices
  in the national currency and domestic clients; list the rest as known limitations. A small pack
  that is right is worth more than a large one that is almost right.

Say in the request that you will implement the pack, so that a maintainer can assign it to you.

## 2. Research the law

Every amount the pack computes must trace back to a provision of law or an official publication.
Collect, for each regime in scope:

- **what appears on the invoice**: taxes and their rates, contributions or surcharges, withholdings,
  stamp duties, fixed charges, and the mandatory wording (exemption notes, reverse charge, legal
  references), in the country's language;
- **how each amount is computed**: the base (fees only? expenses? disbursements?), the rate,
  thresholds (at, below and above), and when the rule applies (client kind, client country,
  regime, the freelancer's choices);
- **rounding**: what the law says, and where the law is silent;
- **history**: the date each current value took effect, and the previous value. A pack resolves
  the parameters on the invoice's issue date, so users can still compute an invoice dated last
  year.

Prefer official sources, in this order: the consolidated legal text (the national official
gazette or legislation database), then official publications of the tax authority (guides,
rulings, FAQs, circulars), then EU law for EU countries. Professional literature (accountants'
guides, the professional press) is useful to find and understand the provisions, but it confirms
them only when several sources agree.

### What to cite

Cite the **pinpoint**: the act, its official title in the source's language, the article,
paragraph and letter (`"Legge 23 dicembre 2014, n. 190"`, `"art. 1, commi 54-89"`), and an https
link to the official text when one exists. Cite the provision that _creates_ the rule, not a page
that summarizes it; add the summary as a second source if it helped.

### How sure are you? Verification marks

Mark every point of your research with how you checked it, in the specification and in the code
(`SourceRef.verification`). These are the marks of the [Italy tax pack](../tax-packs/it.md#2-how-the-sources-were-verified):

| Mark      | Meaning                                                                                                        | `verification` in code                                              |
| --------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **[O]**   | Confirmed by an official publication: the tax authority's guide, ruling or FAQ, a government notice, an EU act | `{ status: "verified", on: "<date>", against: "official-summary" }` |
| **[S]**   | Confirmed by several consistent secondary sources (professional press, practitioners' guides)                  | `{ status: "verified", on: "<date>", against: "secondary" }`        |
| **[TBV]** | To be verified: plausible and widely repeated, but not confirmed against an official text                      | `{ status: "to-be-verified", reason: "<what is missing>" }`         |

When you read the consolidated legal text itself, in full, record `against: "primary-text"`: that
is the goal for every source of a released pack. Upgrading a mark later is a metadata change and
needs no new parameter version.

**Never invent a citation.** If you cannot find the provision behind a rule, write the rule with a
`to-be-verified` source that says what is missing; reviewers can help. The conformance suite lists
every `to-be-verified` source in its output, so nothing uncertain goes unnoticed.

When the law is ambiguous (two readings, both defended by professionals), do not pick one
silently: make it a setting when users may legitimately differ, choose the **conservative
default** (the one that cannot cost the user a penalty), and say so in the docs.

## 3. Write the specification

Write `docs/tax-packs/<cc>.md` before the code, where `<cc>` is the ISO 3166-1 alpha-2 code in
lower case (`de`). Model it on the [Italy tax pack](../tax-packs/it.md); a smaller country can
merge sections, but keep their substance:

1. **Disclaimer** at the top: the figures are informational and must be verified with an
   accountant, in English and in the country's language.
2. **Header**: pack id, countries, locales, document locale, status, backlog id.
3. **Scope**: regimes, currencies and clients covered; everything else goes to the limitations.
4. **How the sources were verified**: where you searched, what you could read, the marks above.
5. **Glossary** of the local terms.
6. **Configuration**: every setting, its type, its default and _why that default_.
7. **Per-invoice options and input checks**: options, and every issue code the pack refuses with.
8. **Rule pipeline**: a table with the order, the rule ids, when each applies and what it emits;
   the tax groups with their ids and treatments.
9. **Rules in detail**, one subsection per rule, each with its sources and marks.
10. **Rounding policy**: mode and scope of every rounding, its source or the conservative choice.
11. **Worked examples**: real-world invoices, computed by hand, with every intermediate amount.
    They become the golden fixtures.
12. **Parameter timeline**: every version with its effective date, values and sources.
13. **Wording**: the mandatory notes in the country's language, with their sources.
14. **Open legal points** and **known limitations**.
15. **Test plan and golden fixtures**: the table-driven cases, the properties, the fixture list.
16. **Sources**: the full list, with links.

Open the specification as a draft pull request (or attach it to the request) and ask for a review
before you write the code: changing a table is cheaper than changing a rule and its tests. If the
pack needs something the engine does not offer (a tax on a tax, tax-inclusive prices, cash
rounding: see the [open points of the design](../design/tax-engine.md#10-open-points)), say so in
the request; it needs an ADR first.

## 4. Copy the template

The template has every file of the [pack layout](../design/tax-engine.md#8-pack-package-layout),
and every place you must change carries a `TEMPLATE:` comment that says what to do. From the
repository root, with your country code in three spellings:

```bash
cc=de Cc=De CC=DE
cp -R packages/tax-pack-template "packages/tax-pack-$cc"
cd "packages/tax-pack-$cc"
rm -rf node_modules dist coverage src/__snapshots__
perl -pi -e "s/tax-pack-template/tax-pack-$cc/g" package.json
grep -rlE 'xx|Xx|XX' src test fixtures | xargs perl -pi -e "s/xx/$cc/g; s/Xx/$Cc/g; s/XX/$CC/g"
cd ../.. && pnpm install
pnpm --filter "@fairhour/tax-pack-$cc" test
```

This renames the package to `@fairhour/tax-pack-<cc>` and every identifier, message key, rule id
and parameter id from `xx` to your code (`xxPack` becomes `dePack`, `"xx.vat"` becomes `"de.vat"`,
`XX_PARAMETERS` becomes `DE_PARAMETERS`). `pnpm install` links the new workspace package and adds
it to `pnpm-lock.yaml`; commit both. The first test run writes a new parameter snapshot
(`src/__snapshots__/conformance.test.ts.snap`); commit it too, because CI never writes snapshots.

Every test passes except `src/template.test.ts`, which fails until no `TEMPLATE:` marker and no
mention of Exampleland is left, and prints the files that still have one. That is your to-do list:

```bash
grep -rn "TEMPLATE:" "packages/tax-pack-$cc/src" "packages/tax-pack-$cc/test"
```

Work through the markers in the order of the next sections. Then:

- rename `src/messages/eo.ts` (Esperanto stands in for Exampleland's language) to your country's
  language, `de.ts`, and update `src/messages/index.ts` and `meta.locales`;
- write the pack's `meta` in `src/index.ts`: `name`, `description`, `countries` as real codes
  (`[countryCode("DE")]`; the template says `"any"` only because XX is not an assigned code),
  `docsUrl` (`https://fabiovincenzi.github.io/fairhour/tax-packs/<cc>/`), your GitHub handle in
  `maintainers`, and `documentLocale` (the language legal notes are printed in);
- replace the five fixtures in `fixtures/invoices/` with yours (section 12);
- rewrite `README.md` for your pack (keep `src/readme.test.ts` in sync with its examples), set
  `description` and `keywords` in `package.json`, and delete `CLAUDE.md` (the rules of
  `packages/tax-core/CLAUDE.md` apply to every pack);
- delete what your country does not need: a rule, its test, its messages, its settings.
  Exampleland's withholding, for example, does not exist everywhere.

Keep what makes the pack a Fairhour pack: the `LICENSE` file and `"license": "MIT"` in
`package.json` (packs are MIT so that anyone can embed them, [ADR-0002](../adr/0002-licensing.md);
`pnpm license:check` fails otherwise), `mitLibrary: true` and `moneySafety: true` in
`eslint.config.js`, the 95 % coverage thresholds in `vitest.config.ts`, and the dependencies:
`@fairhour/money`, `@fairhour/tax-core` and `zod` only. The lint configuration rejects imports of
any other `@fairhour/*` package.

## 5. Model the configuration

The configuration holds the choices a freelancer makes once, in the workspace's tax settings: the
regime, which legal rate their services use, custom wording. It is a zod 4 schema with strict rules,
because the settings form is generated from it (`z.toJSONSchema`) and the parsed value is stored
as JSON:

- **JSON in, JSON out**: no transforms, no `bigint`, no `Date`. Decimal values are strings.
- **Idempotent**: `parse(parse(x))` equals `parse(x)`; the conformance suite checks it.
- **Strict objects** (`z.strictObject`): a misspelled key is an error, not a silently ignored
  setting.
- **Defaults** with `.default()` for scalars and `.prefault({})` for nested objects. zod 4's
  `.default({})` returns `{}` without parsing it, so the inner defaults would not be applied.
- **Conservative defaults**: the most common, safest choice in the country, and the docs say why.
- **No legal values**: rates, thresholds and fixed amounts change with the law, so they live in the
  parameters (section 6). The configuration names them (`"standard"`, `"reduced"`), never repeats
  them as numbers.

From `src/config.ts`:

```ts
export const configSchema = z.strictObject({
  vatRegistered: z.boolean().default(true),
  defaultVatRate: z.enum(VAT_RATE_NAMES).default("standard"),
  smallBusinessNote: text(500).optional(),
  withholding: z
    .strictObject({
      enabled: z.boolean().default(true),
      rate: z.enum(WITHHOLDING_RATE_NAMES).default("standard"),
    })
    .prefault({}),
});

export type XxConfig = z.output<typeof configSchema>; // what rules see as ctx.config
```

Per-invoice options (`src/options.ts`) follow the same rules. They are for exceptions on one
invoice ("the client confirmed in writing that no withholding applies"), not for settings; a pack
without options uses `z.strictObject({})`.

## 6. Version the parameters by effective date

Every legal value the rules use is a **parameter**: rates, thresholds, fixed amounts, wording the
law fixes. Parameters come in versions; each one is a full snapshot with an inclusive
`effectiveFrom` date, and the next version's date ends it. An invoice uses the version in force on
its issue date, so an invoice dated 31 December 2025 keeps the 2025 rates.

From `src/parameters.ts`:

```ts
export const XX_PARAMETERS: readonly ParameterVersion<XxParams>[] = deepFreeze([
  {
    id: "xx-2024-01-01",
    effectiveFrom: isoDate("2024-01-01"),
    params: {
      vat: { standardRate: decimal("20"), reducedRate: decimal("10") },
      withholding: { standardRate: decimal("15"), newBusinessRate: decimal("7") },
    },
    sources: [vatActRates, incomeTaxActWithholding],
    changes: [
      "Initial version: VAT 20% (standard) and 10% (reduced); withholding 15%, or 7% for new businesses.",
    ],
  },
  {
    id: "xx-2026-01-01",
    effectiveFrom: isoDate("2026-01-01"),
    params: {
      vat: { standardRate: decimal("21"), reducedRate: decimal("10") },
      withholding: { standardRate: decimal("15"), newBusinessRate: decimal("7") },
    },
    sources: [budgetAct2025],
    changes: ["Standard VAT rate 21% (was 20%)."],
  },
]);
```

- Rates are `Decimal` values in percent units, parsed from strings: `decimal("21")`, never `21`.
- Ids are `<cc>-<effectiveFrom>`, unique and never reused.
- The first version starts on the earliest issue date the pack supports; an earlier invoice throws
  `ParameterNotFoundError`, which is better than a wrong figure.
- **Append-only.** A released version is never edited. When the law changes, copy the last
  version, change what the law changed, and add it with its source and a `changes` summary. The
  conformance suite compares the timeline with a committed snapshot, so an edit shows up in review.
  If a released version turns out to be wrong from its first day, do not fix it silently: open an
  issue, so that a maintainer decides how to correct it (stored invoices name the version they
  were computed with). Before the first release of the pack, versions can still change freely.

## 7. Cite the sources

`src/sources.ts` has one `SourceRef` per provision, reused by the rules, the parameter versions
and, through them, every step of the explanation trace. Mirror each one in the "Sources" section of
your specification.

```ts
export const vatActRates: SourceRef = deepFreeze({
  id: "xx.vat-act.art-5", // unique within the pack, stable: "<cc>.<act>.<article>"
  kind: "statute", // statute, regulation, eu-law, ruling, guidance, technical-specification, ...
  title: VAT_ACT, // the official title, in the source's language
  citation: "art. 5 (rates)", // the pinpoint
  url: `${VAT_ACT_URL}#art-5`, // https only, when one exists
  verification: {
    status: "to-be-verified",
    reason: "Fictional provision of the Exampleland template pack: ...",
  },
});
```

A real source records how you checked it:
`verification: { status: "verified", on: isoDate("2026-10-10"), against: "official-summary" }`.

## 8. Write the rules

The pipeline is a list of small rules, run in order. Each rule reads the state built so far and
the context (the validated input, the parsed configuration and options, the parameters of the
issue date, the rounding policy), and returns what it **adds**: tax groups, line assignments,
components (taxes, contributions, withholdings, stamp duties), legal notes, warnings, trace steps,
facts. The engine merges the output, checks a contract after every rule, derives the tax summary
and every total itself, and asserts that the document reconciles. A rule never computes a total.

Every pack starts with a rule that puts each line in a **tax group**, a row of the invoice's tax
summary (`src/groups.ts` builds them): one taxable group per rate (`vat-21`), and one group per
reason for charging no tax (`exempt`, `out-of-scope`, `excluded` for disbursements). Register only
the groups that receive lines, in a canonical order (the conformance suite shuffles the lines and
expects the same summary).

The withholding rule of the template, in full, shows most of the rules below:

```ts
export const withholdingRule: XxRule = {
  id: WITHHOLDING_RULE_ID, // "xx.withholding": stable, prefixed with the pack id
  title: message("xx.rule.withholding.title"),
  sources: [incomeTaxActWithholding], // at least one
  // Structural (the configuration): when false, the rule is skipped silently.
  appliesTo: (ctx) => ctx.config.withholding.enabled,
  apply: (state, ctx) => {
    // A business outcome is explained in the trace, never skipped silently.
    if (!ctx.input.client.isWithholdingAgent) {
      return { trace: [{ message: message("xx.trace.withholding.not-agent") }] };
    }
    if (ctx.options.withholding === "skip") {
      return { trace: [{ message: message("xx.trace.withholding.skipped") }] };
    }
    const base = sumNet(state, (line) => isFeeLine(line), ctx.currency);
    if (base.amount === 0n) {
      return { trace: [{ message: message("xx.trace.withholding.no-base") }] };
    }
    const rate = withholdingRate(ctx.params, ctx.config.withholding.rate);
    // Money only through @fairhour/money, with the mode of the rounding policy.
    const amount = percentage(base, rate, ctx.rounding.withholdings.mode);
    return {
      components: [
        {
          id: WITHHOLDING_COMPONENT_ID,
          kind: "withholding",
          label: message("xx.component.withholding", { rate: p.percent(rate) }),
          effect: "deducted-from-payable",
          base,
          rate,
          amount,
        },
      ],
      trace: [
        {
          message: message("xx.trace.withholding", { rate: p.percent(rate) }),
          formula: message("core.formula.percentage", {
            rate: p.percent(rate),
            base: p.money(base),
            amount: p.money(amount),
          }),
          amount,
          componentId: WITHHOLDING_COMPONENT_ID, // every component needs a trace step
        },
      ],
    };
  },
};
```

What every rule must respect:

- **Pure.** No I/O, no clock (`Date.now()`, `new Date()` without an input), no randomness, no
  environment, no network, no global mutable state. The same input gives byte-identical output.
  The lint configuration and `src/purity.test.ts` enforce it. A rule must not throw for valid
  input; if it does, the engine reports a pack bug.
- **Money only through `@fairhour/money`.** Amounts are `Money` (`bigint` minor units), rates and
  quantities are `Decimal` values parsed from strings. Never `Number(...)`, `parseFloat`,
  `parseInt`, unary `+`, `toFixed` or `Math.round` on an amount. Every operation that can produce
  a fraction of a minor unit (`percentage`, `multiply`, `divide`) takes an explicit rounding mode:
  the one of the pack's rounding policy (`ctx.rounding`), never a literal in the rule.
- **Append-only output.** A rule adds; it never changes what an earlier rule produced. Use
  `appliesTo` for structural choices (regime, settings) and a trace step for outcomes ("no
  withholding: the client is not a withholding agent").
- **One tax per group.** A tax group receives at most one tax allocation, across all components:
  a second tax on the same group is a contract violation. A tax component's `rate`, when present,
  must equal the rate of every group it allocates to; a tax that spans several rates omits its
  `rate`. The helper `taxAllocations(state, ctx.rounding.taxes, ctx.currency)` builds one
  allocation per taxable group with the right base and rounding; the template's VAT rule uses it
  as it is, and most VAT, GST and sales taxes fit it.
- **Sources on every rule** (and every parameter version), at least one. Components, notes and
  trace steps inherit the rule's sources unless they cite their own.
- **Explain every step.** Each component needs at least one trace step with its `componentId`;
  give the arithmetic as a `formula` (`core.formula.percentage` renders "21% × €1,000.00 =
  €210.00").
- **Never build a record keyed by user text with plain assignment.** Line ids, references and
  option keys come from the caller: `record[line.id] = groupId` on an object literal would hit the
  prototype setter for `__proto__`. The engine rejects the reserved line ids (`__proto__`,
  `constructor`, `prototype`) up front, but build such records with `Object.fromEntries`, as the
  template's classification rule does, or use a `Map` internally:

  ```ts
  const assignments: [lineId: string, groupId: string][] = [];
  // ...
  return { groups, lineGroups: Object.fromEntries(assignments) };
  ```

- **Facts** pass a decision to later rules (Italy: `{ withholdingApplied: boolean }`). Declare
  them with a `type` alias, not an `interface`, and give every key an initial value in
  `initialFacts`.

The full contract (every check and its reason code) is in the
[design, section 4.7](../design/tax-engine.md#47-rules-and-the-pipeline-state), with the later
clarifications in [section 4.15](../design/tax-engine.md#415-changes-during-implementation-tax-002-tax-011).

## 9. Choose the rounding policy

`src/rounding.ts` declares where and how the pack rounds: line totals, contributions (per group),
taxes (per group or per line) and withholdings (per document), each with a mode. Round once per
legally relevant amount; the engine derives every total by addition, so the invoice always
reconciles.

```ts
export function roundingPolicy(): RoundingPolicy {
  return {
    step: "minor-unit",
    lines: { mode: XX_ROUNDING_MODE },
    contributions: { mode: XX_ROUNDING_MODE, scope: "per-group" },
    taxes: { mode: XX_ROUNDING_MODE, scope: "per-group" }, // VAT once per rate
    withholdings: { mode: XX_ROUNDING_MODE, scope: "per-document" },
    description: message("xx.rounding.description"),
  };
}
```

Many laws say "to the cent" without saying where intermediate rounding happens. Pick the
conservative reading (usually half up, the tax once per rate), document it in the specification's
rounding section, and pin a rounding tie in a golden fixture.

## 10. Write the messages

Every text the pack produces is a message key with typed parameters, formatted per locale later:
group labels, component labels, trace steps, legal notes, warnings, refusals. `src/messages/en.ts`
is the source catalog, and every other locale has exactly its keys, with the same placeholders in
each message (the conformance suite checks both; the template's types make a missing key a
compile error).

```ts
export const en = {
  "meta.name": "Exampleland (template)",
  "meta.disclaimer":
    "... Figures computed by a real pack are informational: verify them with an accountant.",
  "xx.group.vat": "VAT {rate}",
  "xx.trace.withholding": "Withholding tax: {rate} of the fees before VAT",
  "xx.note.small-business":
    "VAT not charged: small-business exemption under article 30 of the Exampleland VAT Act.",
  "xx.note.custom": "{text}",
  // ...
} as const;
```

- Keys start with the pack id (`de.trace.vat`); `core.*` keys belong to the engine, and
  `meta.name`, `meta.description` and `meta.disclaimer` are required in every locale. The
  disclaimer says that the figures are informational and must be verified with an accountant.
- The syntax is a strict subset of ICU MessageFormat: placeholders are `{name}`, and the
  parameter's type (`p.money`, `p.percent`, `p.date`, `p.text`...) decides the formatting. There
  is no `{x, number}`, no plural and no select: use separate keys.
- An ASCII apostrophe directly before a brace is an error (ICU would read it as quoting): write the
  typographic apostrophe there, as in `"dell’{name}"`.
- **User-supplied text is a parameter, never message syntax.** A custom note, a line description
  or a reference goes in a `text` parameter, printed verbatim in every locale. Never concatenate
  it into a message or use it as a key: braces and apostrophes in it would break the message.

  ```ts
  message("xx.note.custom", { text: p.text(ctx.config.smallBusinessNote) }); // "{text}"
  ```

- Legal notes are printed on the invoice in `meta.documentLocale`. Translate them from the official
  wording and cite the provision. See the [translation guide](translations.md) for style.

## 11. Refuse what the pack does not model

`validateInput` (in `src/validate-input.ts`) returns the inputs the pack refuses, as localizable
issues with a path and a code (`de.currency-not-eur`). The engine throws them all as an
`UnsupportedInputError` before any rule runs. Refuse rather than compute a wrong figure: a currency
other than the one of the pack's monetary thresholds, a line rate the law does not have, an
option combination the law excludes. Document every issue code in the specification.

The hook runs before the engine resolves the parameters, and it must never throw. The template
looks the parameters up itself and skips the rate check before the first version, so that the
engine reports a too-early date as `ParameterNotFoundError`.

## 12. Pin golden fixtures

A golden fixture is one real-world invoice, computed by hand, in
`fixtures/invoices/<name>.json`: the configuration, the input and the expected output. The
conformance suite computes each one and compares. Every regime and every edge case gets one:
thresholds at, just below and just above the limit; a rounding tie; a credit note; each parameter
version on its first day; and each refusal (`expectedError`).

From `fixtures/invoices/reduced-rate-withholding-rounding.json` (abridged):

```json
{
  "name": "reduced-rate-withholding-rounding",
  "description": "... Translation 3 h × €111.11 = €333.33; printed copies (goods) 2 × €12.50 = €25.00; subtotal €358.33. VAT 10% × €358.33 = €35.833, rounded half up once per rate to €35.83. Withholding 15% of the fees only (goods are not fees): 15% × €333.33 = €49.9995, rounded half up to €50.00. Total €358.33 + €35.83 = €394.16; net payable €394.16 − €50.00 = €344.16.",
  "pack": "xx",
  "sources": [
    { "title": "Exampleland Value Added Tax Act (fictional)", "citation": "art. 5 (rates)" },
    {
      "title": "Exampleland Income Tax Act (fictional)",
      "citation": "art. 25 (withholding on professional fees)"
    }
  ],
  "config": { "defaultVatRate": "reduced" },
  "input": {
    "issueDate": "2026-03-16",
    "currency": "EUR",
    "client": { "...": "..." },
    "lines": ["..."]
  },
  "expected": {
    "parameters": "xx-2026-01-01",
    "subtotal": "358.33",
    "components": [
      {
        "id": "xx.vat",
        "kind": "tax",
        "effect": "adds-to-total",
        "base": "358.33",
        "rate": "10",
        "amount": "35.83"
      },
      {
        "id": "xx.withholding",
        "kind": "withholding",
        "effect": "deducted-from-payable",
        "base": "333.33",
        "rate": "15",
        "amount": "50.00"
      }
    ],
    "vatSummary": [
      {
        "groupId": "vat-10",
        "treatment": "taxable",
        "rate": "10",
        "base": "358.33",
        "tax": "35.83"
      }
    ],
    "total": "394.16",
    "withholdingTotal": "50.00",
    "netPayable": "344.16",
    "legalNotes": [],
    "warnings": [],
    "traceRuleIds": ["core", "xx.classify-lines", "xx.vat", "xx.withholding", "core"]
  }
}
```

- **Compute the values by hand**, from the law, not by running the pack and copying its output:
  a fixture copied from the code proves nothing. Write the derivation in `description`, every
  intermediate amount and rounding included, and cite the provisions in `sources`.
- **Pin `total` and `netPayable`** in every `expected`. (`netPayable` may be left out only when
  `components` is listed exhaustively with every `effect`, which determines it; pin it anyway.)
- Amounts are strings with exactly the currency's decimals (`"1042.00"` for EUR, `"6250"` for JPY);
  rates compare by value (`"10"` equals `"10.00"`).
- `components` lists exactly the computed components in order (unless you add
  `"componentsExhaustive": false`); `vatSummary`, `legalNotes`, `warnings` and `traceRuleIds` are
  exhaustive and ordered. Fields you leave out are not checked.
- `name` equals the file name, in kebab case, and `pack` is the pack id.
- A refusal pins the error instead:
  `"expectedError": { "code": "unsupported-input", "issueCodes": ["xx.unknown-vat-rate"] }`.
- **A behaviour change updates the fixture deliberately**, in the same commit, and the commit
  message says why. Never update a fixture just to make a test pass.

The full schema is in the [design, section 6](../design/tax-engine.md#6-golden-fixtures).

## 13. Test every rule

Next to each rule, `src/rules/<rule>.test.ts` is a table-driven test: one row per cell of the
rule's table in the specification, the rounding cases, and every outcome that only shows in the
trace. From `src/rules/vat.test.ts`:

```ts
const CASES: Readonly<Record<string, VatCase>> = {
  // 21% × 0.50 = 0.105: a tie, half up gives 0.11.
  "a tie rounds half up": {
    config: {},
    lines: [line("0.50")],
    expected: [["vat-21", "0.50", "0.11"]],
    total: "0.61",
  },
  // 21% × (0.50 + 0.50) = 0.21 once per rate; per line it would be 0.11 + 0.11 = 0.22.
  "once per rate, not per line": {
    config: {},
    lines: [line("0.50"), line("0.50")],
    expected: [["vat-21", "1.00", "0.21"]],
    total: "1.21",
  },
  // ...
};

it.each(Object.entries(CASES))("%s", (_name, item) => {
  const c = compute(item.config, item.lines);
  // ...
});
```

The template also has tests for the configuration, the parameters, the refusals and the pack
object; keep them and adapt them. Two more kinds of test come with it:

- **Properties** (`src/property.test.ts`, fast-check): one per sentence of the specification that
  says "always" or "never" ("the withholding is always 15 % of the fees", "the small-business
  regime never charges VAT"), recomputed independently from the input. `invoiceInputArbitrary`
  from `@fairhour/tax-core/conformance` generates the invoices.
- **Purity** (`src/purity.test.ts`): scans the shipped code for clocks, randomness, the
  environment, I/O and floats on amounts. Keep it as it is.

Coverage must stay at or above 95 % for lines, branches, functions and statements. Run the checks
one script at a time:

```bash
pnpm --filter @fairhour/tax-pack-de lint
pnpm --filter @fairhour/tax-pack-de typecheck
pnpm --filter @fairhour/tax-pack-de test
pnpm --filter @fairhour/tax-pack-de build
pnpm --filter @fairhour/tax-pack-de exec vitest run src/rules/vat.test.ts   # one file
```

## 14. Pass the conformance suite

`src/conformance.test.ts` registers the shared suite of `@fairhour/tax-core/conformance`, with the
inputs listed in `test/conformance-data.ts`:

```ts
defineConformanceSuite(xxPack, {
  fixturesDir: fileURLToPath(new URL("../fixtures/invoices", import.meta.url)),
  validConfigs, // one per regime and option value
  invalidConfigs, // the mistakes users make, each with the reason it must fail
  sampleInputs, // realistic invoices: every client kind and treatment, a credit note, no lines
  invoiceOptions,
  input: { currencies: ["EUR", "USD", "JPY"] },
  packageVersion: packageJson.version,
});
```

It runs one test per check, and none can be skipped. A pack is not done until every one passes:

| Check                      | What it means for your pack                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `meta.identity`            | The id, version (equal to `package.json`), countries, https `docsUrl`, maintainers and locales (`en` included) are well formed.        |
| `meta.disclaimer`          | `meta.name`, `meta.description` and `meta.disclaimer` exist and format in every locale.                                                |
| `messages.complete`        | Every locale has exactly the keys of `en`, no `core.*` key, and is listed in `meta.locales`.                                           |
| `messages.syntax`          | Every message parses, and each locale uses the same placeholders as `en`.                                                              |
| `config.valid`             | Every entry of `validConfigs` parses.                                                                                                  |
| `config.invalid`           | Every entry of `invalidConfigs` is rejected.                                                                                           |
| `config.idempotent`        | A parsed configuration parses to itself and survives a JSON round trip (no transforms).                                                |
| `config.json-schema`       | Both schemas convert to JSON Schema (the settings form is generated from it).                                                          |
| `parameters.timeline`      | Versions are sorted by date, with unique ids, sources and `changes`, and deeply frozen.                                                |
| `parameters.snapshot`      | The timeline matches the committed snapshot: a released version was not edited.                                                        |
| `parameters.resolution`    | Each version resolves on its first day, the previous one the day before, and a date before the first throws `ParameterNotFoundError`.  |
| `rules.identity`           | Rule ids are unique, match the pattern and start with the pack id; title keys exist.                                                   |
| `rules.sources`            | Every rule and version has well-formed sources; `to-be-verified` ones are listed as annotations, not failures.                         |
| `rounding.policy`          | The rounding policy is valid for every valid configuration.                                                                            |
| `fixtures.schema`          | Every fixture matches the schema, its `name` is its file name, its `pack` the pack id.                                                 |
| `fixtures.golden`          | Every fixture computes to its `expected` values, or throws its `expectedError`.                                                        |
| `samples.compute`          | Every sample input computes with every valid configuration (or is refused by `validateInput`).                                         |
| `property.reconciliation`  | On random invoices, the eight reconciliation identities hold (totals, summary, deductions).                                            |
| `property.determinism`     | The same input, computed twice or cloned, gives byte-identical JSON.                                                                   |
| `property.permutation`     | Shuffling the lines changes no total, component or summary row: register groups in a canonical order.                                  |
| `property.non-negative`    | Every amount is zero or positive, credit notes included.                                                                               |
| `property.currency`        | Every amount is in the invoice currency.                                                                                               |
| `property.rounding-bounds` | Each rounded amount is within the bound of its rounding mode of `base × rate`; a tax rounded per line may drift by one bound per item. |
| `property.immutability`    | The result is deeply frozen.                                                                                                           |
| `property.trace`           | Steps are numbered 1..n, every component has a trace step, and every message formats in every locale.                                  |
| `property.json`            | The computation survives a JSON round trip.                                                                                            |
| `property.invalid-input`   | Malformed inputs throw `InvalidInputError`, never another error.                                                                       |
| `thresholds.contract`      | Only with an `annualThresholds` capability: the revenue tracker's statuses are monotonic.                                              |

### Debugging a failing property

Each property check computes 200 random invoices, each with a random entry of `validConfigs`, a
currency of `input.currencies` and an entry of `invoiceOptions`. When one fails, the message gives
the problem (amounts in minor units), the fast-check seed and path, the configuration and the
shrunk input as JSON:

```text
Error: tax "de.vat" on "vat-19": 1902 is too far from 10000 × 19e-0% (seed 1234567, path "17:2:0"; validConfigs[3], input {"issueDate":"2026-03-16",...})
```

1. Copy the input JSON and `validConfigs[3]` into a new row of the table-driven test of the rule at
   fault (or into a golden fixture, if it is a real-world case), with the value you expect. Run
   that one test file: it fails the same way, deterministically.
2. To replay the property itself, pass the seed temporarily:
   `properties: { seed: 1234567 }` in the options of `defineConformanceSuite`. Remove it before
   you commit.
3. Fix the rule, not the test. Keep the new row: it is the regression test.

`parameters.snapshot` fails when the timeline changed. If you added a version, review the
snapshot diff and update it with
`pnpm --filter @fairhour/tax-pack-de exec vitest run -u src/conformance.test.ts`. If the diff
touches a released version, revert that edit and add a new version instead.

## 15. Document and register the pack

- **Specification**: finish `docs/tax-packs/<cc>.md` (section 3), with the "changes during
  implementation" you made. The docs site copies it automatically; check the result with
  `pnpm --filter @fairhour/docs build`, which also validates every link.
- **Docs site**: add a row to the "Available packs" table of
  [`apps/docs/src/content/docs/tax-packs/index.md`](../../apps/docs/src/content/docs/tax-packs/index.md).
- **README**: add a row to the tax pack table of the [root README](../../README.md#tax-packs).
- **Stewardship**: add yourself to the "Tax pack stewards" table of
  [MAINTAINERS.md](../../MAINTAINERS.md) and to [`.github/CODEOWNERS`](../../.github/CODEOWNERS)
  (`/packages/tax-pack-<cc>/  @you`).
- **Commit scope**: add `tax-pack-<cc>` to the `scope-enum` list of
  [`commitlint.config.js`](../../commitlint.config.js).

The pull request labeler, the license check and the workspace pick up `packages/tax-pack-*`
without changes.

## 16. Add a changeset and open the pull request

Describe the new package for the changelog:

```bash
pnpm changeset   # pick @fairhour/tax-pack-de, "minor", and write "Add the Germany tax pack: ..."
```

Then run everything once more from the repository root, and open the pull request with the
title `feat(tax-pack-<cc>): add <country> tax pack` and `Closes #<request>` in the description.
Every commit is signed off (`git commit -s`, see [CONTRIBUTING.md](../../CONTRIBUTING.md)).

```bash
pnpm --filter @fairhour/tax-pack-de lint
pnpm --filter @fairhour/tax-pack-de typecheck
pnpm --filter @fairhour/tax-pack-de test
pnpm --filter @fairhour/tax-pack-de build
pnpm license:check
pnpm prettier --check packages/tax-pack-de docs/tax-packs
pnpm --filter @fairhour/docs build
```

Pull request checklist:

- [ ] The tax pack request is linked, and the scope matches what was agreed.
- [ ] `docs/tax-packs/<cc>.md` is complete: disclaimer, scope, configuration with the reason for
      each default, pipeline, rules with sources and marks, rounding, worked examples, timeline,
      wording, open points, limitations, test plan, sources.
- [ ] Every rule and parameter version cites its sources, mirrored in the docs; uncertain ones are
      `to-be-verified` with a reason, none is invented.
- [ ] Every legal value is a parameter with an effective date; no released version was edited.
- [ ] No `TEMPLATE:` marker and no mention of Exampleland is left (`src/template.test.ts` passes).
- [ ] Golden fixtures cover every regime, threshold, rounding tie, credit notes and refusals, with
      hand-computed values and their derivation; each pins `total` and `netPayable`.
- [ ] Every rule has a table-driven test; the pack's "always/never" sentences are properties.
- [ ] The conformance suite passes, coverage is at least 95 %, lint, typecheck and build pass.
- [ ] The package is MIT (`LICENSE`, `"license": "MIT"`) and depends only on `@fairhour/money`,
      `@fairhour/tax-core` and `zod`.
- [ ] The pack is registered (docs site, README, MAINTAINERS.md, CODEOWNERS, commit scope) and has
      a changeset.

The pack's steward (you, from now on) and a maintainer review the pull request; GOVERNANCE.md
requires a source for every rule and updated golden fixtures for every change to a pack.

## 17. Using Claude Code

The repository ships the configuration Fairhour is developed with. In
[Claude Code](https://claude.com/claude-code), run:

```text
/new-tax-pack de
```

The command asks the `architect` agent to research the regimes and write the specification first,
then to copy the template, implement the rules with their sources, the fixtures and the tests, and
to get the `reviewer` agent's approval. The rules it follows are the ones of this guide
([`packages/tax-core/CLAUDE.md`](../../packages/tax-core/CLAUDE.md) and the template's
`CLAUDE.md`).

An AI assistant is good at reading the toolchain and the conventions, and bad at knowing the law
of your country: check every citation it proposes against the official text, recompute every
fixture by hand, and mark what you could not confirm as `to-be-verified`. You are responsible for
the pull request and its sign-off, as for any other contribution
([AI-assisted contributions](../../CONTRIBUTING.md#ai-assisted-contributions)).

## 18. After the merge: stewardship

A pack encodes laws that change, so every pack has a **steward**, listed in
[MAINTAINERS.md](../../MAINTAINERS.md). As the steward of your pack, you:

- review the pull requests that touch it (CODEOWNERS requests your review);
- follow the law: budget acts, yearly rate updates, new thresholds. Add each change as a new
  parameter version, with its source, before it takes effect;
- upgrade the verification marks as you read the primary texts, and answer the open legal points;
- keep the disclaimer true: the pack's figures are informational, and the docs and the app say
  that they must be verified with an accountant.

If you can no longer look after the pack, say so in an issue: a maintainer looks after it until
someone else steps up, as [GOVERNANCE.md](../../GOVERNANCE.md) describes.
