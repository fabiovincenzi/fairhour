import { isDecimal, isMoney, zero } from "@fairhour/money";
import {
  ENGINE_NAME,
  type ComputedLine,
  type InvoiceComputation,
  type Warning,
} from "../computation/types";
import {
  InvalidConfigError,
  InvalidOptionsError,
  RuleContractError,
  RuleExecutionError,
  UnsupportedInputError,
} from "../errors";
import { validateInvoiceInput } from "../input/schema";
import { copyDecimal, copyMoney } from "../internal/copy";
import { clonePlain, nullPrototypeRecord, ownValue, setOwn } from "../internal/records";
import { toSchemaIssues } from "../internal/zod-issues";
import { message, p } from "../messages/params";
import type { InvoiceInput } from "../input/types";
import { copyRoundingPolicy, roundingPolicyProblems } from "../pack/rounding";
import type { ComputationState, RuleContext } from "../pack/rule";
import type { FactValue, PackFacts, TaxPack } from "../pack/types";
import { ENGINE_VERSION } from "../version";
import { deepFreeze } from "./freeze";
import { coreStep, computeNetLines, lineSteps } from "./lines";
import { checkRuleSources, mergeRuleOutput } from "./merge";
import { resolveParameters } from "./parameters";
import { assertReconciled } from "./reconcile";
import { deriveTotals } from "./summary";

function copyFacts<F extends PackFacts>(facts: F): F {
  const result: Record<string, FactValue> = {};
  for (const [key, value] of Object.entries(facts)) {
    setOwn(
      result,
      key,
      isMoney(value) ? copyMoney(value) : isDecimal(value) ? copyDecimal(value) : value,
    );
  }
  return result as F;
}

/**
 * Computes an invoice with a pack: validates the input, the configuration and the per-invoice
 * options, resolves the parameters for the issue date, computes line totals, runs the rules
 * (append-only, contract-checked), derives the tax summary and the totals, asserts R1 to R8 and
 * returns a deeply frozen computation. Pure and deterministic (design 4.9).
 *
 * @throws InvalidInputError, InvalidConfigError, InvalidOptionsError, UnsupportedInputError,
 *         ParameterNotFoundError, RuleExecutionError, RuleContractError, ReconciliationError
 */
export function computeInvoice<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
  config: unknown,
  input: InvoiceInput,
): InvoiceComputation {
  // 1-4: validation.
  const valid = validateInvoiceInput(input);
  const parsedConfig = pack.configSchema.safeParse(config);
  if (!parsedConfig.success)
    throw new InvalidConfigError(toSchemaIssues(parsedConfig.error.issues));
  const parsedOptions = pack.invoiceOptionsSchema.safeParse(valid.options ?? {});
  if (!parsedOptions.success)
    throw new InvalidOptionsError(toSchemaIssues(parsedOptions.error.issues));
  // Copies: the engine freezes what rules can see, and must not freeze the caller's objects.
  const parsed: C = deepFreeze(clonePlain(parsedConfig.data));
  const options: O = deepFreeze(clonePlain(parsedOptions.data));
  const refusals = pack.validateInput?.(valid, parsed, options) ?? [];
  if (refusals.length > 0) throw new UnsupportedInputError(refusals);

  // 5-6: parameters, rounding policy, context.
  const version = resolveParameters(pack.parameters, pack.meta.id, valid.issueDate);
  const policy: unknown = pack.roundingPolicy(parsed);
  const problems = roundingPolicyProblems(policy);
  if (problems.length > 0)
    throw new RuleContractError("core", "invalid-rounding-policy", problems.join("; "));
  const rounding = deepFreeze(
    copyRoundingPolicy(policy as ReturnType<TaxPack<C, P, F, O>["roundingPolicy"]>),
  );
  const currency = valid.currency;
  const parameterVersion = deepFreeze({ id: version.id, effectiveFrom: version.effectiveFrom });
  const ctx: RuleContext<C, P, O> = Object.freeze({
    input: valid,
    config: parsed,
    options,
    params: version.params,
    parameterVersion,
    rounding,
    currency,
    zero: zero(currency),
  });

  // 7: line totals.
  const lines = computeNetLines(valid, rounding.lines.mode);
  const { steps, subtotal } = lineSteps(lines, currency);
  const warnings: Warning[] =
    lines.length === 0
      ? [
          {
            code: "core.no-lines",
            severity: "warning",
            ruleId: "core",
            message: message("core.no-lines"),
          },
        ]
      : [];
  let state: ComputationState<F> = deepFreeze({
    lines,
    groups: [],
    lineGroups: nullPrototypeRecord<string>(),
    components: [],
    legalNotes: [],
    warnings,
    trace: steps,
    facts: copyFacts(pack.initialFacts),
  });

  // 8: the rules, in order.
  for (const rule of pack.rules) {
    checkRuleSources(rule.id, rule.sources);
    let applies: unknown = true;
    if (rule.appliesTo !== undefined) {
      try {
        applies = rule.appliesTo(ctx);
      } catch (error) {
        throw new RuleExecutionError(rule.id, error);
      }
    }
    if (typeof applies !== "boolean") {
      throw new RuleContractError(rule.id, "invalid-output", "appliesTo must return a boolean");
    }
    if (!applies) continue;
    let output: unknown;
    try {
      output = rule.apply(state, ctx);
    } catch (error) {
      throw new RuleExecutionError(rule.id, error);
    }
    state = mergeRuleOutput(state, output, rule, currency);
  }

  // 9: every line is in a group (R6).
  const groupOf = (lineId: string): string => {
    const groupId = ownValue(state.lineGroups, lineId);
    if (groupId === undefined) {
      throw new RuleContractError(
        "core",
        "unassigned-line",
        `line "${lineId}" is not assigned to a tax group`,
      );
    }
    return groupId;
  };
  const computedLines = lines.map((line): ComputedLine => ({ ...line, groupId: groupOf(line.id) }));

  // 10: summary, totals and their trace steps.
  const totals = deriveTotals(state, subtotal, currency);
  const trace = [...state.trace];
  trace.push(
    coreStep(
      trace.length + 1,
      message("core.total", { amount: p.money(totals.total) }),
      totals.total,
    ),
  );
  if (totals.hasDeductions) {
    trace.push(
      coreStep(
        trace.length + 1,
        message("core.deductions", { amount: p.money(totals.deductions) }),
        totals.deductions,
      ),
    );
  }
  trace.push(
    coreStep(
      trace.length + 1,
      message("core.net-payable", { amount: p.money(totals.netPayable) }),
      totals.netPayable,
    ),
  );

  // 11-12: the result, in the key order of InvoiceComputation, reconciled and frozen.
  const computation: InvoiceComputation = {
    schemaVersion: 1,
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
    pack: { id: pack.meta.id, version: pack.meta.version },
    parameters: parameterVersion,
    issueDate: valid.issueDate,
    documentKind: valid.documentKind,
    currency,
    client: valid.client,
    ...(valid.exchangeRates === undefined ? {} : { exchangeRates: valid.exchangeRates }),
    lines: computedLines,
    subtotal,
    components: state.components,
    vatSummary: totals.vatSummary,
    taxableBase: totals.taxableBase,
    taxTotal: totals.taxTotal,
    total: totals.total,
    withholdingTotal: totals.withholdingTotal,
    netPayable: totals.netPayable,
    legalNotes: state.legalNotes,
    warnings: state.warnings,
    trace,
  };
  assertReconciled(computation);
  return deepFreeze(computation);
}
