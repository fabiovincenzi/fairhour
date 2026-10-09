import { ParameterNotFoundError } from "../errors";
import { toJsonValue } from "../internal/json";
import type { PackFacts, ParameterVersion, TaxPack } from "../pack/types";
import { addDays, compareIsoDate, type IsoDate, type JsonValue } from "../primitives";
import { copySource, type SourceRef } from "../sources";

export { toJsonValue };

/**
 * The latest version with `effectiveFrom ≤ date` (the input order does not matter; the
 * conformance suite separately requires it to be strictly increasing).
 * @throws ParameterNotFoundError
 */
export function resolveParameters<P>(
  parameters: readonly ParameterVersion<P>[],
  packId: string,
  date: IsoDate,
): ParameterVersion<P> {
  let found: ParameterVersion<P> | undefined;
  let first: IsoDate | undefined;
  for (const version of parameters) {
    if (first === undefined || compareIsoDate(version.effectiveFrom, first) < 0) {
      first = version.effectiveFrom;
    }
    if (
      compareIsoDate(version.effectiveFrom, date) <= 0 &&
      (found === undefined || compareIsoDate(version.effectiveFrom, found.effectiveFrom) > 0)
    ) {
      found = version;
    }
  }
  if (found === undefined) throw new ParameterNotFoundError(packId, date, first);
  return found;
}

export interface ParameterTimelineEntry<P> extends ParameterVersion<P> {
  /** Inclusive last day (the day before the next version), absent for the current version. */
  readonly effectiveUntil?: IsoDate;
}

/** The pack's parameter versions in effective order, each with its last day. */
export function listParameters<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
): readonly ParameterTimelineEntry<P>[] {
  const sorted = [...pack.parameters].sort((a, b) =>
    compareIsoDate(a.effectiveFrom, b.effectiveFrom),
  );
  return sorted.map((version, index): ParameterTimelineEntry<P> => {
    const next = sorted[index + 1];
    return {
      id: version.id,
      effectiveFrom: version.effectiveFrom,
      ...(next === undefined ? {} : { effectiveUntil: addDays(next.effectiveFrom, -1) }),
      params: version.params,
      sources: version.sources,
      changes: version.changes,
    };
  });
}

export interface ParameterTimelineEntryJson {
  readonly id: string;
  readonly effectiveFrom: IsoDate;
  readonly effectiveUntil?: IsoDate;
  readonly params: JsonValue;
  readonly sources: readonly SourceRef[];
  readonly changes: readonly string[];
}

/** Decimal/Price become decimal strings, Money becomes MoneyJson; key order preserved. */
export function parametersToJson<P>(
  timeline: readonly ParameterTimelineEntry<P>[],
): readonly ParameterTimelineEntryJson[] {
  return timeline.map((entry) => ({
    id: entry.id,
    effectiveFrom: entry.effectiveFrom,
    ...(entry.effectiveUntil === undefined ? {} : { effectiveUntil: entry.effectiveUntil }),
    params: toJsonValue(entry.params),
    sources: entry.sources.map(copySource),
    changes: [...entry.changes],
  }));
}
