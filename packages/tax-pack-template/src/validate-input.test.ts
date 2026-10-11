/**
 * Table-driven tests of the pack's refusals. TEMPLATE: one row per issue code, plus the inputs
 * that look similar and must be accepted.
 */
import {
  computeInvoice,
  ParameterNotFoundError,
  UnsupportedInputError,
  type InputIssue,
} from "@fairhour/tax-core";
import { describe, expect, it } from "vitest";
import { format, invoice, line, type LineSpec } from "../test/helpers";
import { configSchema, type XxConfigInput } from "./config";
import { xxPack } from "./index";
import { validateInput } from "./validate-input";

const issuesOf = (
  config: XxConfigInput,
  lines: readonly LineSpec[],
  issueDate = "2026-03-16",
): readonly InputIssue[] =>
  validateInput(invoice(lines, { issueDate }), configSchema.parse(config));

const rate = (value: string): LineSpec => line("100", { kind: "rate", rate: value });

describe("validateInput", () => {
  it.each<[string, XxConfigInput, readonly LineSpec[], string, readonly [string, string][]]>([
    ["a rate of the issue date", {}, [rate("10")], "2026-03-16", []],
    ["the same rate written differently", {}, [rate("10.00"), rate("21")], "2026-03-16", []],
    ["a line without an explicit rate", {}, [line("100")], "2026-03-16", []],
    [
      "a rate that no longer exists",
      {},
      [rate("20")],
      "2026-03-16",
      [["xx.unknown-vat-rate", "lines.0.treatment.rate"]],
    ],
    ["the same rate while it existed", {}, [rate("20")], "2025-12-31", []],
    [
      "a rate that never existed, on the second line",
      {},
      [line("100"), rate("15")],
      "2026-03-16",
      [["xx.unknown-vat-rate", "lines.1.treatment.rate"]],
    ],
    [
      "any rate under the small-business exemption",
      { vatRegistered: false },
      [rate("10"), line("5"), rate("21")],
      "2026-03-16",
      [
        ["xx.rate-without-vat", "lines.0.treatment"],
        ["xx.rate-without-vat", "lines.2.treatment"],
      ],
    ],
    // Before the first version there are no rates to compare with: the engine then throws
    // ParameterNotFoundError, and the hook must not throw first.
    ["an invoice before the first parameter version", {}, [rate("99")], "2023-12-31", []],
  ])("%s", (_name, config, lines, issueDate, expected) => {
    expect(
      issuesOf(config, lines, issueDate).map((issue) => [issue.code, issue.path.join(".")]),
    ).toEqual(expected);
  });

  it("explains each refusal, quoting the line as plain text", () => {
    const [unknown] = issuesOf({}, [line("100", { kind: "rate", rate: "20" })]);
    expect(unknown && format(unknown.message)).toBe(
      "Line “Consulting”: 20% is not an Exampleland VAT rate on the issue date (standard 21%, reduced 10%)",
    );
    const [withoutVat] = issuesOf({ vatRegistered: false }, [
      line("100", { kind: "rate", rate: "10" }, { description: "Translation {draft}" }),
    ]);
    expect(withoutVat && format(withoutVat.message)).toBe(
      "Line “Translation {draft}”: a VAT rate (10%) cannot be used under the small-business exemption",
    );
  });

  it("makes the engine throw UnsupportedInputError with every issue", () => {
    const input = invoice([rate("20"), rate("5")]);
    expect(() => computeInvoice(xxPack, {}, input)).toThrow(UnsupportedInputError);
    try {
      computeInvoice(xxPack, {}, input);
    } catch (error) {
      expect(error instanceof UnsupportedInputError && error.issues.map((i) => i.code)).toEqual([
        "xx.unknown-vat-rate",
        "xx.unknown-vat-rate",
      ]);
    }
  });

  it("leaves dates before the first parameter version to the engine", () => {
    const input = invoice([rate("99")], { issueDate: "2023-12-31" });
    expect(() => computeInvoice(xxPack, {}, input)).toThrow(ParameterNotFoundError);
  });
});
