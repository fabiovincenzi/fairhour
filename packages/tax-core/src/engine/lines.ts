import { extend, sum, type CurrencyCode, type Money, type RoundingMode } from "@fairhour/money";
import type { TraceStep } from "../computation/types";
import type { InvoiceInput } from "../input/types";
import { message, p } from "../messages/params";
import type { MessageRef } from "../messages/types";
import type { NetLine } from "../pack/rule";
import { deepFreeze } from "./freeze";

/** Line totals: `extend(unitPrice, quantity, mode)`, the only rounding of a line. */
export function computeNetLines(input: InvoiceInput, mode: RoundingMode): readonly NetLine[] {
  return deepFreeze(
    input.lines.map((line): NetLine => ({
      id: line.id,
      kind: line.kind,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      treatment: line.treatment,
      net: extend(line.unitPrice, line.quantity, mode),
    })),
  );
}

export function coreStep(step: number, text: MessageRef, amount?: Money): TraceStep {
  return {
    step,
    ruleId: "core",
    message: text,
    ...(amount === undefined ? {} : { amount }),
    sources: [],
  };
}

/** One `core.line` step per line, then `core.subtotal`. */
export function lineSteps(
  lines: readonly NetLine[],
  currency: CurrencyCode,
): { readonly steps: readonly TraceStep[]; readonly subtotal: Money } {
  const steps = lines.map((line, index) =>
    coreStep(
      index + 1,
      message("core.line", {
        description: p.text(line.description),
        quantity: p.decimal(line.quantity),
        unitPrice: p.price(line.unitPrice),
        amount: p.money(line.net),
      }),
      line.net,
    ),
  );
  const subtotal = sum(
    lines.map((line) => line.net),
    currency,
  );
  steps.push(
    coreStep(steps.length + 1, message("core.subtotal", { amount: p.money(subtotal) }), subtotal),
  );
  return { steps, subtotal };
}
