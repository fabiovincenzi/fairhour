/**
 * Parameter versions of the generic pack (docs/tax-packs/generic.md, section 2.5).
 *
 * The pack applies no country's law, so it has no legal parameters: every rate, label and
 * wording comes from the workspace configuration. The engine still needs one version to resolve
 * (and the trace records its id), so there is a single version, effective from the first date
 * the engine accepts, with empty parameters. It cites the user's configuration as its source
 * (kind `user-configuration`, the source kind tax-core defines for exactly this case).
 *
 * Append-only: never edit a released version, add a new one.
 */
import { isoDate, type ParameterVersion } from "@fairhour/tax-core";
import { deepFreeze } from "./freeze";
import { configurationSources } from "./sources";

/** No legal values: everything is configuration. */
export type GenericParams = Readonly<Record<string, never>>;

const NO_PARAMETERS: GenericParams = {};

export const GENERIC_PARAMETERS: readonly ParameterVersion<GenericParams>[] = deepFreeze([
  {
    id: "generic-v1",
    effectiveFrom: isoDate("1900-01-01"),
    params: NO_PARAMETERS,
    sources: configurationSources,
    changes: [
      "Initial version. The generic pack has no legal parameters: every rate, label and wording comes from the workspace's tax settings.",
    ],
  },
]);
