import type { Money } from "@fairhour/money";
import * as z from "zod";
import type { InvoiceComputation } from "../computation/types";
import { computeInvoice } from "../engine/compute";
import { deepFreeze } from "../engine/freeze";
import {
  listParameters,
  parametersToJson,
  type ParameterTimelineEntryJson,
} from "../engine/parameters";
import { InvalidConfigError, type SchemaIssue } from "../errors";
import type { InvoiceInput } from "../input/types";
import { toJsonValue } from "../internal/json";
import { isPlainObject } from "../internal/records";
import { toSchemaIssues } from "../internal/zod-issues";
import { coreMessages } from "../messages/core-messages";
import { mergeCatalogs } from "../messages/merge";
import type { MessageCatalogs } from "../messages/types";
import type { JsonValue } from "../primitives";
import type { RevenueStatus, RevenueTrackerInput } from "../thresholds/types";
import type { PackFacts, PackMeta, RoundingPolicy, TaxPack } from "./types";

/** A type-erased registry entry: every pack behind the same interface (design 4.6). */
export interface PackHandle {
  readonly meta: PackMeta;
  readonly messages: MessageCatalogs; // merged with the core catalog
  readonly configJsonSchema: Readonly<Record<string, JsonValue>>; // z.toJSONSchema(configSchema)
  readonly parseConfig: (
    config: unknown,
  ) =>
    | { readonly ok: true; readonly config: JsonValue }
    | { readonly ok: false; readonly issues: readonly SchemaIssue[] };
  readonly compute: (config: unknown, input: InvoiceInput) => InvoiceComputation;
  readonly listParameters: () => readonly ParameterTimelineEntryJson[];
  readonly roundingPolicy: (config: unknown) => RoundingPolicy; // throws InvalidConfigError
  readonly annualThresholds?: {
    readonly countableRevenue: (config: unknown, computation: InvoiceComputation) => Money;
    readonly evaluate: (config: unknown, input: RevenueTrackerInput) => RevenueStatus;
  };
}

/**
 * The configuration's JSON Schema for the settings form: the *input* side, so that fields with
 * defaults are optional. @throws Error when the schema is not representable (a pack bug).
 */
export function configJsonSchema(schema: z.ZodType): Readonly<Record<string, JsonValue>> {
  const json = toJsonValue(z.toJSONSchema(schema, { io: "input" }));
  if (!isPlainObject(json)) throw new TypeError("z.toJSONSchema did not return an object");
  return deepFreeze(json as Readonly<Record<string, JsonValue>>);
}

export function toPackHandle<C, P, F extends PackFacts, O>(pack: TaxPack<C, P, F, O>): PackHandle {
  const parse = (config: unknown): C => {
    const result = pack.configSchema.safeParse(config);
    if (!result.success) throw new InvalidConfigError(toSchemaIssues(result.error.issues));
    return result.data;
  };
  const thresholds = pack.capabilities.annualThresholds;
  const handle: PackHandle = {
    meta: pack.meta,
    messages: mergeCatalogs(coreMessages, pack.messages),
    configJsonSchema: configJsonSchema(pack.configSchema),
    parseConfig: (config) => {
      const result = pack.configSchema.safeParse(config);
      return result.success
        ? { ok: true, config: toJsonValue(result.data) }
        : { ok: false, issues: toSchemaIssues(result.error.issues) };
    },
    compute: (config, input) => computeInvoice(pack, config, input),
    listParameters: () => parametersToJson(listParameters(pack)),
    roundingPolicy: (config) => pack.roundingPolicy(parse(config)),
    ...(thresholds === undefined
      ? {}
      : {
          annualThresholds: {
            countableRevenue: (config: unknown, computation: InvoiceComputation) =>
              thresholds.countableRevenue(parse(config), computation),
            evaluate: (config: unknown, input: RevenueTrackerInput) =>
              thresholds.evaluate(parse(config), input),
          },
        }),
  };
  return Object.freeze(handle);
}
