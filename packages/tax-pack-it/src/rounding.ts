/**
 * Rounding policy of the Italian pack (docs/tax-packs/it.md, section 8): every amount is rounded
 * half up to the cent, once per legally relevant amount (line, contribution per group, VAT per
 * rate on the summary, withholding on the document); totals are sums of rounded amounts.
 */
import { message, type RoundingPolicy } from "@fairhour/tax-core";
import type { ItConfig } from "./config";
import { IT_ROUNDING_MODE } from "./types";

export function roundingPolicy(_config: ItConfig): RoundingPolicy {
  return {
    step: "minor-unit",
    lines: { mode: IT_ROUNDING_MODE },
    contributions: { mode: IT_ROUNDING_MODE, scope: "per-group" },
    taxes: { mode: IT_ROUNDING_MODE, scope: "per-group" },
    withholdings: { mode: IT_ROUNDING_MODE, scope: "per-document" },
    description: message("it.rounding.description"),
  };
}
