import { decimalSchema, moneyJsonSchema } from "@fairhour/money/zod";
import * as z from "zod";
import { type BillingMode, dayRateModeProblem } from "./billing";

/**
 * Validates untrusted configuration (project settings, API input) into a `BillingMode`: amounts
 * and decimals are strings (`{ "kind": "fixed", "amount": { "amount": "1500.00", "currency":
 * "EUR" } }`), a day rate needs `0 < halfDayMaxHours <= hoursPerDay`.
 */
export const billingModeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hourly") }),
  z.strictObject({ kind: z.literal("fixed"), amount: moneyJsonSchema }),
  z
    .strictObject({
      kind: z.literal("day-rate"),
      hoursPerDay: decimalSchema,
      halfDayMaxHours: decimalSchema,
    })
    .refine((mode) => dayRateModeProblem(mode) === undefined, {
      error: "A day rate needs 0 < halfDayMaxHours <= hoursPerDay",
    }),
]) satisfies z.ZodType<BillingMode>;
