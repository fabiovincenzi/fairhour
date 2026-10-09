import { add, subtract, zero, type CurrencyCode, type Money } from "@fairhour/money";
import type { TaxSummaryEntry } from "../computation/types";
import { ownValue } from "../internal/records";
import type { ComputationState } from "../pack/rule";
import type { PackFacts } from "../pack/types";

export interface DerivedTotals {
  readonly vatSummary: readonly TaxSummaryEntry[];
  readonly taxableBase: Money;
  readonly taxTotal: Money;
  readonly total: Money;
  readonly withholdingTotal: Money;
  /** Σ deducted-from-payable amounts, and whether any such component exists. */
  readonly deductions: Money;
  readonly hasDeductions: boolean;
  /** May be negative when a pack deducts more than the total; reconciliation rejects that. */
  readonly netPayable: Money;
}

/** Tax summary and totals (design 4.8), derived from the merged state only. */
export function deriveTotals<F extends PackFacts>(
  state: ComputationState<F>,
  subtotal: Money,
  currency: CurrencyCode,
): DerivedTotals {
  const vatSummary: TaxSummaryEntry[] = [];
  let taxableBase = zero(currency);
  for (const group of state.groups) {
    let base = zero(currency);
    let tax = zero(currency);
    let used = false;
    for (const line of state.lines) {
      if (ownValue(state.lineGroups, line.id) !== group.id) continue;
      used = true;
      base = add(base, line.net);
      if (group.treatment !== "excluded") taxableBase = add(taxableBase, line.net);
    }
    for (const component of state.components) {
      for (const allocation of component.allocations) {
        if (allocation.groupId !== group.id) continue;
        used = true;
        if (component.kind === "tax") {
          tax = add(tax, allocation.amount);
        } else {
          base = add(base, allocation.amount);
          if (
            group.treatment !== "excluded" &&
            (component.kind === "contribution" || component.kind === "surcharge")
          ) {
            taxableBase = add(taxableBase, allocation.amount);
          }
        }
      }
    }
    if (!used) continue;
    vatSummary.push({
      groupId: group.id,
      treatment: group.treatment,
      ...(group.rate === undefined ? {} : { rate: group.rate }),
      label: group.label,
      ...(group.reference === undefined ? {} : { reference: group.reference }),
      base,
      tax,
      ...(group.exportCodes === undefined ? {} : { exportCodes: group.exportCodes }),
    });
  }

  let taxTotal = zero(currency);
  let addsToTotal = zero(currency);
  let withholdingTotal = zero(currency);
  let deductions = zero(currency);
  let hasDeductions = false;
  for (const component of state.components) {
    switch (component.effect) {
      case "adds-to-total":
        addsToTotal = add(addsToTotal, component.amount);
        if (component.kind === "tax") taxTotal = add(taxTotal, component.amount);
        break;
      case "deducted-from-payable":
        deductions = add(deductions, component.amount);
        hasDeductions = true;
        break;
      case "informational":
        break;
    }
    if (component.kind === "withholding")
      withholdingTotal = add(withholdingTotal, component.amount);
  }
  const total = add(subtotal, addsToTotal);
  return {
    vatSummary,
    taxableBase,
    taxTotal,
    total,
    withholdingTotal,
    deductions,
    hasDeductions,
    netPayable: subtract(total, deductions),
  };
}
