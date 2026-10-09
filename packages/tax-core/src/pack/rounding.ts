import { isRoundingMode } from "@fairhour/money";
import { copyMessage } from "../internal/copy";
import { isPlainObject } from "../internal/records";
import { messageRefProblem } from "../messages/validate";
import type { RoundingPolicy } from "./types";

function modeProblem(
  policy: Readonly<Record<string, unknown>>,
  part: "lines" | "contributions" | "taxes" | "withholdings",
  scopes: readonly string[] | undefined,
): string | undefined {
  const value = policy[part];
  if (!isPlainObject(value)) return `${part} is missing`;
  if (typeof value.mode !== "string" || !isRoundingMode(value.mode))
    return `${part}.mode is not a RoundingMode`;
  if (scopes !== undefined && (typeof value.scope !== "string" || !scopes.includes(value.scope))) {
    return `${part}.scope must be one of ${scopes.join(", ")}`;
  }
  return undefined;
}

/** Why `policy` is not a valid RoundingPolicy (empty when it is). */
export function roundingPolicyProblems(policy: unknown): readonly string[] {
  if (!isPlainObject(policy)) return ["the rounding policy is not an object"];
  const problems = [
    policy.step === "minor-unit" ? undefined : 'step must be "minor-unit"',
    modeProblem(policy, "lines", undefined),
    modeProblem(policy, "contributions", ["per-group"]),
    modeProblem(policy, "taxes", ["per-group", "per-line"]),
    modeProblem(policy, "withholdings", ["per-document"]),
  ];
  const description = messageRefProblem(policy.description);
  if (description !== undefined) problems.push(`description: ${description}`);
  return problems.filter((problem): problem is string => problem !== undefined);
}

/** A fresh copy (the pack's object is never frozen by the engine). Assumes a valid policy. */
export function copyRoundingPolicy(policy: RoundingPolicy): RoundingPolicy {
  return {
    step: "minor-unit",
    lines: { mode: policy.lines.mode },
    contributions: { mode: policy.contributions.mode, scope: policy.contributions.scope },
    taxes: { mode: policy.taxes.mode, scope: policy.taxes.scope },
    withholdings: { mode: policy.withholdings.mode, scope: policy.withholdings.scope },
    description: copyMessage(policy.description),
  };
}
