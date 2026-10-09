import type { MessageCatalogs } from "./types";

/**
 * The engine's own catalog: steps every computation has (line totals, subtotal, total,
 * deductions, net payable), the empty-invoice warning, and formulas packs may reuse. Packs
 * must not define `core.*` keys; format with `mergeCatalogs(coreMessages, pack.messages)`.
 */
export const coreMessages: MessageCatalogs = Object.freeze({
  en: Object.freeze({
    "core.line": "{description}: {quantity} × {unitPrice} = {amount}",
    "core.subtotal": "Subtotal of the lines: {amount}",
    "core.total": "Document total: {amount}",
    "core.deductions": "Deducted from the amount payable: {amount}",
    "core.net-payable": "Net amount payable: {amount}",
    "core.no-lines": "The invoice has no lines yet: every amount is zero.",
    "core.formula.percentage": "{rate} × {base} = {amount}",
  }),
  it: Object.freeze({
    "core.line": "{description}: {quantity} × {unitPrice} = {amount}",
    "core.subtotal": "Totale delle righe: {amount}",
    "core.total": "Totale documento: {amount}",
    "core.deductions": "Trattenute dal netto a pagare: {amount}",
    "core.net-payable": "Netto a pagare: {amount}",
    "core.no-lines": "La fattura non ha ancora righe: tutti gli importi sono zero.",
    "core.formula.percentage": "{rate} × {base} = {amount}",
  }),
});
