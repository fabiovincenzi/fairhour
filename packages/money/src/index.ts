/**
 * `@fairhour/money`: exact money and decimal arithmetic on `bigint` minor units, with explicit
 * rounding. MIT. Zero runtime dependencies. See ADR-0003 and the tax engine design, section 3.
 */
export {
  CurrencyMismatchError,
  DivisionByZeroError,
  InvalidAmountError,
  InvalidCurrencyError,
  MoneyError,
} from "./errors";
export type { InvalidAmountReason, MoneyErrorCode } from "./errors";

export {
  CURRENCY_CODES,
  assertCurrencyCode,
  currencyInfo,
  isCurrencyCode,
  minorUnitExponent,
} from "./currency";
export type { CurrencyCode, CurrencyInfo, MinorUnitExponent } from "./currency";

export { ROUNDING_MODES, divideAndRound, isRoundingMode } from "./rounding";
export type { RoundingMode } from "./rounding";

export {
  DECIMAL_HUNDRED,
  DECIMAL_ONE,
  DECIMAL_ZERO,
  MAX_DECIMAL_DIGITS,
  MAX_DECIMAL_SCALE,
  absDecimal,
  addDecimal,
  compareDecimal,
  decimal,
  decimalEquals,
  decimalFromInteger,
  decimalToString,
  divideDecimal,
  isDecimal,
  isDecimalString,
  isZeroDecimal,
  multiplyDecimal,
  negateDecimal,
  normalizeDecimal,
  rescaleDecimal,
  signDecimal,
  subtractDecimal,
  tryDecimal,
} from "./decimal";
export type { Decimal } from "./decimal";

export {
  abs,
  add,
  compare,
  equals,
  greaterThan,
  greaterThanOrEqual,
  isMoney,
  isNegative,
  isPositive,
  isZero,
  lessThan,
  lessThanOrEqual,
  max,
  min,
  money,
  multiplyByInteger,
  negate,
  subtract,
  sum,
  zero,
} from "./money";
export type { Money } from "./money";

export { allocate, convert, divide, multiply, percentage } from "./arithmetic";

export { convertPrice, extend, isPrice, price, priceFromMoney } from "./price";
export type { Price } from "./price";

export { fromDecimal, parseMoney, toDecimal, toDecimalString } from "./parse";

export {
  formatDecimal,
  formatMoney,
  formatMoneyToParts,
  formatPercent,
  formatPrice,
  supportsExactStringFormatting,
} from "./format";
export type { FormatMoneyOptions } from "./format";

export { moneyFromJson, moneyToJson, priceFromJson, priceToJson } from "./json";
export type { MoneyJson, PriceJson } from "./json";
