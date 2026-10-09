/** Lower case without diacritics: `Lunedì` and `lunedi` fold to the same text. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/**
 * Folds a name for comparison: case and diacritics are ignored and every run of characters that
 * are not letters or digits becomes one space (`Acme S.r.l.` -> `acme s r l`).
 */
export function foldName(text: string): string {
  return fold(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
