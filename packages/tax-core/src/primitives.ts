import { COUNTRY_CODES_DATA } from "./countries.data";
import { InvalidInputError, InvalidIsoDateError } from "./errors";

/** "YYYY-MM-DD", a real Gregorian date between 1900-01-01 and 9999-12-31. */
export type IsoDate = string & { readonly __brand: "IsoDate" };

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1900;
const MS_PER_DAY = 86_400_000;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function dateParts(value: string): readonly [number, number, number] | undefined {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) return undefined;
  const [, y = "", m = "", d = ""] = match;
  const year = Number.parseInt(y, 10);
  const month = Number.parseInt(m, 10);
  const day = Number.parseInt(d, 10);
  if (year < MIN_YEAR || month < 1 || month > 12 || day < 1) return undefined;
  if (day > daysInMonth(year, month)) return undefined;
  return [year, month, day];
}

export function isIsoDate(value: string): value is IsoDate {
  return typeof value === "string" && dateParts(value) !== undefined;
}

/** @throws InvalidIsoDateError */
export function isoDate(value: string): IsoDate {
  if (!isIsoDate(value)) throw new InvalidIsoDateError(value);
  return value;
}

/** Lexicographic comparison, which is chronological for valid ISO dates. */
export function compareIsoDate(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function partsOf(date: IsoDate): readonly [number, number, number] {
  const parts = dateParts(date);
  if (parts === undefined) throw new InvalidIsoDateError(date);
  return parts;
}

function dayNumber(date: IsoDate): number {
  const [year, month, day] = partsOf(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function pad(value: number, width: number): string {
  return `${value}`.padStart(width, "0");
}

/**
 * Pure calendar arithmetic: `date` plus `days` (negative to go back). Uses `Date.UTC` on the
 * explicit input only, never the clock.
 * @throws InvalidIsoDateError when the result leaves 1900-01-01..9999-12-31
 * @throws RangeError when `days` is not an integer
 */
export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isSafeInteger(days)) throw new RangeError("addDays: days must be a safe integer");
  const result = new Date((dayNumber(date) + days) * MS_PER_DAY);
  // Out-of-range results (negative or five-digit years, an invalid Date) fail the pattern check.
  const text = `${pad(result.getUTCFullYear(), 4)}-${pad(result.getUTCMonth() + 1, 2)}-${pad(result.getUTCDate(), 2)}`;
  return isoDate(text);
}

/** Number of days in the inclusive range `from..to`; 0 when `to` is before `from`. */
export function daysBetweenInclusive(from: IsoDate, to: IsoDate): number {
  return Math.max(0, dayNumber(to) - dayNumber(from) + 1);
}

export function yearOf(date: IsoDate): number {
  return partsOf(date)[0];
}

/** ISO 3166-1 alpha-2, upper case, an assigned code. */
export type CountryCode = string & { readonly __brand: "CountryCode" };

const COUNTRY_CODES: ReadonlySet<string> = new Set<string>(COUNTRY_CODES_DATA);

export function isCountryCode(value: string): value is CountryCode {
  return typeof value === "string" && COUNTRY_CODES.has(value);
}

/** @throws InvalidInputError with one issue of code "invalid-country" */
export function countryCode(value: string): CountryCode {
  if (!isCountryCode(value)) {
    throw new InvalidInputError([
      {
        path: [],
        code: "invalid-country",
        message: "Expected an assigned ISO 3166-1 alpha-2 code in upper case",
      },
    ]);
  }
  return value;
}

/** BCP 47 tag accepted by Intl.getCanonicalLocales ("en", "it", "it-IT"). */
export type LocaleTag = string;

/** Rule ids: "<packId>.<segment>[.<segment>...]"; see RULE_ID_PATTERN. */
export type RuleId = string;
export const RULE_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** True for plain JSON data: no undefined, bigint, functions, non-finite numbers or class instances. */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item));
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value).every((item) => isJsonValue(item));
}
