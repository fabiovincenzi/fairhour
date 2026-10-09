import {
  add,
  equals,
  greaterThan,
  isMoney,
  isPrice,
  subtract,
  sum,
  toDecimalString,
  zero,
  type CurrencyCode,
  type Money,
} from "@fairhour/money";
import type { InvoiceComputation, TaxSummaryEntry } from "../computation/types";
import { ReconciliationError } from "../errors";
import { isPlainObject } from "../internal/records";
import type { MessageRef } from "../messages/types";

export type ReconciliationCheck = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8";

export interface ReconciliationFailure {
  readonly check: ReconciliationCheck;
  readonly expected: string;
  readonly actual: string;
  readonly detail: string;
}

function show(value: Money): string {
  return `${toDecimalString(value)} ${value.currency}`;
}

/** R7: every Money (message parameters included) is in the invoice currency and ≥ 0. */
function moneyFailures(c: InvoiceComputation): readonly ReconciliationFailure[] {
  const failures: ReconciliationFailure[] = [];
  const checkMoney = (value: unknown, where: string): void => {
    if (!isMoney(value)) {
      failures.push({
        check: "R7",
        expected: `Money in ${c.currency}`,
        actual: "not a Money",
        detail: where,
      });
    } else if (value.currency !== c.currency || value.amount < 0n) {
      failures.push({
        check: "R7",
        expected: `an amount ≥ 0 in ${c.currency}`,
        actual: show(value),
        detail: where,
      });
    }
  };
  const checkMessage = (ref: MessageRef | undefined, where: string): void => {
    if (ref?.params === undefined) return;
    for (const [name, param] of Object.entries(ref.params)) {
      const at = `${where} parameter "${name}"`;
      if (!isPlainObject(param)) continue;
      if (param.type === "money") checkMoney(param.value, at);
      if (param.type === "price" && isPrice(param.value) && param.value.currency !== c.currency) {
        failures.push({
          check: "R7",
          expected: `a price in ${c.currency}`,
          actual: param.value.currency,
          detail: at,
        });
      }
      if (param.type === "message") checkMessage(param.value, at);
    }
  };
  c.lines.forEach((line, index) => {
    checkMoney(line.net, `lines[${index}].net`);
    if (line.unitPrice.currency !== c.currency) {
      failures.push({
        check: "R7",
        expected: `a unit price in ${c.currency}`,
        actual: line.unitPrice.currency,
        detail: `lines[${index}].unitPrice`,
      });
    }
  });
  checkMoney(c.subtotal, "subtotal");
  c.components.forEach((component, index) => {
    const at = `components[${index}] "${component.id}"`;
    checkMoney(component.base, `${at}.base`);
    checkMoney(component.amount, `${at}.amount`);
    checkMessage(component.label, `${at}.label`);
    component.allocations.forEach((allocation, j) => {
      checkMoney(allocation.base, `${at}.allocations[${j}].base`);
      checkMoney(allocation.amount, `${at}.allocations[${j}].amount`);
    });
  });
  c.vatSummary.forEach((entry, index) => {
    checkMoney(entry.base, `vatSummary[${index}].base`);
    checkMoney(entry.tax, `vatSummary[${index}].tax`);
    checkMessage(entry.label, `vatSummary[${index}].label`);
    checkMessage(entry.reference, `vatSummary[${index}].reference`);
  });
  checkMoney(c.taxableBase, "taxableBase");
  checkMoney(c.taxTotal, "taxTotal");
  checkMoney(c.total, "total");
  checkMoney(c.withholdingTotal, "withholdingTotal");
  checkMoney(c.netPayable, "netPayable");
  c.legalNotes.forEach((note, index) => {
    checkMessage(note.message, `legalNotes[${index}]`);
  });
  c.warnings.forEach((warning, index) => {
    checkMessage(warning.message, `warnings[${index}]`);
  });
  c.trace.forEach((step, index) => {
    if (step.amount !== undefined) checkMoney(step.amount, `trace[${index}].amount`);
    checkMessage(step.message, `trace[${index}].message`);
    checkMessage(step.formula, `trace[${index}].formula`);
  });
  return failures;
}

function compareAmounts(
  failures: ReconciliationFailure[],
  check: ReconciliationCheck,
  expected: Money,
  actual: Money,
  detail: string,
): void {
  if (!equals(expected, actual))
    failures.push({ check, expected: show(expected), actual: show(actual), detail });
}

/**
 * Re-checks the reconciliation identities R1 to R8 of design 4.8 from the computation alone
 * (no pack, no state). Returns every failure; R7 failures are returned alone, because the other
 * identities cannot be evaluated on amounts in the wrong currency.
 */
export function reconciliationFailures(c: InvoiceComputation): readonly ReconciliationFailure[] {
  const r7 = moneyFailures(c);
  if (r7.length > 0) return r7;
  const currency: CurrencyCode = c.currency;
  const failures: ReconciliationFailure[] = [];

  // R1: subtotal = Σ lines.net
  compareAmounts(
    failures,
    "R1",
    sum(
      c.lines.map((line) => line.net),
      currency,
    ),
    c.subtotal,
    "subtotal = Σ lines.net",
  );

  // R6: every line is in exactly one group that has a summary row; summary rows are unique.
  const entries = new Map<string, TaxSummaryEntry>();
  for (const entry of c.vatSummary) {
    if (entries.has(entry.groupId)) {
      failures.push({
        check: "R6",
        expected: "one summary row per group",
        actual: "duplicate",
        detail: entry.groupId,
      });
    }
    entries.set(entry.groupId, entry);
  }
  for (const line of c.lines) {
    if (!entries.has(line.groupId)) {
      failures.push({
        check: "R6",
        expected: "a group with a summary row",
        actual: line.groupId,
        detail: `line "${line.id}"`,
      });
    }
  }

  // R2: base(g) = lines + non-tax allocations; tax(g) = tax allocations.
  const derived = new Map<string, { base: Money; tax: Money }>();
  const slot = (groupId: string): { base: Money; tax: Money } => {
    let found = derived.get(groupId);
    if (found === undefined) {
      found = { base: zero(currency), tax: zero(currency) };
      derived.set(groupId, found);
    }
    return found;
  };
  for (const line of c.lines) {
    const target = slot(line.groupId);
    target.base = add(target.base, line.net);
  }
  for (const component of c.components) {
    if (component.effect !== "adds-to-total") continue;
    for (const allocation of component.allocations) {
      const target = slot(allocation.groupId);
      if (component.kind === "tax") target.tax = add(target.tax, allocation.amount);
      else target.base = add(target.base, allocation.amount);
    }
  }
  for (const [groupId, amounts] of derived) {
    const entry = entries.get(groupId);
    if (entry === undefined) {
      failures.push({
        check: "R2",
        expected: "a summary row",
        actual: "none",
        detail: `group "${groupId}"`,
      });
      continue;
    }
    compareAmounts(failures, "R2", amounts.base, entry.base, `base of group "${groupId}"`);
    compareAmounts(failures, "R2", amounts.tax, entry.tax, `tax of group "${groupId}"`);
    if (entry.treatment !== "taxable" && greaterThan(entry.tax, zero(currency))) {
      failures.push({
        check: "R2",
        expected: show(zero(currency)),
        actual: show(entry.tax),
        detail: `tax of the non-taxable group "${groupId}"`,
      });
    }
  }
  for (const entry of c.vatSummary) {
    if (!derived.has(entry.groupId)) {
      failures.push({
        check: "R2",
        expected: "lines or allocations",
        actual: "none",
        detail: `summary row "${entry.groupId}"`,
      });
    }
  }

  // R3: a tax allocation's base is the final base of its group.
  for (const component of c.components) {
    if (component.kind !== "tax") continue;
    for (const allocation of component.allocations) {
      const entry = entries.get(allocation.groupId);
      if (entry !== undefined) {
        compareAmounts(
          failures,
          "R3",
          entry.base,
          allocation.base,
          `tax "${component.id}" on group "${allocation.groupId}"`,
        );
      }
    }
  }

  // R4: total = subtotal + Σ adds-to-total = Σ base(g) + Σ tax(g).
  const addsToTotal = sum(
    c.components
      .filter((component) => component.effect === "adds-to-total")
      .map((component) => component.amount),
    currency,
  );
  compareAmounts(
    failures,
    "R4",
    add(c.subtotal, addsToTotal),
    c.total,
    "total = subtotal + Σ adds-to-total amounts",
  );
  const summaryTotal = sum(
    c.vatSummary.flatMap((entry) => [entry.base, entry.tax]),
    currency,
  );
  compareAmounts(failures, "R4", summaryTotal, c.total, "total = Σ base(g) + Σ tax(g)");

  // R5: netPayable = total − deductions; withholdingTotal = Σ withholdings ≤ total.
  const deductions = sum(
    c.components
      .filter((component) => component.effect === "deducted-from-payable")
      .map((component) => component.amount),
    currency,
  );
  compareAmounts(
    failures,
    "R5",
    subtract(c.total, deductions),
    c.netPayable,
    "netPayable = total − Σ deducted-from-payable",
  );
  const withholdings = sum(
    c.components
      .filter((component) => component.kind === "withholding")
      .map((component) => component.amount),
    currency,
  );
  compareAmounts(
    failures,
    "R5",
    withholdings,
    c.withholdingTotal,
    "withholdingTotal = Σ withholding amounts",
  );
  if (greaterThan(c.withholdingTotal, c.total)) {
    failures.push({
      check: "R5",
      expected: `≤ ${show(c.total)}`,
      actual: show(c.withholdingTotal),
      detail: "withholdingTotal ≤ total",
    });
  }

  // R8: taxTotal = Σ tax(g) = Σ tax components; taxableBase matches its definition.
  compareAmounts(
    failures,
    "R8",
    sum(
      c.vatSummary.map((entry) => entry.tax),
      currency,
    ),
    c.taxTotal,
    "taxTotal = Σ tax(g)",
  );
  const taxComponents = sum(
    c.components
      .filter((component) => component.kind === "tax" && component.effect === "adds-to-total")
      .map((component) => component.amount),
    currency,
  );
  compareAmounts(
    failures,
    "R8",
    taxComponents,
    c.taxTotal,
    "taxTotal = Σ adds-to-total tax amounts",
  );
  const notExcluded = (groupId: string): boolean => entries.get(groupId)?.treatment !== "excluded";
  let taxableBase = sum(
    c.lines.filter((line) => notExcluded(line.groupId)).map((line) => line.net),
    currency,
  );
  for (const component of c.components) {
    if (component.effect !== "adds-to-total") continue;
    if (component.kind !== "contribution" && component.kind !== "surcharge") continue;
    for (const allocation of component.allocations) {
      if (notExcluded(allocation.groupId)) taxableBase = add(taxableBase, allocation.amount);
    }
  }
  compareAmounts(
    failures,
    "R8",
    taxableBase,
    c.taxableBase,
    "taxableBase = non-excluded lines + contributions and surcharges",
  );

  return failures;
}

/** @throws ReconciliationError with the first failure */
export function assertReconciled(computation: InvoiceComputation): void {
  const [first] = reconciliationFailures(computation);
  if (first !== undefined)
    throw new ReconciliationError(first.check, first.expected, first.actual, first.detail);
}
