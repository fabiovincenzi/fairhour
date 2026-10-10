/**
 * Inputs the generic pack refuses (docs/tax-packs/generic.md, section 1, "Input checks"), reported
 * by the engine as an `UnsupportedInputError` with every issue.
 */
import { message, p, type InputIssue, type InvoiceInput } from "@fairhour/tax-core";
import { isRateAllowed, type GenericConfig } from "./config";

export function validateInput(input: InvoiceInput, config: GenericConfig): readonly InputIssue[] {
  const issues: InputIssue[] = [];
  input.lines.forEach((line, index) => {
    const { treatment } = line;
    if (treatment.kind !== "rate") return;
    const path = ["lines", index, "treatment", "rate"];
    const params = { line: p.text(line.description), rate: p.percent(treatment.rate) };
    if (config.tax.kind === "none") {
      issues.push({
        path,
        code: "generic.rate-without-tax",
        message: message("generic.issue.rate-without-tax", params),
      });
    } else if (!isRateAllowed(config.tax, treatment.rate)) {
      issues.push({
        path,
        code: "generic.rate-not-allowed",
        message: message("generic.issue.rate-not-allowed", {
          ...params,
          label: p.text(config.taxLabel),
        }),
      });
    }
  });
  return issues;
}
