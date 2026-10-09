import { decimal, money, percentage, sum } from "@fairhour/money";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import * as z from "zod";
import type { GoldenFixture } from "../fixtures/schema";
import { message, p } from "../messages/params";
import type { TaxPack } from "../pack/types";
import { isoDate } from "../primitives";
import {
  invalidConfigs,
  invoiceOptions,
  sampleInputs,
  validConfigs,
} from "../testing/conformance-data";
import { miniPack, miniRule, miniSource, type MiniPack } from "../testing/mini-pack";
import { testPack, xxMessages, xxParameters } from "../testing/test-pack";
import {
  CONFORMANCE_CHECK_IDS,
  runConformanceCheck,
  runConformanceChecks,
  type ConformanceCheckId,
  type ConformanceOptions,
} from "./checks";

const fixturesDir = fileURLToPath(new URL("../../fixtures/invoices", import.meta.url));

const options: ConformanceOptions = {
  fixturesDir,
  validConfigs,
  invalidConfigs,
  sampleInputs,
  invoiceOptions,
  input: { currencies: ["EUR", "JPY"] },
  properties: { numRuns: 12 },
  packageVersion: "1.0.0",
};

type AnyPack = TaxPack<never, never, never, never>;

/** Broken packs do not type-check as TaxPack on purpose. */
const anyPack = (pack: object): AnyPack => pack as AnyPack;

function failures(
  pack: object,
  id: ConformanceCheckId,
  overrides: Partial<ConformanceOptions> = {},
): readonly string[] {
  const result = runConformanceCheck(
    anyPack(pack),
    { ...options, ...overrides } as ConformanceOptions,
    id,
  );
  expect(result.id).toBe(id);
  expect(result.ok).toBe(result.failures.length === 0);
  return result.failures;
}

const expectFailure = (
  pack: object,
  id: ConformanceCheckId,
  pattern: RegExp,
  overrides: Partial<ConformanceOptions> = {},
): void => {
  const found = failures(pack, id, overrides);
  expect(found.length, `${id} should fail`).toBeGreaterThan(0);
  expect(found.join("\n")).toMatch(pattern);
};

/** The test pack with some catalogs replaced. */
const withMessages = (
  change: (catalogs: Record<string, Record<string, string>>) => void,
): object => {
  const catalogs = JSON.parse(JSON.stringify(xxMessages)) as Record<string, Record<string, string>>;
  change(catalogs);
  return { ...testPack, messages: catalogs };
};

describe("runConformanceChecks", () => {
  it("passes every check for the test pack, in the order of design section 5", () => {
    const results = runConformanceChecks(testPack, options);
    expect(results.map((result) => result.id)).toEqual([...CONFORMANCE_CHECK_IDS]);
    expect(results.filter((result) => !result.ok)).toEqual([]);
    const sources = results.find((result) => result.id === "rules.sources");
    expect(sources?.notes).toEqual([
      "to be verified: xx.withholding-act.art-25 (Fictional Withholding Act of XX, art. 25): Fictional source of the internal test pack",
    ]);
  });

  it("passes with inline fixtures and default input settings", () => {
    const fixture: GoldenFixture = {
      name: "inline",
      description: "inline fixture",
      pack: "xx",
      sources: [{ title: "T", citation: "C" }],
      config: {},
      input: sampleInputs[0],
      expected: { componentsExhaustive: false, total: "1336.00" },
    };
    const { fixturesDir: _ignored, ...rest } = options;
    const inline = {
      ...rest,
      fixtures: [fixture],
      input: undefined,
      invoiceOptions: undefined,
    } as unknown as ConformanceOptions;
    for (const id of [
      "fixtures.schema",
      "fixtures.golden",
      "samples.compute",
      "property.reconciliation",
    ] as const) {
      expect(runConformanceCheck(testPack, inline, id).failures).toEqual([]);
    }
  });

  it("uses the pack's countries as default client countries", () => {
    const italian = { ...testPack, meta: { ...testPack.meta, countries: ["IT"] } };
    const { input: _ignored, ...rest } = options;
    expect(
      runConformanceCheck(anyPack(italian), rest as ConformanceOptions, "property.currency")
        .failures,
    ).toEqual([]);
  });

  it("reports a check that throws as a failure", () => {
    expectFailure(
      { ...testPack, parameters: [{ ...xxParameters[0]!, params: { f: () => 1 } }] },
      "parameters.snapshot",
      /the check threw: TypeError/,
    );
  });
});

describe("meta checks", () => {
  it("meta.identity reports every metadata problem", () => {
    const broken = {
      ...testPack,
      meta: {
        ...testPack.meta,
        id: "X",
        name: " ",
        description: "",
        version: "1.0",
        countries: ["XX", "IT", "IT"],
        docsUrl: "http://example.com",
        maintainers: [{ name: "", github: "not a handle!" }],
        locales: ["EN", "it", "it"],
        documentLocale: "fr",
        disclaimer: { key: "" },
      },
    };
    const found = failures(broken, "meta.identity").join("\n");
    for (const pattern of [
      /id "X"/,
      /not semver/,
      /differs from package\.json/,
      /name is empty/,
      /description is empty/,
      /XX are not assigned/,
      /countries has duplicates/,
      /not an https URL/,
      /a maintainer has no name/,
      /not a GitHub handle/,
      /must include "en"/,
      /locales has duplicates/,
      /"EN" is not a canonical/,
      /documentLocale "fr"/,
      /disclaimer: key is empty/,
    ]) {
      expect(found).toMatch(pattern);
    }
    expectFailure(
      { ...testPack, meta: { ...testPack.meta, countries: [], maintainers: [] } },
      "meta.identity",
      /countries is empty[\s\S]*at least one maintainer/,
    );
    expectFailure(
      { ...testPack, meta: { ...testPack.meta, locales: ["en", "not a locale!"] } },
      "meta.identity",
      /not a canonical/,
    );
  });

  it("meta.disclaimer needs the meta keys in every locale", () => {
    expectFailure(
      withMessages((catalogs) => delete catalogs.it!["meta.name"]),
      "meta.disclaimer",
      /"meta\.name" is missing in "it"/,
    );
    expectFailure(
      { ...testPack, meta: { ...testPack.meta, locales: ["en", "it", "fr"] } },
      "meta.disclaimer",
      /missing in "fr"/,
    );
    expectFailure(
      { ...testPack, meta: { ...testPack.meta, disclaimer: message("nope") } },
      "meta.disclaimer",
      /does not format/,
    );
  });
});

describe("message checks", () => {
  it("messages.complete catches a missing it key and other catalog problems", () => {
    expectFailure(
      withMessages((catalogs) => delete catalogs.it!["xx.tax.label"]),
      "messages.complete",
      /"it" is missing "xx\.tax\.label"/,
    );
    expectFailure(
      withMessages((catalogs) => (catalogs.it!["xx.extra"] = "x")),
      "messages.complete",
      /"it" has "xx\.extra"/,
    );
    expectFailure(
      withMessages((catalogs) => (catalogs.en!["core.total"] = "x")),
      "messages.complete",
      /reserved key "core\.total"/,
    );
    expectFailure(
      withMessages((catalogs) => (catalogs.de = { ...catalogs.en })),
      "messages.complete",
      /"de" is not listed/,
    );
    expectFailure(
      withMessages((catalogs) => ((catalogs.it as Record<string, unknown>)["meta.name"] = 1)),
      "messages.complete",
      /is not a string/,
    );
    expectFailure(
      { ...testPack, meta: { ...testPack.meta, locales: ["en", "it", "fr"] } },
      "messages.complete",
      /"fr" has no catalog/,
    );
    expectFailure(
      { ...testPack, messages: { it: xxMessages.it } },
      "messages.complete",
      /"en" catalog is missing/,
    );
  });

  it("messages.syntax catches malformed messages and placeholder mismatches", () => {
    expectFailure(
      withMessages((catalogs) => (catalogs.it!["xx.tax.label"] = "Imposta {")),
      "messages.syntax",
      /"it" "xx\.tax\.label"/,
    );
    expectFailure(
      withMessages((catalogs) => (catalogs.it!["xx.group.taxable"] = "Imposta {aliquota}")),
      "messages.syntax",
      /uses \{aliquota\} but "en" uses \{rate\}/,
    );
    expectFailure(
      withMessages((catalogs) => (catalogs.en!["xx.tax.label"] = "Tax }")),
      "messages.syntax",
      /"en" "xx\.tax\.label"/,
    );
  });
});

describe("configuration checks", () => {
  it("config.valid and config.invalid need entries and check them", () => {
    expectFailure(testPack, "config.valid", /at least one/, { validConfigs: [] });
    expectFailure(testPack, "config.valid", /validConfigs\[1\] is rejected: taxScope/, {
      validConfigs: [{}, { taxScope: 1 }],
    });
    expectFailure(testPack, "config.invalid", /at least one/, { invalidConfigs: [] });
    expectFailure(testPack, "config.invalid", /\(looks fine\) is accepted/, {
      invalidConfigs: [{ config: {}, reason: "looks fine" }],
    });
  });

  it("config.idempotent catches transforms, non-JSON output and JSON-fragile schemas", () => {
    const counting = {
      ...testPack,
      configSchema: z.strictObject({ count: z.number().transform((value) => value + 1) }),
    };
    expectFailure(counting, "config.idempotent", /parse\(parse\(x\)\) differs/, {
      validConfigs: [{ count: 1 }],
    });
    const dates = {
      ...testPack,
      configSchema: z.strictObject({ since: z.string().transform((value) => new Date(value)) }),
    };
    expectFailure(dates, "config.idempotent", /not plain JSON/, {
      validConfigs: [{ since: "2020-01-01" }],
    });
    const frozenOnly = {
      ...testPack,
      configSchema: z.custom(
        (value) => typeof value === "object" && value !== null && Object.isFrozen(value),
      ),
    };
    expectFailure(frozenOnly, "config.idempotent", /JSON round trip/, {
      validConfigs: [Object.freeze({})],
    });
  });

  it("config.json-schema needs representable schemas", () => {
    expectFailure(
      { ...testPack, configSchema: z.object({ n: z.bigint() }) },
      "config.json-schema",
      /configSchema/,
    );
    expectFailure(
      { ...testPack, invoiceOptionsSchema: z.string().transform((value) => value.length) },
      "config.json-schema",
      /invoiceOptionsSchema, \{ io: "output" \}/,
    );
  });
});

describe("parameter checks", () => {
  const [v1, v2] = xxParameters as [(typeof xxParameters)[number], (typeof xxParameters)[number]];

  it("parameters.timeline catches unsorted, duplicate and incomplete versions", () => {
    expectFailure(
      { ...testPack, parameters: [v2, v1] },
      "parameters.timeline",
      /effectiveFrom must be after/,
    );
    expectFailure(
      { ...testPack, parameters: [] },
      "parameters.timeline",
      /at least one parameter version/,
    );
    expectFailure(
      {
        ...testPack,
        parameters: [
          v1,
          { ...v2, id: v1.id, sources: [], changes: [" "], params: { ...v2.params } },
        ],
      },
      "parameters.timeline",
      /duplicate id[\s\S]*no sources[\s\S]*changes must list[\s\S]*not deeply frozen/,
    );
    expectFailure(
      { ...testPack, parameters: [{ ...v1, id: "", effectiveFrom: "2020-02-30" }] },
      "parameters.timeline",
      /empty id[\s\S]*not an ISO date/,
    );
  });

  it("parameters.resolution checks every boundary", () => {
    expectFailure(
      { ...testPack, parameters: [v2, v1] },
      "parameters.resolution",
      /resolves instead of throwing|the check threw/,
    );
    expectFailure(
      { ...testPack, parameters: [v1, { ...v2, effectiveFrom: v1.effectiveFrom }] },
      "parameters.resolution",
      /does not resolve on its first day[\s\S]*got ParameterNotFoundError/,
    );
    const sameDayAfter = [
      v1,
      { ...v2, effectiveFrom: isoDate("2020-01-02") },
      { ...v2, id: "xx-x", effectiveFrom: isoDate("2020-01-02") },
    ];
    expectFailure(
      { ...testPack, parameters: sameDayAfter },
      "parameters.resolution",
      /does not resolve/,
    );
    const fromEarliest = { ...v1, effectiveFrom: isoDate("1900-01-01") };
    expect(failures({ ...testPack, parameters: [fromEarliest] }, "parameters.resolution")).toEqual(
      [],
    );
  });
});

describe("rule checks", () => {
  const [first, ...others] = testPack.rules;

  it("rules.identity checks ids and titles", () => {
    expectFailure({ ...testPack, rules: [] }, "rules.identity", /at least one rule/);
    expectFailure(
      {
        ...testPack,
        rules: [
          first,
          first,
          { ...first!, id: "yy.Rule" },
          { ...first!, id: "xx.other", title: message("xx.missing") },
          { ...first!, id: "xx.bad", title: { key: "" } },
        ],
      },
      "rules.identity",
      /duplicate rule id[\s\S]*does not match[\s\S]*does not start with "xx\."[\s\S]*"xx\.missing" is missing[\s\S]*title: key is empty/,
    );
  });

  it("rules.sources requires well-formed sources on rules and parameter versions", () => {
    expectFailure(
      { ...testPack, rules: [{ ...first!, sources: [] }, ...others] },
      "rules.sources",
      /rule "xx\.classify-lines": at least one source/,
    );
    expectFailure(
      {
        ...testPack,
        rules: [{ ...first!, sources: [{ ...miniSource, url: "ftp://x" }] }, ...others],
      },
      "rules.sources",
      /url is not an https URL/,
    );
    expectFailure(
      {
        ...testPack,
        rules: [{ ...first!, sources: [{ ...miniSource, id: "xx.tax-act.art-1" }] }, ...others],
      },
      "rules.sources",
      /used for different sources/,
    );
    expectFailure(
      { ...testPack, parameters: [{ ...xxParameters[0]!, sources: [] }] },
      "rules.sources",
      /parameters "xx-2020-01-01": at least one source/,
    );
  });

  it("rounding.policy validates the policy for every valid configuration", () => {
    expectFailure(
      { ...testPack, roundingPolicy: () => ({ step: "minor-unit" }) },
      "rounding.policy",
      /lines is missing/,
    );
    const policy = testPack.roundingPolicy(testPack.configSchema.parse({}));
    expectFailure(
      { ...testPack, roundingPolicy: () => ({ ...policy, description: message("xx.nope") }) },
      "rounding.policy",
      /does not format in "en"/,
    );
    expectFailure(testPack, "rounding.policy", /no valid configuration/, {
      validConfigs: [{ taxScope: 1 }],
    });
  });
});

describe("fixture checks", () => {
  const dir = mkdtempSync(join(tmpdir(), "tax-core-fixtures-"));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const fixture = (overrides: Partial<GoldenFixture> = {}): GoldenFixture => ({
    name: "case",
    description: "case",
    pack: "xx",
    sources: [{ title: "T", citation: "C" }],
    config: {},
    input: sampleInputs[0],
    expected: { componentsExhaustive: true, total: "1336.00" },
    ...overrides,
  });

  it("fixtures.schema reads files and validates them", () => {
    writeFileSync(join(dir, "good.json"), JSON.stringify(fixture({ name: "good" })));
    writeFileSync(
      join(dir, "renamed.json"),
      JSON.stringify(fixture({ name: "other", pack: "yy" })),
    );
    writeFileSync(join(dir, "broken.json"), "{ not json");
    writeFileSync(join(dir, "invalid.json"), JSON.stringify({ name: "invalid" }));
    writeFileSync(join(dir, "ignored.txt"), "not a fixture");
    const found = failures(testPack, "fixtures.schema", { fixturesDir: dir }).join("\n");
    expect(found).toMatch(/broken\.json: not valid JSON/);
    expect(found).toMatch(/invalid\.json: description/);
    expect(found).toMatch(/renamed\.json: name "other" differs from the file name/);
    expect(found).toMatch(/renamed\.json: pack "yy" is not "xx"/);
    expect(found).not.toMatch(/good\.json/);
    expectFailure(testPack, "fixtures.schema", /cannot read fixturesDir/, {
      fixturesDir: join(dir, "missing"),
    });
    const { fixturesDir: _ignored, ...rest } = options;
    expect(
      runConformanceCheck(testPack, { ...rest, fixtures: [] }, "fixtures.schema").failures,
    ).toEqual(["at least one golden fixture is required"]);
  });

  it.each<[string, GoldenFixture, RegExp]>([
    [
      "a wrong total",
      fixture({ expected: { componentsExhaustive: true, total: "1.00" } }),
      /total: expected 1\.00, got 1336\.00/,
    ],
    [
      "a wrong parameter version",
      fixture({ expected: { componentsExhaustive: true, parameters: "xx-2024-01-01" } }),
      /parameters: expected "xx-2024-01-01"/,
    ],
    [
      "missing and wrong lines",
      fixture({
        expected: {
          componentsExhaustive: true,
          lines: [
            { id: "l9", net: "1.00" },
            { id: "l1", net: "1.00", groupId: "x" },
          ],
        },
      }),
      /line "l9" is missing[\s\S]*line "l1" net[\s\S]*groupId/,
    ],
    [
      "exhaustive component ids",
      fixture({
        expected: { componentsExhaustive: true, components: [{ id: "xx.tax", amount: "220.00" }] },
      }),
      /component ids/,
    ],
    [
      "component details",
      fixture({
        expected: {
          componentsExhaustive: false,
          components: [
            {
              id: "xx.tax",
              kind: "contribution",
              effect: "informational",
              base: "1.00",
              rate: "22",
              amount: "1.00",
              allocations: [],
              exportCodes: { a: "b" },
            },
            { id: "xx.withholding", rate: "11", amount: "110.00" },
            { id: "xx.ghost", amount: "0.00" },
          ],
        },
      }),
      /kind[\s\S]*effect[\s\S]*base[\s\S]*expected rate 22[\s\S]*amount[\s\S]*allocations[\s\S]*exportCodes[\s\S]*expected rate 11[\s\S]*"xx\.ghost" is missing/,
    ],
    [
      "a rate on a component without one",
      fixture({
        expected: {
          componentsExhaustive: false,
          components: [{ id: "xx.fixed-charge", rate: "1", amount: "0.00" }],
        },
      }),
      /xx\.fixed-charge" is missing/,
    ],
    [
      "the tax summary",
      fixture({
        expected: {
          componentsExhaustive: true,
          vatSummary: [
            { groupId: "vat-20", treatment: "exempt", rate: "10", base: "0.00", tax: "0.00" },
            { groupId: "nope", base: "0.00", tax: "0.00" },
          ],
        },
      }),
      /vatSummary groups[\s\S]*treatment[\s\S]*expected rate 10[\s\S]*base[\s\S]*tax/,
    ],
    [
      "notes, warnings and the trace",
      fixture({
        expected: {
          componentsExhaustive: true,
          legalNotes: [],
          warnings: ["w"],
          traceRuleIds: ["core"],
        },
      }),
      /legalNotes[\s\S]*warnings[\s\S]*traceRuleIds/,
    ],
    [
      "an expected error that does not happen",
      fixture({ expected: undefined, expectedError: { code: "invalid-input" } }),
      /but it computed/,
    ],
    [
      "a different error",
      fixture({
        config: { taxScope: 1 },
        expected: undefined,
        expectedError: { code: "invalid-input" },
      }),
      /expected "invalid-input", got InvalidConfigError/,
    ],
    [
      "different issue codes",
      fixture({
        config: { taxScope: 1 },
        expected: undefined,
        expectedError: { code: "invalid-config", issueCodes: ["x"] },
      }),
      /expected issue codes \["x"\]/,
    ],
    [
      "an unexpected error",
      fixture({ config: { taxScope: 1 } }),
      /unexpected error: InvalidConfigError/,
    ],
  ])("fixtures.golden reports %s", (_label, golden, pattern) => {
    const { fixturesDir: _ignored, ...rest } = options;
    const found = runConformanceCheck(
      testPack,
      { ...rest, fixtures: [golden] },
      "fixtures.golden",
    ).failures;
    expect(found.join("\n")).toMatch(pattern);
  });

  it("fixtures.golden reports errors that are not engine errors", () => {
    const throwing = {
      ...testPack,
      validateInput: () => {
        throw new TypeError("pack bug");
      },
    };
    const { fixturesDir: _ignored, ...rest } = options;
    const golden = fixture({ expected: undefined, expectedError: { code: "unsupported-input" } });
    const found = runConformanceCheck(
      anyPack(throwing),
      { ...rest, fixtures: [golden] },
      "fixtures.golden",
    ).failures;
    expect(found).toEqual(['fixtures[0]: expected "unsupported-input", got TypeError: pack bug']);
    expect(
      runConformanceCheck(
        testPack,
        { ...rest, fixtures: [{ name: "bad" } as unknown as GoldenFixture] },
        "fixtures.golden",
      ).failures,
    ).toEqual([]);
  });

  it("samples.compute needs valid samples that compute", () => {
    expectFailure(testPack, "samples.compute", /at least one input/, { sampleInputs: [] });
    expectFailure(testPack, "samples.compute", /sampleInputs\[0\] is invalid/, {
      sampleInputs: [{ ...sampleInputs[0]!, currency: "EURO" }],
    });
    const throwing = {
      ...testPack,
      rules: [
        ...testPack.rules,
        {
          ...testPack.rules[0]!,
          id: "xx.throw",
          apply: () => {
            throw new Error("rule bug");
          },
        },
      ],
    };
    expectFailure(throwing, "samples.compute", /RuleExecutionError/);
  });
});

/** A mini pack whose extra rule behaves badly in a way only a property can see. */
const withRule = (apply: Parameters<typeof miniRule>[0]): MiniPack => miniPack([miniRule(apply)]);

describe("property checks", () => {
  const miniOptions: Partial<ConformanceOptions> = {
    validConfigs: [{}],
    invoiceOptions: [{}],
    properties: { numRuns: 25 },
  };

  it("property.reconciliation reports pack errors with the seed and the input", () => {
    const fragile = withRule((state) => {
      if (state.lines.length > 1) throw new Error("two lines");
      return {};
    });
    expectFailure(
      fragile,
      "property.reconciliation",
      /RuleExecutionError[\s\S]*seed -?\d+[\s\S]*"lines"/,
      miniOptions,
    );
  });

  it("reports when every generated input is refused", () => {
    const refusing = miniPack([], {
      validateInput: () => [{ path: [], code: "mini.no", message: message("mini.label") }],
    });
    expectFailure(refusing, "property.reconciliation", /could not run: too many inputs refused/, {
      ...miniOptions,
      properties: { numRuns: 2 },
    });
  });

  it("needs a valid configuration", () => {
    expectFailure(testPack, "property.json", /no valid configuration/, { validConfigs: [] });
    expectFailure(testPack, "thresholds.contract", /no valid configuration/, { validConfigs: [] });
  });

  it("property.determinism catches hidden state", () => {
    let counter = 0;
    const counting = withRule(() => {
      counter += 1;
      return {
        legalNotes: [{ id: "n", message: message("mini.label", { n: p.text(`${counter}`) }) }],
      };
    });
    expectFailure(
      counting,
      "property.determinism",
      /two computations of the same input differ/,
      miniOptions,
    );
  });

  it("property.permutation catches order-dependent amounts", () => {
    const firstLine = withRule((state, ctx) => ({
      components: [
        {
          id: "first",
          kind: "other",
          label: message("mini.label"),
          effect: "informational",
          base: ctx.zero,
          amount: state.lines[0]?.net ?? ctx.zero,
        },
      ],
      trace: [{ message: message("mini.trace"), componentId: "first" }],
    }));
    expectFailure(firstLine, "property.permutation", /shuffling the lines changed/, {
      ...miniOptions,
      properties: { numRuns: 100 },
    });
  });

  it("property.rounding-bounds catches an amount that does not match its rate", () => {
    const wrongRate = withRule((state, ctx) => {
      const base = sum(
        state.lines.map((line) => line.net),
        ctx.currency,
      );
      const amount = percentage(base, decimal("20"), "halfUp");
      return {
        components: [
          {
            id: "c",
            kind: "contribution",
            label: message("mini.label"),
            effect: "adds-to-total",
            base,
            rate: decimal("10"),
            amount,
            allocations: [{ groupId: "std", base, amount }],
          },
        ],
        trace: [{ message: message("mini.trace"), componentId: "c" }],
      };
    });
    expectFailure(wrongRate, "property.rounding-bounds", /"c" std: \d+ is too far/, {
      ...miniOptions,
      properties: { numRuns: 100 },
    });
    const informational = withRule((_state, ctx) => ({
      components: [
        {
          id: "i",
          kind: "surcharge",
          label: message("mini.label"),
          effect: "informational",
          base: money(10000n, ctx.currency),
          rate: decimal("10"),
          amount: money(2000n, ctx.currency),
        },
      ],
      trace: [{ message: message("mini.trace"), componentId: "i" }],
    }));
    expectFailure(informational, "property.rounding-bounds", /"i" : 2000 is too far/, miniOptions);
  });

  it("property.trace formats every message in every locale", () => {
    // A key missing in "it" falls back to English (messages.complete reports it); a key missing
    // everywhere cannot be formatted.
    expect(
      failures(
        withMessages((catalogs) => delete catalogs.it!["xx.tax.label"]),
        "property.trace",
      ),
    ).toEqual([]);
    const missing = withMessages((catalogs) => {
      delete catalogs.it!["xx.tax.label"];
      delete catalogs.en!["xx.tax.label"];
    });
    expectFailure(missing, "property.trace", /in "en": MissingMessageError/);
  });

  it("thresholds.contract notes packs without the capability", () => {
    const result = runConformanceCheck(
      miniPack([]),
      { ...options, ...miniOptions } as ConformanceOptions,
      "thresholds.contract",
    );
    expect(result).toEqual({
      id: "thresholds.contract",
      ok: true,
      failures: [],
      notes: ["the pack has no annualThresholds capability"],
    });
  });

  it.each<[string, Partial<NonNullable<typeof testPack.capabilities.annualThresholds>>, RegExp]>([
    [
      "a status without receipts",
      {
        evaluate: (config, input) => ({
          ...testPack.capabilities.annualThresholds!.evaluate(config, input),
          status: "exceeded",
        }),
      },
      /no receipts gives "exceeded"/,
    ],
    [
      "a status that goes down",
      {
        evaluate: (config, input) => ({
          ...testPack.capabilities.annualThresholds!.evaluate(config, input),
          status: input.receipts.length % 2 === 1 ? "approaching" : "ok",
        }),
      },
      /lowered the status/,
    ],
    [
      "a not-applicable status that changes",
      {
        evaluate: (config, input) => ({
          ...testPack.capabilities.annualThresholds!.evaluate(config, input),
          status: input.receipts.length === 0 ? "not-applicable" : "ok",
        }),
      },
      /"not-applicable" became "ok"/,
    ],
    [
      "countable revenue above the total",
      { countableRevenue: (_config, c) => money(c.total.amount + 1n, c.currency) },
      /exceeds the total/,
    ],
    [
      "negative countable revenue",
      { countableRevenue: (_config, c) => money(-1n, c.currency) },
      /is negative/,
    ],
    [
      "countable revenue in another currency",
      { countableRevenue: () => money(0n, "CHF") },
      /not in the invoice currency/,
    ],
  ])("thresholds.contract catches %s", (_label, change, pattern) => {
    const pack = {
      ...testPack,
      capabilities: { annualThresholds: { ...testPack.capabilities.annualThresholds!, ...change } },
    };
    expectFailure(pack, "thresholds.contract", pattern, { properties: { numRuns: 30 } });
  });
});
