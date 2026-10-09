import {
  add,
  CurrencyMismatchError,
  divideAndRound,
  money,
  percentage,
  zero,
  type CurrencyCode,
  type Decimal,
  type Money,
  type RoundingMode,
} from "@fairhour/money";
import type { Component } from "../computation/types";
import { ownValue } from "../internal/records";
import type { Allocation, ComputationState, NetLine, TaxGroup } from "../pack/rule";
import type { PackFacts, RoundingPolicy } from "../pack/types";

export { mergeCatalogs } from "../messages/merge";

export interface GroupBase {
  readonly groupId: string;
  readonly base: Money;
}

function findGroup<F extends PackFacts>(
  state: ComputationState<F>,
  groupId: string,
): TaxGroup | undefined {
  return state.groups.find((group) => group.id === groupId);
}

/**
 * The tax group of a line.
 * @throws Error when the line does not exist or is not assigned yet (a rule-ordering bug; the
 *         engine reports it as a RuleExecutionError)
 */
export function groupOf<F extends PackFacts>(state: ComputationState<F>, lineId: string): TaxGroup {
  const groupId = ownValue(state.lineGroups, lineId);
  const group = groupId === undefined ? undefined : findGroup(state, groupId);
  if (group === undefined)
    throw new Error(`groupOf: line "${lineId}" is not assigned to a tax group`);
  return group;
}

/** The lines assigned to `groupId`, in input order. */
export function linesInGroup<F extends PackFacts>(
  state: ComputationState<F>,
  groupId: string,
): readonly NetLine[] {
  return state.lines.filter((line) => ownValue(state.lineGroups, line.id) === groupId);
}

/** Σ net of the lines matching `predicate` (unassigned lines get `group` undefined). */
export function sumNet<F extends PackFacts>(
  state: ComputationState<F>,
  predicate: (line: NetLine, group: TaxGroup | undefined) => boolean,
  currency: CurrencyCode,
): Money {
  let total = zero(currency);
  for (const line of state.lines) {
    const groupId = ownValue(state.lineGroups, line.id);
    const group = groupId === undefined ? undefined : findGroup(state, groupId);
    if (predicate(line, group)) total = add(total, line.net);
  }
  return total;
}

/**
 * Bases per group, in group registration order, omitting zero bases: Σ net of matching lines,
 * plus the allocations of the listed components (e.g. a contribution computed on fees + surcharge).
 * Listed components that do not exist (their rule did not apply) are ignored.
 */
export function basesByGroup<F extends PackFacts>(
  state: ComputationState<F>,
  options: {
    readonly lines: (line: NetLine, group: TaxGroup) => boolean;
    readonly includeComponents?: readonly string[];
  },
): readonly GroupBase[] {
  const included = state.components.filter((component) =>
    (options.includeComponents ?? []).includes(component.id),
  );
  const result: GroupBase[] = [];
  for (const group of state.groups) {
    let base: Money | undefined;
    const plus = (value: Money): void => {
      base = base === undefined ? value : add(base, value);
    };
    for (const line of linesInGroup(state, group.id))
      if (options.lines(line, group)) plus(line.net);
    for (const component of included) {
      for (const allocation of component.allocations)
        if (allocation.groupId === group.id) plus(allocation.amount);
    }
    if (base !== undefined && base.amount !== 0n) result.push({ groupId: group.id, base });
  }
  return result;
}

/** One allocation per group base: percentage(base, rate, mode). */
export function percentageByGroup(
  bases: readonly GroupBase[],
  ratePercent: Decimal,
  mode: RoundingMode,
): readonly Allocation[] {
  return bases.map((entry) => ({
    groupId: entry.groupId,
    base: entry.base,
    amount: percentage(entry.base, ratePercent, mode),
  }));
}

export function sumAllocations(
  allocations: readonly Allocation[],
  currency: CurrencyCode,
): { readonly base: Money; readonly amount: Money } {
  let base = zero(currency);
  let amount = zero(currency);
  for (const allocation of allocations) {
    base = add(base, allocation.base);
    amount = add(amount, allocation.amount);
  }
  return { base, amount };
}

/** The items that make up a group's base: line nets, then non-tax adds-to-total allocations. */
function groupItems<F extends PackFacts>(
  state: ComputationState<F>,
  groupId: string,
): readonly Money[] {
  const items = linesInGroup(state, groupId).map((line) => line.net);
  for (const component of state.components) {
    if (component.kind === "tax" || component.effect !== "adds-to-total") continue;
    for (const allocation of component.allocations)
      if (allocation.groupId === groupId) items.push(allocation.amount);
  }
  return items;
}

function inferCurrency<F extends PackFacts>(state: ComputationState<F>): CurrencyCode {
  const sample = state.lines[0]?.net ?? state.components[0]?.amount;
  if (sample === undefined) {
    throw new Error(
      "groupBase: the state has no amounts; pass the currency explicitly (ctx.currency)",
    );
  }
  return sample.currency;
}

/**
 * Current base of a group (lines + non-tax adds-to-total allocations), for tax rules.
 * `currency` (normally `ctx.currency`) is only needed for an empty computation; when omitted it
 * is taken from the state's amounts.
 */
export function groupBase<F extends PackFacts>(
  state: ComputationState<F>,
  groupId: string,
  currency?: CurrencyCode,
): Money {
  const items = groupItems(state, groupId);
  let base = zero(currency ?? inferCurrency(state));
  for (const item of items) base = add(base, item);
  return base;
}

/**
 * One tax allocation per taxable group with a non-zero base, following `policy`:
 * "per-group" rounds rate × group base once; "per-line" rounds rate × amount for every item of the
 * group (each line net and each non-tax allocation) and sums the results. `base` is always the
 * group base, so R3 holds.
 */
export function taxAllocations<F extends PackFacts>(
  state: ComputationState<F>,
  policy: RoundingPolicy["taxes"],
  currency: CurrencyCode,
): readonly Allocation[] {
  const result: Allocation[] = [];
  for (const group of state.groups) {
    if (group.treatment !== "taxable" || group.rate === undefined) continue;
    const rate = group.rate;
    const items = groupItems(state, group.id);
    let base = zero(currency);
    for (const item of items) base = add(base, item);
    if (base.amount === 0n) continue;
    let amount: Money;
    if (policy.scope === "per-group") {
      amount = percentage(base, rate, policy.mode);
    } else {
      amount = zero(currency);
      for (const item of items) amount = add(amount, percentage(item, rate, policy.mode));
    }
    result.push({ groupId: group.id, base, amount });
  }
  return result;
}

export function findComponent<F extends PackFacts>(
  state: ComputationState<F>,
  id: string,
): Component | undefined {
  return state.components.find((component) => component.id === id);
}

/**
 * Pro-rata share for partial payments: amount × part / whole, halfUp. `part` and `whole` must
 * share a currency; the result is in `amount`'s currency.
 * @throws CurrencyMismatchError, DivisionByZeroError (whole is zero)
 */
export function proRata(amount: Money, part: Money, whole: Money): Money {
  if (part.currency !== whole.currency)
    throw new CurrencyMismatchError(part.currency, whole.currency);
  return money(
    divideAndRound(amount.amount * part.amount, whole.amount, "halfUp"),
    amount.currency,
  );
}
