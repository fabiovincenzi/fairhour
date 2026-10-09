import { z } from "zod";

/** Backlog IDs look like `CORE-012` or `LAUNCH-003`. */
export const backlogIdSchema = z
  .string()
  .regex(/^[A-Z]+-\d{3}$/, "backlog IDs look like CORE-012");

export const labelSchema = z
  .object({
    name: z.string().min(1).max(50),
    color: z
      .string()
      .regex(/^[0-9a-fA-F]{6}$/, "color is a 6-digit hex value without #"),
    description: z.string().max(100).default(""),
  })
  .strict();

export const labelsFileSchema = z.array(labelSchema).min(1);

export const milestoneSchema = z
  .object({
    title: z.string().min(1).max(100),
    description: z.string().default(""),
    due_on: z.iso.date().optional(),
  })
  .strict();

export const milestonesFileSchema = z.array(milestoneSchema).min(1);

export const ISSUE_TYPES = [
  "bug",
  "feature",
  "docs",
  "chore",
  "refactor",
  "security",
  "epic",
] as const;
export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export const SIZES = ["S", "M", "L", "XL"] as const;
export const STATUSES = ["triage", "ready", "blocked", "in-progress"] as const;

export const backlogItemSchema = z
  .object({
    id: backlogIdSchema,
    title: z.string().min(5).max(256),
    type: z.enum(ISSUE_TYPES),
    areas: z.array(z.string().min(1)).min(1),
    priority: z.enum(PRIORITIES),
    size: z.enum(SIZES),
    status: z.enum(STATUSES),
    labels: z.array(z.string().min(1)).default([]),
    milestone: z.string().min(1).optional(),
    state: z.enum(["open", "done"]).default("open"),
    depends_on: z.array(backlogIdSchema).default([]),
    children: z.array(backlogIdSchema).default([]),
    body: z.string().min(1),
    acceptance: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const backlogFileSchema = z
  .object({
    milestone: z.string().min(1).optional(),
    items: z.array(backlogItemSchema).min(1),
  })
  .strict();

export type LabelDef = z.infer<typeof labelSchema>;
export type MilestoneDef = z.infer<typeof milestoneSchema>;
export type BacklogItemDef = z.infer<typeof backlogItemSchema>;
export type BacklogFile = z.infer<typeof backlogFileSchema>;

/** A backlog item with its labels and milestone resolved, ready to sync. */
export interface ResolvedItem {
  readonly id: string;
  readonly title: string;
  readonly type: BacklogItemDef["type"];
  readonly labels: readonly string[];
  readonly milestone: string | undefined;
  readonly done: boolean;
  readonly dependsOn: readonly string[];
  readonly children: readonly string[];
  readonly body: string;
  readonly acceptance: readonly string[];
  /** Path of the YAML file relative to the repository root. */
  readonly sourceFile: string;
}

export interface Backlog {
  readonly labels: readonly LabelDef[];
  readonly milestones: readonly MilestoneDef[];
  readonly items: readonly ResolvedItem[];
}
