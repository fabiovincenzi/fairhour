/**
 * Rounding policy of the Exampleland pack: what is rounded, how and where. Every rounding in the
 * pack goes through `@fairhour/money` with the mode named here; totals are sums of rounded
 * amounts, so the invoice always reconciles.
 */
import type { RoundingMode } from "@fairhour/money";
import { message, type RoundingPolicy } from "@fairhour/tax-core";

// TEMPLATE: state your country's rule and its source in docs/tax-packs/<cc>.md ("Rounding
// policy"). Many laws say "to the cent" without saying where intermediate rounding happens: pick
// the conservative reading (usually half up, VAT once per rate) and say so in the docs. The
// policy may depend on the configuration (tax-pack-generic lets the user choose the mode).

/** Half up to the minor unit (Exampleland's fictional VAT Act, art. 5). */
export const XX_ROUNDING_MODE: RoundingMode = "halfUp";

export function roundingPolicy(): RoundingPolicy {
  return {
    // Always the currency's minor unit (cash rounding is out of the engine's scope).
    step: "minor-unit",
    // quantity × unit price -> the line total.
    lines: { mode: XX_ROUNDING_MODE },
    // Percentage contributions and surcharges (Exampleland has none), once per tax group.
    contributions: { mode: XX_ROUNDING_MODE, scope: "per-group" },
    // VAT once per rate, on the group's base ("per-line" would round every line, then add up).
    taxes: { mode: XX_ROUNDING_MODE, scope: "per-group" },
    // The withholding once, on the invoice's withholding base.
    withholdings: { mode: XX_ROUNDING_MODE, scope: "per-document" },
    description: message("xx.rounding.description"),
  };
}
