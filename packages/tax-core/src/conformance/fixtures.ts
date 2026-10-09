import {
  decimal,
  decimalEquals,
  decimalToString,
  toDecimalString,
  tryDecimal,
  type Decimal,
  type Money,
} from "@fairhour/money";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { InvoiceComputation } from "../computation/types";
import { computeInvoice } from "../engine/compute";
import { TaxEngineError } from "../errors";
import { GoldenFixtureSchema, type GoldenFixture } from "../fixtures/schema";
import { parseInvoiceInput } from "../input/json";
import type { PackFacts, TaxPack } from "../pack/types";
import { canonicalJson, errorText } from "./util";

/** A fixture as found: from a file (with its name) or given inline. */
export interface FixtureEntry {
  readonly file?: string;
  readonly json: unknown;
}

/**
 * Reads every `*.json` file of `dir` (sorted by name). Unreadable or non-JSON files are returned
 * as failures, so that the schema check reports them.
 */
export function loadFixtureFiles(dir: string): {
  readonly entries: readonly FixtureEntry[];
  readonly failures: readonly string[];
} {
  let names: string[];
  try {
    names = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    return { entries: [], failures: [`cannot read fixturesDir ${dir}: ${errorText(error)}`] };
  }
  const entries: FixtureEntry[] = [];
  const failures: string[] = [];
  for (const name of names) {
    try {
      entries.push({
        file: name,
        json: JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown,
      });
    } catch (error) {
      failures.push(`${name}: not valid JSON (${errorText(error)})`);
    }
  }
  return { entries, failures };
}

export function fixtureLabel(entry: FixtureEntry, index: number): string {
  return entry.file ?? `fixtures[${index}]`;
}

/** Schema problems of one fixture (empty when valid), and the parsed fixture. */
export function validateFixture(
  entry: FixtureEntry,
  packId: string,
): { readonly fixture?: GoldenFixture; readonly problems: readonly string[] } {
  const parsed = GoldenFixtureSchema.safeParse(entry.json);
  if (!parsed.success) {
    return {
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  const problems: string[] = [];
  if (entry.file !== undefined && parsed.data.name !== basename(entry.file, ".json")) {
    problems.push(`name "${parsed.data.name}" differs from the file name`);
  }
  if (parsed.data.pack !== packId) problems.push(`pack "${parsed.data.pack}" is not "${packId}"`);
  return { fixture: parsed.data, problems };
}

function issueCodesOf(error: TaxEngineError): readonly string[] {
  if ("issues" in error && Array.isArray(error.issues)) {
    return (error.issues as readonly { readonly code: string }[]).map((issue) => issue.code);
  }
  return [];
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

class Matcher {
  readonly failures: string[] = [];

  amount(what: string, expected: string | undefined, actual: Money): void {
    if (expected !== undefined && expected !== toDecimalString(actual)) {
      this.failures.push(`${what}: expected ${expected}, got ${toDecimalString(actual)}`);
    }
  }

  rate(what: string, expected: string | undefined, actual: Decimal | undefined): void {
    if (expected === undefined) return;
    const wanted = tryDecimal(expected) ?? decimal("0");
    if (actual === undefined || !decimalEquals(wanted, actual)) {
      this.failures.push(
        `${what}: expected rate ${expected}, got ${actual === undefined ? "none" : decimalToString(actual)}`,
      );
    }
  }

  value(what: string, expected: unknown, actual: unknown): void {
    if (expected !== undefined && canonicalJson(expected) !== canonicalJson(actual)) {
      this.failures.push(
        `${what}: expected ${canonicalJson(expected)}, got ${canonicalJson(actual)}`,
      );
    }
  }
}

/** Compares a computation with a fixture's `expected` subset (design section 6). */
export function matchExpected(
  expected: NonNullable<GoldenFixture["expected"]>,
  c: InvoiceComputation,
): readonly string[] {
  const m = new Matcher();
  m.value("parameters", expected.parameters, c.parameters.id);
  for (const line of expected.lines ?? []) {
    const actual = c.lines.find((candidate) => candidate.id === line.id);
    if (actual === undefined) {
      m.failures.push(`line "${line.id}" is missing`);
      continue;
    }
    m.amount(`line "${line.id}" net`, line.net, actual.net);
    m.value(`line "${line.id}" groupId`, line.groupId, actual.groupId);
  }
  m.amount("subtotal", expected.subtotal, c.subtotal);
  if (expected.components !== undefined) {
    if (expected.componentsExhaustive) {
      m.value(
        "component ids",
        expected.components.map((component) => component.id),
        c.components.map((component) => component.id),
      );
    }
    for (const component of expected.components) {
      const actual = c.components.find((candidate) => candidate.id === component.id);
      if (actual === undefined) {
        m.failures.push(`component "${component.id}" is missing`);
        continue;
      }
      const at = `component "${component.id}"`;
      m.value(`${at} kind`, component.kind, actual.kind);
      m.value(`${at} effect`, component.effect, actual.effect);
      m.amount(`${at} base`, component.base, actual.base);
      m.rate(at, component.rate, actual.rate);
      m.amount(`${at} amount`, component.amount, actual.amount);
      m.value(
        `${at} allocations`,
        component.allocations,
        actual.allocations.map((allocation) => ({
          groupId: allocation.groupId,
          base: toDecimalString(allocation.base),
          amount: toDecimalString(allocation.amount),
        })),
      );
      m.value(`${at} exportCodes`, component.exportCodes, actual.exportCodes ?? {});
    }
  }
  if (expected.vatSummary !== undefined) {
    m.value(
      "vatSummary groups",
      expected.vatSummary.map((entry) => entry.groupId),
      c.vatSummary.map((entry) => entry.groupId),
    );
    for (const entry of expected.vatSummary) {
      const actual = c.vatSummary.find((candidate) => candidate.groupId === entry.groupId);
      if (actual === undefined) continue;
      const at = `vatSummary "${entry.groupId}"`;
      m.value(`${at} treatment`, entry.treatment, actual.treatment);
      m.rate(at, entry.rate, actual.rate);
      m.amount(`${at} base`, entry.base, actual.base);
      m.amount(`${at} tax`, entry.tax, actual.tax);
    }
  }
  m.amount("taxableBase", expected.taxableBase, c.taxableBase);
  m.amount("taxTotal", expected.taxTotal, c.taxTotal);
  m.amount("total", expected.total, c.total);
  m.amount("withholdingTotal", expected.withholdingTotal, c.withholdingTotal);
  m.amount("netPayable", expected.netPayable, c.netPayable);
  m.value(
    "legalNotes",
    expected.legalNotes,
    c.legalNotes.map((note) => note.id),
  );
  m.value(
    "warnings",
    expected.warnings,
    c.warnings.map((warning) => warning.code),
  );
  if (expected.traceRuleIds !== undefined) {
    const collapsed = c.trace
      .map((step) => step.ruleId)
      .filter((ruleId, index, all) => index === 0 || all[index - 1] !== ruleId);
    m.value("traceRuleIds", expected.traceRuleIds, collapsed);
  }
  return m.failures;
}

/** Runs one fixture: computes it and compares with `expected`, or checks `expectedError`. */
export function runFixture<C, P, F extends PackFacts, O>(
  pack: TaxPack<C, P, F, O>,
  fixture: GoldenFixture,
): readonly string[] {
  let computation: InvoiceComputation | undefined;
  let failure: unknown;
  try {
    computation = computeInvoice(pack, fixture.config, parseInvoiceInput(fixture.input));
  } catch (error) {
    failure = error;
  }
  const expectedError = fixture.expectedError;
  if (expectedError !== undefined) {
    if (computation !== undefined)
      return [`expected the error "${expectedError.code}", but it computed`];
    if (!(failure instanceof TaxEngineError))
      return [`expected "${expectedError.code}", got ${errorText(failure)}`];
    if (failure.code !== expectedError.code)
      return [`expected "${expectedError.code}", got ${errorText(failure)}`];
    const codes = issueCodesOf(failure);
    if (expectedError.issueCodes !== undefined && !sameSet(expectedError.issueCodes, codes)) {
      return [
        `expected issue codes ${canonicalJson(expectedError.issueCodes)}, got ${canonicalJson(codes)}`,
      ];
    }
    return [];
  }
  if (computation === undefined) return [`unexpected error: ${errorText(failure)}`];
  return fixture.expected === undefined ? [] : matchExpected(fixture.expected, computation);
}
