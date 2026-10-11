/**
 * Inputs the Italian pack refuses (`UnsupportedInputError`, docs/tax-packs/it.md, section 5).
 * Runs after schema validation and before the engine resolves the parameters, so it looks the
 * parameters up itself and skips the rate check before the first version (the engine then
 * throws `ParameterNotFoundError`).
 */
import { decimalEquals, decimalToString, extend } from "@fairhour/money";
import { message, p, type InputIssue, type InvoiceInput } from "@fairhour/tax-core";
import type { ItConfig } from "./config";
import type { ItOptions } from "./options";
import { findParameters } from "./parameters";
import { IT_ROUNDING_MODE, isFeeInputLine, withholdingEnabledFor } from "./types";

/**
 * True when it.ordinario.withholding will withhold: the structural condition and at least one
 * fee line with a positive total (the line totals use the pack's rounding).
 */
export function withholdingWouldApply(config: ItConfig, input: InvoiceInput): boolean {
  return (
    withholdingEnabledFor(config, input.client) &&
    input.lines.some(
      (line) =>
        isFeeInputLine(line.kind, line.treatment) &&
        extend(line.unitPrice, line.quantity, IT_ROUNDING_MODE).amount > 0n,
    )
  );
}

export function validateInput(
  input: InvoiceInput,
  config: ItConfig,
  options: ItOptions,
): readonly InputIssue[] {
  const issues: InputIssue[] = [];
  if (input.currency !== "EUR") {
    issues.push({
      path: ["currency"],
      code: "it.currency-not-eur",
      message: message("it.issue.currency-not-eur", { currency: p.text(input.currency) }),
    });
  }
  const allowed = findParameters(input.issueDate)?.params.vat.allowedRates;
  input.lines.forEach((line, index) => {
    const { treatment } = line;
    if (treatment.kind !== "rate") return;
    const rate = p.percent(treatment.rate);
    if (config.regime === "forfettario") {
      issues.push({
        path: ["lines", index, "treatment"],
        code: "it.forfettario.rate-not-allowed",
        message: message("it.issue.forfettario.rate-not-allowed", { rate }),
      });
    } else if (
      allowed !== undefined &&
      !allowed.some((candidate) => decimalEquals(candidate, treatment.rate))
    ) {
      issues.push({
        path: ["lines", index, "treatment", "rate"],
        code: "it.ordinario.unknown-vat-rate",
        message: message("it.issue.ordinario.unknown-vat-rate", {
          rate,
          allowed: p.text(allowed.map(decimalToString).join(", ")),
        }),
      });
    }
  });
  if (options.splitPayment === "apply" && withholdingWouldApply(config, input)) {
    issues.push({
      path: ["options", "splitPayment"],
      code: "it.split-payment.withholding-conflict",
      message: message("it.issue.split-payment.withholding-conflict"),
    });
  }
  return issues;
}
