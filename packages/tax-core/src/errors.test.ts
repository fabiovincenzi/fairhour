import { describe, expect, it } from "vitest";
import {
  InvalidConfigError,
  InvalidInputError,
  InvalidIsoDateError,
  InvalidOptionsError,
  MessageFormatError,
  MissingMessageError,
  ParameterNotFoundError,
  ReconciliationError,
  RuleContractError,
  RuleExecutionError,
  TaxEngineError,
  UnsupportedInputError,
} from "./errors";
import { message } from "./messages/params";
import { isoDate } from "./primitives";

const issues = [
  { path: ["lines", 0, "quantity"], code: "out-of-range", message: "too big" },
  { path: [], code: "custom", message: "root" },
];

describe("errors", () => {
  it.each([
    [
      new InvalidInputError(issues),
      "invalid-input",
      "InvalidInputError",
      /out-of-range at lines\.0\.quantity; custom at \(root\)/,
    ],
    [new InvalidConfigError(issues), "invalid-config", "InvalidConfigError", /configuration/],
    [new InvalidOptionsError(issues), "invalid-options", "InvalidOptionsError", /options/],
    [
      new UnsupportedInputError([
        { path: ["currency"], code: "it.currency-not-eur", message: message("x") },
      ]),
      "unsupported-input",
      "UnsupportedInputError",
      /it\.currency-not-eur at currency/,
    ],
    [
      new ParameterNotFoundError("it", isoDate("2019-01-01"), isoDate("2020-01-01")),
      "parameters-not-found",
      "ParameterNotFoundError",
      /first version starts on 2020-01-01/,
    ],
    [
      new ParameterNotFoundError("it", isoDate("2019-01-01"), undefined),
      "parameters-not-found",
      "ParameterNotFoundError",
      /has no parameter versions/,
    ],
    [
      new RuleExecutionError("it.vat", new TypeError("boom")),
      "rule-failed",
      "RuleExecutionError",
      /TypeError: boom/,
    ],
    [
      new RuleExecutionError("it.vat", "a string"),
      "rule-failed",
      "RuleExecutionError",
      /non-Error value/,
    ],
    [
      new RuleContractError("it.vat", "invalid-group", "bad"),
      "rule-contract-violated",
      "RuleContractError",
      /\(invalid-group\): bad/,
    ],
    [
      new ReconciliationError("R4", "10.00 EUR", "11.00 EUR", "total"),
      "reconciliation-failed",
      "ReconciliationError",
      /R4 failed: total \(expected 10\.00 EUR, actual 11\.00 EUR\)/,
    ],
    [
      new MissingMessageError("x.y", "it"),
      "missing-message",
      "MissingMessageError",
      /"x\.y" is missing/,
    ],
    [
      new MessageFormatError("x.y", "bad"),
      "message-format",
      "MessageFormatError",
      /cannot be formatted: bad/,
    ],
    [
      new InvalidIsoDateError("2023-02-30"),
      "invalid-iso-date",
      "InvalidIsoDateError",
      /got "2023-02-30"/,
    ],
  ])("%s has its code, name and message", (error, code, name, text) => {
    expect(error).toBeInstanceOf(TaxEngineError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(name);
    expect(error.message).toMatch(text);
  });

  it("keeps structured fields", () => {
    const cause = new Error("inner");
    const failed = new RuleExecutionError("it.vat", cause);
    expect(failed.ruleId).toBe("it.vat");
    expect(failed.cause).toBe(cause);
    const contract = new RuleContractError("core", "unassigned-line", "l1");
    expect([contract.ruleId, contract.reason]).toEqual(["core", "unassigned-line"]);
    const reconciliation = new ReconciliationError("R1", "a", "b", "c");
    expect([reconciliation.check, reconciliation.expected, reconciliation.actual]).toEqual([
      "R1",
      "a",
      "b",
    ]);
    const missing = new ParameterNotFoundError("xx", isoDate("2019-01-01"), isoDate("2020-01-01"));
    expect([missing.packId, missing.date, missing.firstEffectiveFrom]).toEqual([
      "xx",
      "2019-01-01",
      "2020-01-01",
    ]);
    expect(new InvalidInputError(issues).issues).toBe(issues);
    expect(new MissingMessageError("k", "de").locale).toBe("de");
    expect(new MessageFormatError("k", "r").reason).toBe("r");
  });

  it("keeps only an excerpt of a rule's exception in its message (it may quote user data)", () => {
    const secret = `${"x".repeat(200)}SECRET-VAT-ID`;
    const failed = new RuleExecutionError("it.vat", new TypeError(secret));
    expect(failed.message).toBe(`Rule "it.vat" failed: TypeError: ${"x".repeat(200)}…`);
    expect(failed.message).not.toContain("SECRET");
    expect((failed.cause as Error).message).toBe(secret);
    const named = new Error("short");
    named.name = "N".repeat(100);
    expect(new RuleExecutionError("it.vat", named).message).toBe(
      `Rule "it.vat" failed: ${"N".repeat(64)}…: short`,
    );
  });

  it("names a failing pack hook instead of a rule", () => {
    const failed = new RuleExecutionError("core", new RangeError("x"), "The pack's roundingPolicy");
    expect(failed.message).toBe("The pack's roundingPolicy failed: RangeError: x");
    expect(failed.ruleId).toBe("core");
  });

  it("summarizes at most five issues", () => {
    const many = Array.from({ length: 7 }, (_, index) => ({
      path: [index],
      code: `c${index}`,
      message: "m",
    }));
    expect(new InvalidInputError(many).message).toMatch(/c4 at 4, and 2 more$/);
  });
});
