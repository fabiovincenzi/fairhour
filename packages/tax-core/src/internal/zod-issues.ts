import type * as z from "zod";
import type { SchemaIssue } from "../errors";

/**
 * zod issues as SchemaIssues. A custom issue that carries `params.code` (the engine's own
 * validation codes, such as "invalid-date") keeps that code; other issues keep zod's code.
 */
export function toSchemaIssues(issues: readonly z.core.$ZodIssue[]): readonly SchemaIssue[] {
  return issues.map((issue) => {
    const custom: unknown = issue.code === "custom" ? issue.params?.code : undefined;
    return {
      path: issue.path.map((segment) => (typeof segment === "number" ? segment : String(segment))),
      code: typeof custom === "string" ? custom : issue.code,
      message: issue.message,
    };
  });
}
