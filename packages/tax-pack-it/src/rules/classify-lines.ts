/**
 * Rule 1, `it.common.classify-lines` (docs/tax-packs/it.md, section 7.1): assigns every line to
 * a tax group, adds the legal notes of the non-taxable groups (ordinario) and the warnings about
 * the client and the lines.
 */
import { add, normalizeDecimal, type Money } from "@fairhour/money";
import {
  message,
  p,
  type LegalNoteDraft,
  type MessageRef,
  type NetLine,
  type TaxGroup,
  type TraceDraft,
  type WarningDraft,
} from "@fairhour/tax-core";
import {
  compareGroups,
  N1,
  N2_1,
  N2_2,
  N4,
  n1Group,
  n21Group,
  n22Group,
  n4Group,
  vatGroup,
} from "../groups";
import { sources } from "../sources";
import { isForeignBusiness, type ItContext, type ItOutput, type ItRule } from "../types";

interface Classification {
  readonly group: TaxGroup;
  /** Why the line is in the group (nested in the trace step). */
  readonly reason: MessageRef;
}

/** A group with the reason of its lines and their total. */
interface GroupEntry extends Classification {
  readonly amount: Money;
}

function classify(line: NetLine, ctx: ItContext, euClient: boolean): Classification {
  const treatment = line.treatment;
  if (treatment.kind === "excluded")
    return { group: n1Group(), reason: message("it.reason.art15") };
  if (ctx.config.regime === "forfettario")
    return { group: n22Group("forfettario"), reason: message("it.reason.forfettario") };
  switch (treatment.kind) {
    case "exempt":
      return { group: n4Group(), reason: message("it.reason.exempt") };
    case "out-of-scope":
      return { group: n22Group("ordinario"), reason: message("it.reason.out-of-scope") };
    case "standard":
    case "rate": {
      if (isForeignBusiness(ctx.input.client)) {
        return {
          group: n21Group(),
          reason: message(euClient ? "it.reason.reverse-charge-eu" : "it.reason.outside-eu"),
        };
      }
      const rate = normalizeDecimal(
        treatment.kind === "rate" ? treatment.rate : ctx.params.vat.standardRate,
      );
      return { group: vatGroup(rate), reason: message("it.reason.vat", { rate: p.percent(rate) }) };
    }
  }
}

/** Distinct references in line order, joined with "; " (undefined when there are none). */
function joinReferences(references: readonly string[]): string | undefined {
  const distinct = references.filter((item, index) => references.indexOf(item) === index);
  return distinct.length === 0 ? undefined : distinct.join("; ");
}

/** Legal notes of the non-taxable groups (ordinario), in the canonical group order. */
function legalNotes(
  used: ReadonlySet<string>,
  euClient: boolean,
  exemptReferences: readonly string[],
  outOfScopeReferences: readonly string[],
): LegalNoteDraft[] {
  const notes: LegalNoteDraft[] = [];
  if (used.has(N2_1)) {
    notes.push(
      euClient
        ? {
            id: "it.note.reverse-charge-eu",
            message: message("it.note.reverse-charge-eu"),
            sources: [sources.vatPlaceOfSupply, sources.vatForeignAnnotations],
          }
        : {
            id: "it.note.outside-eu",
            message: message("it.note.outside-eu"),
            sources: [sources.vatPlaceOfSupply, sources.vatForeignAnnotations],
          },
    );
  }
  if (used.has(N2_2)) {
    const reference = joinReferences(outOfScopeReferences);
    notes.push({
      id: "it.note.out-of-scope",
      message:
        reference === undefined
          ? message("it.note.out-of-scope-generic")
          : message("it.note.out-of-scope", { reference: p.text(reference) }),
      sources: [sources.fatturapaNatura],
    });
  }
  if (used.has(N4)) {
    const reference = joinReferences(exemptReferences);
    notes.push({
      id: "it.note.exempt",
      message: message("it.note.exempt", {
        reference:
          reference === undefined ? p.message(message("it.reference.art10")) : p.text(reference),
      }),
      sources: [sources.vatExempt],
    });
  }
  if (used.has(N1)) {
    notes.push({
      id: "it.note.art15",
      message: message("it.note.art15"),
      sources: [sources.vatDisbursements],
    });
  }
  return notes;
}

export const classifyLines: ItRule = {
  id: "it.common.classify-lines",
  title: message("it.rule.common.classify-lines.title"),
  sources: [
    sources.l190NoVat,
    sources.fatturaForfettari,
    sources.vatStandardRate,
    sources.vatReducedRates,
    sources.vatDisbursements,
    sources.vatExempt,
    sources.vatPlaceOfSupply,
    sources.vatForeignAnnotations,
    sources.fatturapaNatura,
  ],
  apply: (state, ctx): ItOutput => {
    const { client } = ctx.input;
    const forfettario = ctx.config.regime === "forfettario";
    const euClient = ctx.params.euCountries.includes(client.country);
    const entries = new Map<string, GroupEntry>();
    const lineGroups: Record<string, string> = {};
    const exemptReferences: string[] = [];
    const outOfScopeReferences: string[] = [];
    let treatmentIgnored = false;
    let goods = false;

    for (const line of state.lines) {
      const { group, reason } = classify(line, ctx, euClient);
      const known = entries.get(group.id);
      entries.set(group.id, {
        group,
        reason,
        amount: known === undefined ? line.net : add(known.amount, line.net),
      });
      // defineProperty: a line id such as "__proto__" must stay an ordinary key.
      Object.defineProperty(lineGroups, line.id, { value: group.id, enumerable: true });
      const { treatment } = line;
      if (treatment.kind === "exempt" || treatment.kind === "out-of-scope") {
        if (forfettario) treatmentIgnored = true;
        else if (treatment.reference !== undefined) {
          (treatment.kind === "exempt" ? exemptReferences : outOfScopeReferences).push(
            treatment.reference,
          );
        }
      }
      if (line.kind === "goods" && treatment.kind !== "excluded") goods = true;
    }

    const ordered = [...entries.values()].sort((a, b) => compareGroups(a.group, b.group));
    const used = new Set(entries.keys());
    const warnings: WarningDraft[] = [];
    if (treatmentIgnored) {
      warnings.push({
        code: "it.forfettario.treatment-ignored",
        severity: "info",
        message: message("it.warning.forfettario.treatment-ignored"),
      });
    }
    if (forfettario && isForeignBusiness(client)) {
      warnings.push({
        code: "it.forfettario.foreign-business-client",
        severity: "warning",
        message: message("it.warning.forfettario.foreign-business-client"),
      });
    }
    if (used.has(N2_1) && euClient && client.vatId === undefined) {
      warnings.push({
        code: "it.client.eu-business-without-vat-id",
        severity: "warning",
        message: message("it.warning.client.eu-business-without-vat-id"),
      });
    }
    if (!forfettario && used.has(N2_2) && outOfScopeReferences.length === 0) {
      warnings.push({
        code: "it.out-of-scope.missing-reference",
        severity: "warning",
        message: message("it.warning.out-of-scope.missing-reference"),
      });
    }
    if (goods) {
      warnings.push({
        code: "it.goods-lines",
        severity: "info",
        message: message("it.warning.goods-lines"),
      });
    }

    const trace: TraceDraft[] =
      ordered.length === 0
        ? [{ message: message("it.trace.classify.none") }]
        : ordered.map((entry) => ({
            message: message("it.trace.classify.group", {
              group: p.message(entry.group.label),
              amount: p.money(entry.amount),
              reason: p.message(entry.reason),
            }),
          }));

    return {
      groups: ordered.map((entry) => entry.group),
      lineGroups,
      legalNotes: forfettario
        ? []
        : legalNotes(used, euClient, exemptReferences, outOfScopeReferences),
      warnings,
      trace,
    };
  },
};
