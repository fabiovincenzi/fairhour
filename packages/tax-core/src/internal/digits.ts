/**
 * The value of a string of ASCII digits ("2024" -> 2024), read one digit at a time. It replaces
 * `parseInt`/`Number(...)`/unary `+`, which parse floats, accept signs, spaces and exponents, or
 * silently stop at the first non-digit. Callers validate the text first (for example with a
 * pattern); anything else is a programming error.
 * @throws RangeError for an empty string, a character other than 0-9, or a value above
 *   `Number.MAX_SAFE_INTEGER`
 */
export function digitsToInteger(text: string): number {
  if (text.length === 0) throw new RangeError("digitsToInteger: expected at least one digit");
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    const digit = text.charCodeAt(index) - 48; // "0" is U+0030
    if (digit < 0 || digit > 9) {
      throw new RangeError(
        `digitsToInteger: expected only digits 0-9, got ${JSON.stringify(text.slice(0, 32))}`,
      );
    }
    value = value * 10 + digit;
    if (!Number.isSafeInteger(value)) {
      throw new RangeError("digitsToInteger: the value is above Number.MAX_SAFE_INTEGER");
    }
  }
  return value;
}
