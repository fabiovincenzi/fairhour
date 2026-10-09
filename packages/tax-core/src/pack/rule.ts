import type { CurrencyCode, Decimal, Money, Price } from "@fairhour/money";
import type { Component, LegalNote, TraceStep, Warning } from "../computation/types";
import type { InvoiceInput, LineKind, LineTaxTreatment, LineUnit } from "../input/types";
import type { MessageRef } from "../messages/types";
import type { IsoDate, RuleId } from "../primitives";
import type { SourceRef } from "../sources";
import type { PackFacts, RoundingPolicy } from "./types";

export interface RuleContext<C, P, O> {
  readonly input: InvoiceInput; // validated
  readonly config: C; // parsed by configSchema
  readonly options: O; // parsed by invoiceOptionsSchema
  readonly params: P; // resolved for input.issueDate
  readonly parameterVersion: { readonly id: string; readonly effectiveFrom: IsoDate };
  readonly rounding: RoundingPolicy; // pack.roundingPolicy(config)
  readonly currency: CurrencyCode; // input.currency
  readonly zero: Money; // zero(currency)
}

/** A line with its total, computed by the engine before any rule runs. */
export interface NetLine {
  readonly id: string;
  readonly kind: LineKind;
  readonly description: string;
  readonly quantity: Decimal;
  readonly unit: LineUnit;
  readonly unitPrice: Price;
  readonly treatment: LineTaxTreatment;
  readonly net: Money; // extend(unitPrice, quantity, rounding.lines.mode)
}

export type TaxTreatmentKind = "taxable" | "exempt" | "out-of-scope" | "excluded";

export const TAX_TREATMENT_KINDS: readonly TaxTreatmentKind[] = Object.freeze([
  "taxable",
  "exempt",
  "out-of-scope",
  "excluded",
]);

/** Tax group ids: "vat-22", "n2.2", "n1". */
export const GROUP_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,31}$/;

/** A row of the tax summary ("VAT 22%", "N2.2", "art. 15"). Registered by rules. */
export interface TaxGroup {
  /** Unique within the computation: "vat-22", "n2.2", "n1". /^[a-z0-9][a-z0-9.-]{0,31}$/ */
  readonly id: string;
  readonly treatment: TaxTreatmentKind;
  /** Percent units. Required when treatment is "taxable" (may be 0), forbidden otherwise. */
  readonly rate?: Decimal;
  readonly label: MessageRef;
  /** Legal reference printed with the summary row. */
  readonly reference?: MessageRef;
  /** Data for e-invoicing exporters, e.g. { "fatturapa.Natura": "N2.2" }. */
  readonly exportCodes?: Readonly<Record<string, string>>;
}

export type ComponentKind =
  "contribution" | "surcharge" | "tax" | "withholding" | "stamp-duty" | "other";

export const COMPONENT_KINDS: readonly ComponentKind[] = Object.freeze([
  "contribution",
  "surcharge",
  "tax",
  "withholding",
  "stamp-duty",
  "other",
]);

export type ComponentEffect = "adds-to-total" | "deducted-from-payable" | "informational";

export const COMPONENT_EFFECTS: readonly ComponentEffect[] = Object.freeze([
  "adds-to-total",
  "deducted-from-payable",
  "informational",
]);

/** The part of an adds-to-total component that belongs to one tax group. */
export interface Allocation {
  readonly groupId: string;
  /** For a tax: the group's taxable base. Otherwise: the part of the component's base in this group. */
  readonly base: Money;
  readonly amount: Money;
}

export interface ComponentDraft {
  /** Unique within the computation: "it.inps-rivalsa". */
  readonly id: string;
  readonly kind: ComponentKind;
  readonly label: MessageRef;
  readonly effect: ComponentEffect;
  readonly base: Money;
  /**
   * Percent units, when the amount is base × rate. A tax spanning several groups (22 % and 10 %)
   * omits it: each tax allocation's rate is its group's rate.
   */
  readonly rate?: Decimal;
  readonly amount: Money;
  /** Required and non-empty when effect is "adds-to-total"; absent or empty otherwise. */
  readonly allocations?: readonly Allocation[];
  readonly exportCodes?: Readonly<Record<string, string>>;
  /** Defaults to the emitting rule's sources. */
  readonly sources?: readonly SourceRef[];
}

export interface LegalNoteDraft {
  /** Unique within the computation: "it.note.forfettario". */
  readonly id: string;
  readonly message: MessageRef;
  readonly sources?: readonly SourceRef[];
}

export type WarningSeverity = "info" | "warning";

export interface WarningDraft {
  readonly code: string; // "it.forfettario.foreign-business-client"
  readonly severity: WarningSeverity;
  readonly message: MessageRef;
}

export interface TraceDraft {
  /** What happened, in words: "INPS rivalsa: 4% of the fees". */
  readonly message: MessageRef;
  /** The arithmetic: "{base} × {rate} = {amount}". */
  readonly formula?: MessageRef;
  readonly amount?: Money;
  /** Links the step to a component (required for at least one step per component). */
  readonly componentId?: string;
  /** Defaults to the rule's sources. */
  readonly sources?: readonly SourceRef[];
}

export interface ComputationState<F extends PackFacts> {
  readonly lines: readonly NetLine[];
  readonly groups: readonly TaxGroup[]; // registration order
  readonly lineGroups: Readonly<Record<string, string>>; // line id -> group id
  readonly components: readonly Component[];
  readonly legalNotes: readonly LegalNote[];
  readonly warnings: readonly Warning[];
  readonly trace: readonly TraceStep[];
  readonly facts: F;
}

/** What a rule adds. Everything is append-only; the engine merges and checks it. */
export interface RuleOutput<F extends PackFacts> {
  readonly groups?: readonly TaxGroup[];
  readonly lineGroups?: Readonly<Record<string, string>>;
  readonly components?: readonly ComponentDraft[];
  readonly legalNotes?: readonly LegalNoteDraft[];
  readonly warnings?: readonly WarningDraft[];
  readonly trace?: readonly TraceDraft[];
  readonly facts?: Partial<F>;
}

export interface Rule<C, P, F extends PackFacts, O> {
  /** Stable, matches RULE_ID_PATTERN and starts with `${meta.id}.`: "it.ordinario.vat". */
  readonly id: RuleId;
  /** Short title (catalog key), shown in the trace and the docs. */
  readonly title: MessageRef;
  /** At least one. */
  readonly sources: readonly SourceRef[];
  /**
   * Structural applicability (regime, configured options). When false the rule is skipped
   * silently. Business outcomes ("no withholding: private client") are expressed by `apply`
   * returning a trace step instead.
   */
  readonly appliesTo?: (ctx: RuleContext<C, P, O>) => boolean;
  /** Pure. Must not throw for valid input; exceptions become RuleExecutionError. */
  readonly apply: (state: ComputationState<F>, ctx: RuleContext<C, P, O>) => RuleOutput<F>;
}
