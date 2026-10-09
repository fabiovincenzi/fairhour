import { formatMoney } from "@fairhour/money";
import type { InvoiceComputation } from "../computation/types";
import { coreMessages } from "../messages/core-messages";
import { formatMessage } from "../messages/format";
import { mergeCatalogs } from "../messages/merge";
import type { MessageRef } from "../messages/types";
import type { PackFacts, TaxPack } from "../pack/types";
import type { LocaleTag, RuleId } from "../primitives";
import type { SourceRef } from "../sources";

export interface FormattedTraceStep {
  readonly step: number;
  /** The emitting rule, or "core". */
  readonly ruleId: RuleId;
  readonly ruleTitle?: string; // from the rule's title key, absent for "core"
  readonly text: string;
  readonly formula?: string;
  readonly amount?: string; // formatMoney
  readonly sources: readonly SourceRef[];
}

/**
 * The explanation trace in `locale` (falling back to the language, then English). Rules that
 * are no longer in the pack (an older computation) are shown without a title.
 * @throws MissingMessageError, MessageFormatError
 */
export function formatTrace<C, P, F extends PackFacts, O>(
  computation: InvoiceComputation,
  pack: TaxPack<C, P, F, O>,
  locale: LocaleTag,
): readonly FormattedTraceStep[] {
  const catalogs = mergeCatalogs(coreMessages, pack.messages);
  const titles = new Map<string, MessageRef>(pack.rules.map((rule) => [rule.id, rule.title]));
  return computation.trace.map((step) => {
    const title = step.ruleId === "core" ? undefined : titles.get(step.ruleId);
    return {
      step: step.step,
      ruleId: step.ruleId,
      ...(title === undefined ? {} : { ruleTitle: formatMessage(title, catalogs, locale) }),
      text: formatMessage(step.message, catalogs, locale),
      ...(step.formula === undefined
        ? {}
        : { formula: formatMessage(step.formula, catalogs, locale) }),
      ...(step.amount === undefined ? {} : { amount: formatMoney(step.amount, locale) }),
      sources: step.sources,
    };
  });
}
