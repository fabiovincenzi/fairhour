import { zero, type CurrencyCode } from "@fairhour/money";
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
import { copyMessage } from "../internal/copy";
import {
  clonePlain,
  isPlainObject,
  nullPrototypeRecord,
  ownValue,
  setOwn,
} from "../internal/records";
import { toSchemaIssues } from "../internal/zod-issues";
import { message, p } from "../messages/params";
import { messageRefProblem } from "../messages/validate";
import type { InvoiceInput } from "../input/types";
import { copyRoundingPolicy, roundingPolicyProblems } from "../pack/rounding";
import type { ComputationState, RuleContext } from "../pack/rule";
import type { FactValue, InputIssue, PackFacts, RoundingPolicy, TaxPack } from "../pack/types";
import { ENGINE_VERSION } from "../version";
import { deepFreeze } from "./freeze";
import { coreStep, computeNetLines, lineSteps } from "./lines";
import { checkRuleSources, copyFactValue, mergeRuleOutput } from "./merge";
import { resolveParameters } from "./parameters";
import { assertReconciled } from "./reconcile";
import { deriveTotals } from "./summary";

/**
 * The pack's initial facts, checked like the facts a rule sets (a FactValue, Money in the
 * invoice currency) and copied. @throws RuleContractError("core", "invalid-fact")
 */
function initialFacts<F extends PackFacts>(facts: F, currency: CurrencyCode): F {
  if (!isPlainObject(facts)) {
    throw new RuleContractError("core", "invalid-fact", "initialFacts must be a plain object");
  }
  const result: Record<string, FactValue> = {};
  for (const [key, value] of Object.entries(facts)) {
    setOwn(result, key, copyFactValue("core", key, value, currency));
  }
  return result as F;
}

/** A path segment of an InputIssue: a property name or an array index. */
function isPathSegment(value: unknown): value is string | number {
  return typeof value === "string" || (Number.isSafeInteger(value) && (value as number) >= 0);
}

/**
 * The issues returned by `pack.validateInput`, checked and copied (deeply frozen).
 * @throws RuleContractError("core", "invalid-output") for anything that is not an InputIssue[]
 */
function inputIssues(value: unknown): readonly InputIssue[] {
  const fail = (detail: string): never => {
    throw new RuleContractError("core", "invalid-output", `validateInput: ${detail}`);
  };
  if (!Array.isArray(value)) return fail("must return an array of InputIssue");
  return deepFreeze(
    (value as readonly unknown[]).map((raw, index): InputIssue => {
      if (!isPlainObject(raw)) return fail(`issue ${index} is not an object`);
      const { path, code } = raw;
      if (!Array.isArray(path) || !(path as readonly unknown[]).every(isPathSegment)) {
        return fail(`issue ${index}: path must list property names and array indexes`);
      }
      if (typeof code !== "string" || code.length === 0) {
        return fail(`issue ${index}: code is empty`);
      }
      const problem = messageRefProblem(raw.message);
      if (problem !== undefined) return fail(`issue ${index} "${code}": message: ${problem}`);
      return {
        path: [...(path as readonly (string | number)[])],
        code,
        message: copyMessage(raw.message as InputIssue["message"]),
      };
    }),
  );
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
  if (pack.validateInput !== undefined) {
    let returned: unknown;
    try {
      returned = pack.validateInput(valid, parsed, options);
    } catch (error) {
      throw new RuleExecutionError("core", error, "The pack's validateInput");
    }
    const refusals = inputIssues(returned);
    if (refusals.length > 0) throw new UnsupportedInputError(refusals);
  }

  // 5-6: parameters, rounding policy, context.
  const version = resolveParameters(pack.parameters, pack.meta.id, valid.issueDate);
  let policy: unknown;
  try {
    policy = pack.roundingPolicy(parsed);
  } catch (error) {
    throw new RuleExecutionError("core", error, "The pack's roundingPolicy");
  }
  const problems = roundingPolicyProblems(policy);
  if (problems.length > 0)
    throw new RuleContractError("core", "invalid-rounding-policy", problems.join("; "));
  const rounding = deepFreeze(copyRoundingPolicy(policy as RoundingPolicy));
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
    facts: initialFacts(pack.initialFacts, currency),
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
