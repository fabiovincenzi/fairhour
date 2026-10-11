/**
 * Rule 1, `xx.classify-lines`: puts every line in a tax group. Every pack starts with a rule like
 * this one: the engine requires every line to be assigned to exactly one group, and the later
 * rules compute on the groups.
 *
 * | Line treatment          | VAT-registered                          | Small-business exemption |
 * | ----------------------- | --------------------------------------- | ------------------------ |
 * | `standard`              | `vat-<rate>`, the configured rate       | `small-business`         |
 * | `rate` (explicit)       | `vat-<rate>`, the line's rate           | refused (validateInput)  |
 * | `exempt`                | `exempt`                                | `exempt`                 |
 * | `out-of-scope`          | `out-of-scope`                          | `out-of-scope`           |
 * | `excluded`              | `excluded` (disbursements)              | `excluded`               |
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
  type LineTaxTreatment,
  type TaxGroup,
  type WarningDraft,
} from "@fairhour/tax-core";
import type { XxConfig } from "../config";
import { FIXED_GROUP_IDS, fixedGroup, vatGroup, vatGroupId, type FixedGroupId } from "../groups";
import { vatRate, type XxParams } from "../parameters";
import { vatActExemptions, vatActRates, vatActSmallBusiness } from "../sources";
import type { XxRule } from "../types";

// TEMPLATE: write your country's classification table (in the docs too) and keep this rule's
// shape: decide each line's group with a pure function, register only the groups that receive
// lines, in a canonical order (never the order of the lines), and explain the result in the trace.

export const CLASSIFY_LINES_RULE_ID = "xx.classify-lines";

/** Where a line goes: a taxable group at a rate, or one of the fixed groups. */
export type Placement =
  { readonly group: "vat"; readonly rate: Decimal } | { readonly group: FixedGroupId };

/** One row of the table above. Exported for its table-driven test. */
export function placeLine(
  treatment: LineTaxTreatment,
  config: XxConfig,
  params: XxParams,
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
      if (!config.vatRegistered) return { group: "small-business" };
      return {
        group: "vat",
        rate: normalizeDecimal(
          treatment.kind === "rate" ? treatment.rate : vatRate(params, config.defaultVatRate),
        ),
      };
  }
}

export const classifyLinesRule: XxRule = {
  id: CLASSIFY_LINES_RULE_ID,
  title: message("xx.rule.classify-lines.title"),
  sources: [vatActRates, vatActExemptions, vatActSmallBusiness],
  apply: (state, ctx) => {
    const rates = new Map<string, Decimal>();
    const used = new Set<FixedGroupId>();
    const assignments: [lineId: string, groupId: string][] = [];
    let outOfScopeWithoutReference = false;

    for (const line of state.lines) {
      const placement = placeLine(line.treatment, ctx.config, ctx.params);
      if (placement.group === "vat") {
        const id = vatGroupId(placement.rate);
        rates.set(id, placement.rate);
        assignments.push([line.id, id]);
      } else {
        used.add(placement.group);
        assignments.push([line.id, placement.group]);
      }
      if (line.treatment.kind === "out-of-scope" && line.treatment.reference === undefined) {
        outOfScopeWithoutReference = true;
      }
    }

    // VAT groups from the highest rate down, then the fixed groups in summary order: the same
    // summary whatever the order of the lines (the conformance suite shuffles them).
    const groups: TaxGroup[] = [...rates.values()]
      .sort((a, b) => compareDecimal(b, a))
      .map((rate) => vatGroup(rate));
    for (const id of FIXED_GROUP_IDS) if (used.has(id)) groups.push(fixedGroup(id));

    const warnings: WarningDraft[] = outOfScopeWithoutReference
      ? [
          {
            code: "xx.out-of-scope-without-reference",
            severity: "warning",
            message: message("xx.warning.out-of-scope-without-reference"),
          },
        ]
      : [];

    return {
      groups,
      // Line ids come from the caller: build records keyed by them with Object.fromEntries (it
      // defines own properties), never with `record[line.id] = ...` on an object literal.
      lineGroups: Object.fromEntries(assignments),
      warnings,
      trace: [
        {
          message: message("xx.trace.classify", {
            count: p.decimal(decimalFromInteger(BigInt(state.lines.length))),
          }),
        },
      ],
    };
  },
};
