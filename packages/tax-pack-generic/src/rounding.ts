/**
 * Rounding policy of the generic pack (docs/tax-packs/generic.md, section 3): one configured
 * mode for line totals, the tax and the withholding, always to the currency's minor unit; the tax
 * rounded once per rate on the document (the engine's "per-group" scope) or on every line.
 */
import type { RoundingMode } from "@fairhour/money";
import { message, p, type MessageKey, type RoundingPolicy } from "@fairhour/tax-core";
import type { GenericConfig, TaxScope } from "./config";

const MODE_KEYS: Readonly<Record<RoundingMode, MessageKey>> = {
  halfUp: "generic.rounding.mode.half-up",
  halfEven: "generic.rounding.mode.half-even",
  halfDown: "generic.rounding.mode.half-down",
  up: "generic.rounding.mode.up",
  down: "generic.rounding.mode.down",
  ceiling: "generic.rounding.mode.ceiling",
  floor: "generic.rounding.mode.floor",
};

const SCOPE_KEYS: Readonly<Record<TaxScope, MessageKey>> = {
  "per-document": "generic.rounding.scope.per-document",
  "per-line": "generic.rounding.scope.per-line",
};

export function roundingPolicy(config: GenericConfig): RoundingPolicy {
  const { mode, taxScope } = config.rounding;
  const modeText = p.message(message(MODE_KEYS[mode]));
  return {
    step: "minor-unit",
    lines: { mode },
    // The pack has no contributions; the engine's policy still needs the entry.
    contributions: { mode, scope: "per-group" },
    taxes: { mode, scope: taxScope === "per-line" ? "per-line" : "per-group" },
    withholdings: { mode, scope: "per-document" },
    description:
      config.tax.kind === "none"
        ? message("generic.rounding.description-no-tax", { mode: modeText })
        : message("generic.rounding.description", {
            label: p.text(config.taxLabel),
            mode: modeText,
            scope: p.message(message(SCOPE_KEYS[taxScope])),
          }),
  };
}
