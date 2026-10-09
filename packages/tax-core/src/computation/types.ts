import type { CurrencyCode, Decimal, Money } from "@fairhour/money";
import type { ClientInput, DocumentKind, ExchangeRecord } from "../input/types";
import type { MessageRef } from "../messages/types";
import type {
  Allocation,
  ComponentDraft,
  NetLine,
  TaxTreatmentKind,
  WarningSeverity,
} from "../pack/rule";
import type { IsoDate, RuleId } from "../primitives";
import type { SourceRef } from "../sources";

export interface ComputedLine extends NetLine {
  readonly groupId: string;
}

export interface Component extends ComponentDraft {
  readonly ruleId: RuleId;
  readonly allocations: readonly Allocation[]; // [] when not adds-to-total
  readonly sources: readonly SourceRef[];
}

export interface LegalNote {
  readonly id: string;
  readonly ruleId: RuleId;
  readonly message: MessageRef;
  readonly sources: readonly SourceRef[];
}

export interface Warning {
  readonly code: string;
  readonly severity: WarningSeverity;
  /** The emitting rule, or "core" for the engine's own warnings. */
  readonly ruleId: RuleId;
  readonly message: MessageRef;
}

export interface TraceStep {
  /** 1-based, contiguous. */
  readonly step: number;
  /** The emitting rule, or "core" for the engine's own steps. */
  readonly ruleId: RuleId;
  readonly message: MessageRef;
  readonly formula?: MessageRef;
  readonly amount?: Money;
  readonly componentId?: string;
  readonly sources: readonly SourceRef[];
}

export interface TaxSummaryEntry {
  readonly groupId: string;
  readonly treatment: TaxTreatmentKind;
  readonly rate?: Decimal;
  readonly label: MessageRef;
  readonly reference?: MessageRef;
  /** Lines in the group + non-tax adds-to-total allocations to it. */
  readonly base: Money;
  /** Tax allocations to it (0 unless taxable). */
  readonly tax: Money;
  readonly exportCodes?: Readonly<Record<string, string>>;
}

export const ENGINE_NAME = "@fairhour/tax-core";

export interface InvoiceComputation {
  readonly schemaVersion: 1;
  readonly engine: { readonly name: typeof ENGINE_NAME; readonly version: string };
  readonly pack: { readonly id: string; readonly version: string };
  readonly parameters: { readonly id: string; readonly effectiveFrom: IsoDate };
  readonly issueDate: IsoDate;
  readonly documentKind: DocumentKind;
  readonly currency: CurrencyCode;
  readonly client: ClientInput;
  readonly exchangeRates?: readonly ExchangeRecord[];
  readonly lines: readonly ComputedLine[];
  /** Σ line totals. */
  readonly subtotal: Money;
  readonly components: readonly Component[];
  /** One entry per tax group that has lines or allocations, in registration order. */
  readonly vatSummary: readonly TaxSummaryEntry[];
  /** Consideration before taxes: non-excluded lines + contribution/surcharge allocations to non-excluded groups. */
  readonly taxableBase: Money;
  /** Σ amounts of adds-to-total components of kind "tax". */
  readonly taxTotal: Money;
  /** subtotal + Σ amounts of adds-to-total components. The document total. */
  readonly total: Money;
  /** Σ amounts of components of kind "withholding". */
  readonly withholdingTotal: Money;
  /** total − Σ amounts of deducted-from-payable components. What the client pays. */
  readonly netPayable: Money;
  readonly legalNotes: readonly LegalNote[];
  readonly warnings: readonly Warning[];
  readonly trace: readonly TraceStep[];
}
