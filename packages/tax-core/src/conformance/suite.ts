import { describe, expect, test } from "vitest";
import { listParameters, parametersToJson } from "../engine/parameters";
import type { PackFacts, TaxPack } from "../pack/types";
import {
  CONFORMANCE_CHECK_IDS,
  runConformanceCheck,
  type ConformanceCheckId,
  type ConformanceOptions,
} from "./checks";

/** Generous: property checks compute hundreds of invoices, and CI machines are shared. */
const PROPERTY_TIMEOUT_MS = 120_000;
const CHECK_TIMEOUT_MS = 30_000;

function timeoutOf(id: ConformanceCheckId): number {
  return id.startsWith("property.") || id === "thresholds.contract" || id === "fixtures.golden"
    ? PROPERTY_TIMEOUT_MS
    : CHECK_TIMEOUT_MS;
}

/**
 * Registers a vitest `describe` block named `conformance: <pack id>` with one test per check of
 * design section 5. Every check is mandatory; there is no option to skip one. Informational
 * findings (sources still to be verified) are attached to their test as annotations.
 */
export function defineConformanceSuite<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
  options: ConformanceOptions,
): void {
  describe(`conformance: ${pack.meta.id}`, () => {
    for (const id of CONFORMANCE_CHECK_IDS) {
      test(
        id,
        async (context) => {
          const result = runConformanceCheck(pack, options, id);
          for (const note of result.notes) await context.annotate(note, "notice");
          if (id === "parameters.snapshot") {
            // Editing a released parameter version changes this snapshot, so it shows up in review.
            expect(parametersToJson(listParameters(pack))).toMatchSnapshot();
          }
          expect(result.failures).toEqual([]);
        },
        timeoutOf(id),
      );
    }
  });
}
