/**
 * Rule 1, `generic.classify-lines` (docs/tax-packs/generic.md, section 2.1): assigns every line
 * to a tax group, decides the reverse charge, and adds the reverse-charge, exemption and
 * out-of-scope notes and their warnings.
 */
import {
  compareDecimal,
  decimalFromInteger,
  normalizeDecimal,
  type Decimal,
} from "@fairhour/money";
import {
  message,
  p,
  type ClientInput,
  type LegalNoteDraft,
  type LineTaxTreatment,
  type MessageParam,
  type TaxGroup,
  type TraceDraft,
  type WarningDraft,
} from "@fairhour/tax-core";
import { percent, type GenericConfig, type GenericTaxConfig } from "../config";
import {
  FIXED_GROUP_IDS,
  fixedGroup,
  taxableGroup,
  taxGroupId,
  type FixedGroupId,
} from "../groups";
import type { ReverseChargeOption } from "../options";
import { configurationSources, reverseChargeSources } from "../sources";
import type { GenericRule } from "../types";

export const CLASSIFY_LINES_RULE_ID = "generic.classify-lines";

/** Where a line goes: a taxable group at a rate, or one of the fixed groups. */
export type Placement =
  { readonly group: "taxable"; readonly rate: Decimal } | { readonly group: FixedGroupId };

/**
 * The classification table of section 2.1, row by row. `reverseCharge` is the invoice-level
 * decision of {@link reverseChargeDecision}. Under `tax.kind === "none"` a `rate` treatment is
 * refused earlier (`generic.rate-without-tax`), so only `standard` lines reach the `no-tax` row in
 * practice; the row covers both, as the table says.
 */
export function classifyLine(
  treatment: LineTaxTreatment,
  tax: GenericTaxConfig,
  reverseCharge: boolean,
): Placement {
  switch (treatment.kind) {
    case "excluded":
      return { group: "excluded" };
    case "exempt":
      return { group: "exempt" };
    case "out-of-scope":
      return { group: "out-of-scope" };
    case "standard":
    case "rate":
      if (tax.kind === "none") return { group: "no-tax" };
      if (reverseCharge) return { group: "reverse-charge" };
      return {
        group: "taxable",
        rate: normalizeDecimal(treatment.kind === "rate" ? treatment.rate : percent(tax.rate)),
      };
  }
}

/** Why the reverse charge does or does not apply to an invoice. */
export type ReverseChargeDecision =
  | { readonly applies: true; readonly reason: "forced" }
  | {
      readonly applies: true;
      readonly reason: "foreign-business";
      readonly clientCountry: string;
      readonly supplierCountry: string;
    }
  | { readonly applies: false; readonly reason: "skipped" | "off" | "not-business" }
  | { readonly applies: false; readonly reason: "domestic"; readonly country: string };

/**
 * Section 2.1: the reverse charge applies when the per-invoice option is `apply`, or when it is
 * `auto`, the mode is `foreign-business-clients`, the client is a `business` and its country
 * differs from the supplier's. Countries are compared as codes only: the pack does not know the
 * EU, VAT registration or the place-of-supply rules (the trace says so).
 */
export function reverseChargeDecision(
  settings: GenericConfig["reverseCharge"],
  option: ReverseChargeOption,
  client: ClientInput,
): ReverseChargeDecision {
  if (option === "apply") return { applies: true, reason: "forced" };
  if (option === "skip") return { applies: false, reason: "skipped" };
  const supplierCountry = settings.supplierCountry;
  // The schema requires supplierCountry unless the mode is "off"; checked again defensively.
  if (settings.mode === "off" || supplierCountry === undefined) {
    return { applies: false, reason: "off" };
  }
  if (client.kind !== "business") return { applies: false, reason: "not-business" };
  if (client.country === supplierCountry) {
    return { applies: false, reason: "domestic", country: supplierCountry };
  }
  return {
    applies: true,
    reason: "foreign-business",
    clientCountry: client.country,
    supplierCountry,
  };
}

/** The trace step of a reverse-charge decision; none when the feature is off. */
function reverseChargeStep(
  decision: ReverseChargeDecision,
  label: MessageParam,
): TraceDraft | undefined {
  switch (decision.reason) {
    case "off":
      return undefined;
    case "forced":
      return {
        message: message("generic.trace.reverse-charge.forced", { label }),
        sources: reverseChargeSources,
      };
    case "foreign-business":
      return {
        message: message("generic.trace.reverse-charge.foreign-business", {
          label,
          clientCountry: p.text(decision.clientCountry),
          supplierCountry: p.text(decision.supplierCountry),
        }),
        sources: reverseChargeSources,
      };
    case "skipped":
      return {
        message: message("generic.trace.reverse-charge.skipped"),
        sources: configurationSources,
      };
    case "not-business":
      return {
        message: message("generic.trace.reverse-charge.not-business"),
        sources: configurationSources,
      };
    case "domestic":
      return {
        message: message("generic.trace.reverse-charge.domestic", {
          country: p.text(decision.country),
        }),
        sources: configurationSources,
      };
  }
}

function addOnce(list: string[], text: string): void {
  if (!list.includes(text)) list.push(text);
}

/** One legal note per text, numbered in order: `generic.note.exempt.1`, ... */
function numberedNotes(prefix: string, texts: readonly string[]): LegalNoteDraft[] {
  return texts.map((text, index) => ({
    id: `${prefix}.${index + 1}`,
    message: message("generic.note.custom", { text: p.text(text) }),
    sources: configurationSources,
  }));
}

export const classifyLinesRule: GenericRule = {
  id: CLASSIFY_LINES_RULE_ID,
  title: message("generic.rule.classify-lines.title"),
  sources: reverseChargeSources,
  apply: (state, ctx) => {
    const { config } = ctx;
    const label = p.text(config.taxLabel);
    const decision = reverseChargeDecision(
      config.reverseCharge,
      ctx.options.reverseCharge,
      ctx.input.client,
    );
    const reverseCharge = config.tax.kind === "rate" && decision.applies;

    const taxable = new Map<string, Decimal>();
    const used = new Set<FixedGroupId>();
    const assignments: [string, string][] = [];
    const exemptTexts: string[] = [];
    const outOfScopeTexts: string[] = [];
    let exemptWithoutReference = false;
    let chargeable = false; // a standard or rate line, which the tax or the reverse charge concerns

    for (const line of state.lines) {
      const { treatment } = line;
      const placement = classifyLine(treatment, config.tax, reverseCharge);
      if (placement.group === "taxable") {
        const id = taxGroupId(placement.rate);
        taxable.set(id, placement.rate);
        assignments.push([line.id, id]);
      } else {
        used.add(placement.group);
        assignments.push([line.id, placement.group]);
      }
      if (treatment.kind === "standard" || treatment.kind === "rate") chargeable = true;
      if (treatment.kind === "exempt") {
        if (treatment.reference === undefined) exemptWithoutReference = true;
        else addOnce(exemptTexts, treatment.reference);
      }
      if (treatment.kind === "out-of-scope" && treatment.reference !== undefined) {
        addOnce(outOfScopeTexts, treatment.reference);
      }
    }
    if (exemptWithoutReference && config.exemptNote !== undefined) {
      addOnce(exemptTexts, config.exemptNote);
    }

    // Taxable groups from the highest rate down, then the fixed groups in summary order.
    const groups: TaxGroup[] = [...taxable.values()]
      .sort((a, b) => compareDecimal(b, a))
      .map((rate) => taxableGroup(rate, label));
    for (const id of FIXED_GROUP_IDS) if (used.has(id)) groups.push(fixedGroup(id, label));

    const legalNotes: LegalNoteDraft[] = [];
    if (used.has("reverse-charge")) {
      legalNotes.push({
        id: "generic.note.reverse-charge",
        message: message("generic.note.custom", { text: p.text(config.reverseCharge.note) }),
        sources: reverseChargeSources,
      });
    }
    legalNotes.push(
      ...numberedNotes("generic.note.exempt", exemptTexts),
      ...numberedNotes("generic.note.out-of-scope", outOfScopeTexts),
    );

    const warnings: WarningDraft[] = [];
    if (exemptWithoutReference && config.exemptNote === undefined) {
      warnings.push({
        code: "generic.exempt-without-note",
        severity: "warning",
        message: message("generic.warning.exempt-without-note"),
      });
    }
    if (used.has("reverse-charge") && ctx.input.client.vatId === undefined) {
      warnings.push({
        code: "generic.reverse-charge-without-vat-id",
        severity: "warning",
        message: message("generic.warning.reverse-charge-without-vat-id"),
      });
    }

    const trace: TraceDraft[] = [
      {
        message: message("generic.trace.classify", {
          count: p.decimal(decimalFromInteger(BigInt(state.lines.length))),
        }),
        sources: configurationSources,
      },
    ];
    if (config.tax.kind === "none") {
      trace.push({
        message: message("generic.trace.no-tax", { label }),
        sources: configurationSources,
      });
    } else if (chargeable) {
      const step = reverseChargeStep(decision, label);
      if (step !== undefined) trace.push(step);
    }

    return {
      groups,
      // Object.fromEntries defines own properties, so even a line id "__proto__" is safe.
      lineGroups: Object.fromEntries(assignments),
      legalNotes,
      warnings,
      trace,
    };
  },
};
