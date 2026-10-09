import {
  add,
  compareDecimal,
  DECIMAL_HUNDRED,
  equals,
  isDecimal,
  isMoney,
  signDecimal,
  zero,
  type CurrencyCode,
  type Money,
} from "@fairhour/money";
import type { Component, LegalNote, TraceStep, Warning } from "../computation/types";
import { RuleContractError, type RuleContractReason } from "../errors";
import { copyDecimal, copyMessage, copyMoney, copyStringRecord } from "../internal/copy";
import { hasOwn, isPlainObject, nullPrototypeRecord, setOwn } from "../internal/records";
import { messageRefProblem } from "../messages/validate";
import type { MessageRef } from "../messages/types";
import {
  COMPONENT_EFFECTS,
  COMPONENT_KINDS,
  GROUP_ID_PATTERN,
  TAX_TREATMENT_KINDS,
  type Allocation,
  type ComponentEffect,
  type ComponentKind,
  type ComputationState,
  type TaxGroup,
  type TaxTreatmentKind,
  type WarningSeverity,
} from "../pack/rule";
import type { FactValue, PackFacts } from "../pack/types";
import type { RuleId } from "../primitives";
import { copySource, sourceProblems, type SourceRef } from "../sources";
import { deepFreeze } from "./freeze";

/** What the merge needs to know about the rule whose output it merges. */
export interface MergeRule {
  readonly id: RuleId;
  /** Already checked by `checkRuleSources`. */
  readonly sources: readonly SourceRef[];
}

type Unknown = Readonly<Record<string, unknown>>;

class Merger {
  constructor(
    private readonly rule: MergeRule,
    private readonly currency: CurrencyCode,
  ) {}

  fail(reason: RuleContractReason, detail: string): never {
    throw new RuleContractError(this.rule.id, reason, detail);
  }

  isAmount(value: unknown): value is Money {
    return isMoney(value) && value.currency === this.currency && value.amount >= 0n;
  }

  message(value: unknown, reason: RuleContractReason, what: string): MessageRef {
    const problem = messageRefProblem(value, this.currency);
    if (problem !== undefined) this.fail(reason, `${what}: ${problem}`);
    return copyMessage(value as MessageRef);
  }

  optionalMessage(
    value: unknown,
    reason: RuleContractReason,
    what: string,
  ): MessageRef | undefined {
    return value === undefined ? undefined : this.message(value, reason, what);
  }

  stringRecord(
    value: unknown,
    reason: RuleContractReason,
    what: string,
  ): Readonly<Record<string, string>> | undefined {
    if (value === undefined) return undefined;
    if (!isPlainObject(value) || !Object.values(value).every((item) => typeof item === "string")) {
      this.fail(reason, `${what} must map strings to strings`);
    }
    return copyStringRecord(value as Readonly<Record<string, string>>);
  }

  sources(value: unknown, reason: RuleContractReason, what: string): readonly SourceRef[] {
    if (value === undefined) return this.rule.sources.map(copySource);
    if (!Array.isArray(value) || value.length === 0)
      this.fail(reason, `${what}: sources must be a non-empty array`);
    for (const source of value as readonly unknown[]) {
      const problems = sourceProblems(source);
      if (problems.length > 0)
        this.fail(reason, `${what}: invalid source (${problems.join(", ")})`);
    }
    return (value as readonly SourceRef[]).map(copySource);
  }

  array(value: unknown, field: string): readonly unknown[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) this.fail("invalid-output", `"${field}" must be an array`);
    return value as readonly unknown[];
  }

  record(value: unknown, field: string): Unknown {
    if (value === undefined) return {};
    if (!isPlainObject(value)) this.fail("invalid-output", `"${field}" must be a plain object`);
    return value;
  }

  object(value: unknown, reason: RuleContractReason, what: string): Unknown {
    if (!isPlainObject(value)) this.fail(reason, `${what} must be a plain object`);
    return value;
  }

  group(raw: unknown, known: Set<string>): TaxGroup {
    const group = this.object(raw, "invalid-group", "a tax group");
    const id = group.id;
    if (typeof id !== "string" || !GROUP_ID_PATTERN.test(id)) {
      this.fail("invalid-group", `group id must match ${GROUP_ID_PATTERN.source}`);
    }
    if (known.has(id)) this.fail("invalid-group", `group "${id}" is already registered`);
    const treatment = group.treatment;
    if (
      typeof treatment !== "string" ||
      !(TAX_TREATMENT_KINDS as readonly string[]).includes(treatment)
    ) {
      this.fail("invalid-group", `group "${id}": unknown treatment`);
    }
    const rate = group.rate;
    if (treatment === "taxable") {
      if (!isDecimal(rate) || signDecimal(rate) < 0 || compareDecimal(rate, DECIMAL_HUNDRED) > 0) {
        this.fail("invalid-group", `group "${id}": a taxable group needs a rate between 0 and 100`);
      }
    } else if (rate !== undefined) {
      this.fail("invalid-group", `group "${id}": only taxable groups have a rate`);
    }
    known.add(id);
    const reference = this.optionalMessage(
      group.reference,
      "invalid-group",
      `group "${id}" reference`,
    );
    const exportCodes = this.stringRecord(
      group.exportCodes,
      "invalid-group",
      `group "${id}" exportCodes`,
    );
    return {
      id,
      treatment: treatment as TaxTreatmentKind,
      ...(isDecimal(rate) ? { rate: copyDecimal(rate) } : {}),
      label: this.message(group.label, "invalid-group", `group "${id}" label`),
      ...(reference === undefined ? {} : { reference }),
      ...(exportCodes === undefined ? {} : { exportCodes }),
    };
  }

  allocations(
    raw: unknown,
    id: string,
    kind: ComponentKind,
    base: Money,
    amount: Money,
    groups: ReadonlyMap<string, TaxGroup>,
  ): readonly Allocation[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      this.fail(
        "invalid-allocations",
        `component "${id}": an adds-to-total component needs allocations`,
      );
    }
    const seen = new Set<string>();
    let baseSum = zero(this.currency);
    let amountSum = zero(this.currency);
    const result = (raw as readonly unknown[]).map((item): Allocation => {
      const allocation = this.object(
        item,
        "invalid-allocations",
        `component "${id}": an allocation`,
      );
      const groupId = allocation.groupId;
      const group = typeof groupId === "string" ? groups.get(groupId) : undefined;
      if (typeof groupId !== "string" || group === undefined) {
        this.fail("invalid-allocations", `component "${id}": allocation to an unknown group`);
      }
      if (seen.has(groupId))
        this.fail("invalid-allocations", `component "${id}": two allocations to "${groupId}"`);
      seen.add(groupId);
      if (!this.isAmount(allocation.base) || !this.isAmount(allocation.amount)) {
        this.fail(
          "invalid-allocations",
          `component "${id}": allocation amounts must be non-negative ${this.currency} Money`,
        );
      }
      if (kind === "tax" && group.treatment !== "taxable") {
        this.fail(
          "invalid-component",
          `tax "${id}" is allocated to the non-taxable group "${groupId}"`,
        );
      }
      baseSum = add(baseSum, allocation.base);
      amountSum = add(amountSum, allocation.amount);
      return { groupId, base: copyMoney(allocation.base), amount: copyMoney(allocation.amount) };
    });
    if (!equals(amountSum, amount)) {
      this.fail(
        "invalid-allocations",
        `component "${id}": the allocation amounts do not add up to the amount`,
      );
    }
    if (!equals(baseSum, base)) {
      this.fail(
        "invalid-allocations",
        `component "${id}": the allocation bases do not add up to the base`,
      );
    }
    return result;
  }

  component(raw: unknown, known: Set<string>, groups: ReadonlyMap<string, TaxGroup>): Component {
    const draft = this.object(raw, "invalid-component", "a component");
    const id = draft.id;
    if (typeof id !== "string" || id.length === 0)
      this.fail("invalid-component", "component id is empty");
    if (known.has(id)) this.fail("invalid-component", `component "${id}" already exists`);
    known.add(id);
    const kind = draft.kind;
    if (typeof kind !== "string" || !(COMPONENT_KINDS as readonly string[]).includes(kind)) {
      this.fail("invalid-component", `component "${id}": unknown kind`);
    }
    const effect = draft.effect;
    if (typeof effect !== "string" || !(COMPONENT_EFFECTS as readonly string[]).includes(effect)) {
      this.fail("invalid-component", `component "${id}": unknown effect`);
    }
    if (kind === "withholding" && effect !== "deducted-from-payable") {
      this.fail("invalid-component", `withholding "${id}" must be deducted-from-payable`);
    }
    const { base, amount, rate } = draft;
    if (!this.isAmount(base) || !this.isAmount(amount)) {
      this.fail(
        "invalid-component",
        `component "${id}": base and amount must be non-negative ${this.currency} Money`,
      );
    }
    if (rate !== undefined && (!isDecimal(rate) || signDecimal(rate) < 0)) {
      this.fail("invalid-component", `component "${id}": rate must be a non-negative Decimal`);
    }
    const label = this.message(draft.label, "invalid-component", `component "${id}" label`);
    let allocations: readonly Allocation[] = [];
    if (effect === "adds-to-total") {
      allocations = this.allocations(
        draft.allocations,
        id,
        kind as ComponentKind,
        base,
        amount,
        groups,
      );
    } else if (
      draft.allocations !== undefined &&
      (!Array.isArray(draft.allocations) || draft.allocations.length > 0)
    ) {
      this.fail(
        "invalid-allocations",
        `component "${id}": only adds-to-total components have allocations`,
      );
    }
    const exportCodes = this.stringRecord(
      draft.exportCodes,
      "invalid-component",
      `component "${id}" exportCodes`,
    );
    return {
      id,
      ruleId: this.rule.id,
      kind: kind as ComponentKind,
      label,
      effect: effect as ComponentEffect,
      base: copyMoney(base),
      ...(isDecimal(rate) ? { rate: copyDecimal(rate) } : {}),
      amount: copyMoney(amount),
      allocations,
      ...(exportCodes === undefined ? {} : { exportCodes }),
      sources: this.sources(draft.sources, "invalid-component", `component "${id}"`),
    };
  }

  legalNote(raw: unknown, known: Set<string>): LegalNote {
    const note = this.object(raw, "invalid-legal-note", "a legal note");
    const id = note.id;
    if (typeof id !== "string" || id.length === 0)
      this.fail("invalid-legal-note", "legal note id is empty");
    if (known.has(id)) this.fail("duplicate-id", `legal note "${id}" already exists`);
    known.add(id);
    return {
      id,
      ruleId: this.rule.id,
      message: this.message(note.message, "invalid-legal-note", `legal note "${id}"`),
      sources: this.sources(note.sources, "invalid-legal-note", `legal note "${id}"`),
    };
  }

  warning(raw: unknown, known: Set<string>): Warning {
    const warning = this.object(raw, "invalid-warning", "a warning");
    const code = warning.code;
    if (typeof code !== "string" || code.length === 0)
      this.fail("invalid-warning", "warning code is empty");
    if (known.has(code)) this.fail("duplicate-id", `warning "${code}" already exists`);
    known.add(code);
    const severity = warning.severity;
    if (severity !== "info" && severity !== "warning") {
      this.fail("invalid-warning", `warning "${code}": severity must be "info" or "warning"`);
    }
    return {
      code,
      severity: severity satisfies WarningSeverity,
      ruleId: this.rule.id,
      message: this.message(warning.message, "invalid-warning", `warning "${code}"`),
    };
  }

  traceStep(raw: unknown, step: number, components: ReadonlySet<string>): TraceStep {
    const draft = this.object(raw, "invalid-trace", "a trace step");
    const { amount, componentId } = draft;
    if (amount !== undefined && !this.isAmount(amount)) {
      this.fail("invalid-trace", `trace amounts must be non-negative ${this.currency} Money`);
    }
    if (
      componentId !== undefined &&
      (typeof componentId !== "string" || !components.has(componentId))
    ) {
      this.fail("invalid-trace", "a trace step refers to an unknown component");
    }
    const formula = this.optionalMessage(draft.formula, "invalid-trace", "trace formula");
    return {
      step,
      ruleId: this.rule.id,
      message: this.message(draft.message, "invalid-trace", "trace message"),
      ...(formula === undefined ? {} : { formula }),
      ...(isMoney(amount) ? { amount: copyMoney(amount) } : {}),
      ...(typeof componentId === "string" ? { componentId } : {}),
      sources: this.sources(draft.sources, "invalid-trace", "trace step"),
    };
  }

  factValue(key: string, value: unknown): FactValue {
    const valid =
      value === null ||
      typeof value === "boolean" ||
      typeof value === "string" ||
      isDecimal(value) ||
      (isMoney(value) && value.currency === this.currency);
    if (!valid)
      this.fail("invalid-fact", `fact "${key}" must be a boolean, string, Decimal, Money or null`);
    if (isMoney(value)) return copyMoney(value);
    if (isDecimal(value)) return copyDecimal(value);
    return value;
  }
}

/** Checks a rule's own sources before it runs (design G10: every rule cites a source). */
export function checkRuleSources(ruleId: RuleId, sources: unknown): void {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new RuleContractError(ruleId, "invalid-sources", "a rule needs at least one source");
  }
  for (const source of sources as readonly unknown[]) {
    const problems = sourceProblems(source);
    if (problems.length > 0) {
      throw new RuleContractError(
        ruleId,
        "invalid-sources",
        `invalid source (${problems.join(", ")})`,
      );
    }
  }
}

/**
 * Applies a rule's output to the state after checking the merge contract of design 4.7, and
 * returns the new, deeply frozen state. The output is copied, never kept or frozen.
 * @throws RuleContractError
 */
export function mergeRuleOutput<F extends PackFacts>(
  state: ComputationState<F>,
  output: unknown,
  rule: MergeRule,
  currency: CurrencyCode,
): ComputationState<F> {
  const merger: Merger = new Merger(rule, currency);
  const raw = merger.object(output, "invalid-output", "a rule's output");

  // Groups (registration order).
  const groupIds = new Set(state.groups.map((group) => group.id));
  const newGroups = merger
    .array(raw.groups, "groups")
    .map((group) => merger.group(group, groupIds));
  const groups = [...state.groups, ...newGroups];
  const groupsById = new Map(groups.map((group) => [group.id, group] as const));

  // Line assignments.
  const lineIds = new Set(state.lines.map((line) => line.id));
  const lineGroups = nullPrototypeRecord<string>();
  for (const [lineId, groupId] of Object.entries(state.lineGroups))
    setOwn(lineGroups, lineId, groupId);
  for (const [lineId, groupId] of Object.entries(merger.record(raw.lineGroups, "lineGroups"))) {
    if (!lineIds.has(lineId)) merger.fail("invalid-line-assignment", `unknown line "${lineId}"`);
    if (hasOwn(lineGroups, lineId))
      merger.fail("invalid-line-assignment", `line "${lineId}" is already assigned`);
    if (typeof groupId !== "string" || !groupsById.has(groupId)) {
      merger.fail("invalid-line-assignment", `line "${lineId}" is assigned to an unknown group`);
    }
    setOwn(lineGroups, lineId, groupId);
  }

  // Components.
  const componentIds = new Set(state.components.map((component) => component.id));
  const newComponents = merger
    .array(raw.components, "components")
    .map((component) => merger.component(component, componentIds, groupsById));

  // Legal notes and warnings.
  const noteIds = new Set(state.legalNotes.map((note) => note.id));
  const newNotes = merger
    .array(raw.legalNotes, "legalNotes")
    .map((note) => merger.legalNote(note, noteIds));
  const warningCodes = new Set(state.warnings.map((warning) => warning.code));
  const newWarnings = merger
    .array(raw.warnings, "warnings")
    .map((warning) => merger.warning(warning, warningCodes));

  // Trace.
  const newTrace = merger
    .array(raw.trace, "trace")
    .map((step, index) => merger.traceStep(step, state.trace.length + index + 1, componentIds));

  // Facts: only keys declared in the initial facts, rebuilt in their key order.
  const factUpdates = merger.record(raw.facts, "facts");
  for (const key of Object.keys(factUpdates)) {
    if (!hasOwn(state.facts, key))
      merger.fail("unknown-fact", `fact "${key}" is not in initialFacts`);
  }
  const facts: Record<string, FactValue> = {};
  for (const [key, value] of Object.entries(state.facts)) {
    const update = factUpdates[key];
    setOwn(
      facts,
      key,
      hasOwn(factUpdates, key) && update !== undefined ? merger.factValue(key, update) : value,
    );
  }

  // Every component needs a trace step from the rule that emitted it.
  for (const component of newComponents) {
    if (!newTrace.some((step) => step.componentId === component.id)) {
      merger.fail("missing-trace", `component "${component.id}" has no trace step`);
    }
  }

  return deepFreeze({
    lines: state.lines,
    groups,
    lineGroups,
    components: [...state.components, ...newComponents],
    legalNotes: [...state.legalNotes, ...newNotes],
    warnings: [...state.warnings, ...newWarnings],
    trace: [...state.trace, ...newTrace],
    facts: facts as F,
  });
}
