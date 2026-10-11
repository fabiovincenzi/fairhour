/**
 * Inputs the Exampleland pack refuses: the engine reports them as an `UnsupportedInputError` with
 * every issue, before any rule runs. A pack refuses what it does not model instead of computing
 * a wrong figure.
 *
 * The hook runs after schema validation and before the engine resolves the parameters, so it looks
 * them up itself and skips the rate check before the first version (the engine then throws
 * `ParameterNotFoundError`). It must never throw: an exception is reported as a pack bug.
 */
import { decimalEquals } from "@fairhour/money";
import { message, p, type InputIssue, type InvoiceInput } from "@fairhour/tax-core";
import type { XxConfig } from "./config";
import { findParameters, vatRates } from "./parameters";

// TEMPLATE: list what your pack does not support (currencies other than the one of its monetary
// parameters, line treatments a regime forbids, option combinations the law excludes), with a
// localizable message per issue code ("<cc>.<what>"), and document each code.

export function validateInput(input: InvoiceInput, config: XxConfig): readonly InputIssue[] {
  const params = findParameters(input.issueDate)?.params;
  const issues: InputIssue[] = [];
  input.lines.forEach((line, index) => {
    const { treatment } = line;
    if (treatment.kind !== "rate") return;
    const texts = { line: p.text(line.description), rate: p.percent(treatment.rate) };
    if (!config.vatRegistered) {
      issues.push({
        path: ["lines", index, "treatment"],
        code: "xx.rate-without-vat",
        message: message("xx.issue.rate-without-vat", texts),
      });
    } else if (
      params !== undefined &&
      !vatRates(params).some((rate) => decimalEquals(rate, treatment.rate))
    ) {
      issues.push({
        path: ["lines", index, "treatment", "rate"],
        code: "xx.unknown-vat-rate",
        message: message("xx.issue.unknown-vat-rate", {
          ...texts,
          standard: p.percent(params.vat.standardRate),
          reduced: p.percent(params.vat.reducedRate),
        }),
      });
    }
  });
  return issues;
}
