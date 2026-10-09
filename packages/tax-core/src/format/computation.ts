import { formatMoney, formatPercent } from "@fairhour/money";
import type { InvoiceComputation } from "../computation/types";
import { coreMessages } from "../messages/core-messages";
import { formatMessage } from "../messages/format";
import { mergeCatalogs } from "../messages/merge";
import type { WarningSeverity } from "../pack/rule";
import type { PackFacts, TaxPack } from "../pack/types";
import type { LocaleTag } from "../primitives";

export interface FormattedComputation {
  readonly locale: LocaleTag;
  readonly components: readonly {
    readonly id: string;
    readonly label: string;
    readonly amount: string;
    readonly base: string;
    readonly rate?: string;
  }[];
  readonly vatSummary: readonly {
    readonly groupId: string;
    readonly label: string;
    readonly reference?: string;
    readonly base: string;
    readonly tax: string;
  }[];
  readonly totals: {
    readonly subtotal: string;
    readonly taxableBase: string;
    readonly taxTotal: string;
    readonly total: string;
    readonly withholdingTotal: string;
    readonly netPayable: string;
  };
  /** Legal notes in the user's locale (for reading)… */
  readonly legalNotes: readonly { readonly id: string; readonly text: string }[];
  /** …and in pack.meta.documentLocale (the text to print on the document). */
  readonly documentLegalNotes: readonly { readonly id: string; readonly text: string }[];
  readonly warnings: readonly {
    readonly code: string;
    readonly severity: WarningSeverity;
    readonly text: string;
  }[];
  readonly disclaimer: string;
}

/**
 * Every user-visible text and amount of a computation in `locale`; legal notes also in the
 * pack's document locale (the user's locale when the pack has none).
 * @throws MissingMessageError, MessageFormatError
 */
export function formatComputation<C, P, F extends PackFacts, O>(
  computation: InvoiceComputation,
  pack: TaxPack<C, P, F, O>,
  locale: LocaleTag,
): FormattedComputation {
  const catalogs = mergeCatalogs(coreMessages, pack.messages);
  const text = (ref: Parameters<typeof formatMessage>[0], at: LocaleTag = locale): string =>
    formatMessage(ref, catalogs, at);
  const amount = (value: Parameters<typeof formatMoney>[0]): string => formatMoney(value, locale);
  const documentLocale = pack.meta.documentLocale ?? locale;
  return {
    locale,
    components: computation.components.map((component) => ({
      id: component.id,
      label: text(component.label),
      amount: amount(component.amount),
      base: amount(component.base),
      ...(component.rate === undefined ? {} : { rate: formatPercent(component.rate, locale) }),
    })),
    vatSummary: computation.vatSummary.map((entry) => ({
      groupId: entry.groupId,
      label: text(entry.label),
      ...(entry.reference === undefined ? {} : { reference: text(entry.reference) }),
      base: amount(entry.base),
      tax: amount(entry.tax),
    })),
    totals: {
      subtotal: amount(computation.subtotal),
      taxableBase: amount(computation.taxableBase),
      taxTotal: amount(computation.taxTotal),
      total: amount(computation.total),
      withholdingTotal: amount(computation.withholdingTotal),
      netPayable: amount(computation.netPayable),
    },
    legalNotes: computation.legalNotes.map((note) => ({ id: note.id, text: text(note.message) })),
    documentLegalNotes: computation.legalNotes.map((note) => ({
      id: note.id,
      text: text(note.message, documentLocale),
    })),
    warnings: computation.warnings.map((warning) => ({
      code: warning.code,
      severity: warning.severity,
      text: text(warning.message),
    })),
    disclaimer: text(pack.meta.disclaimer),
  };
}
