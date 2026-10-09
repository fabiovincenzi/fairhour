import type { Span } from "./scan";

const TRIMMED = /^[\s,;:\-–—]$/u;

/**
 * `text` without the whitespace and separators (`,;:-–—`) at both ends. One pass from each end:
 * a regular expression such as `/[\s,]+$/` retries from every position of a long run and is
 * quadratic on `", , , , x"`.
 */
function trimSeparators(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && TRIMMED.test(text.charAt(start))) start++;
  while (end > start && TRIMMED.test(text.charAt(end - 1))) end--;
  return text.slice(start, end);
}

/** The pieces of text nothing recognised, joined with one space between words, and trimmed. */
export function cleanDescription(pieces: readonly Span[]): string {
  return trimSeparators(
    pieces
      .map((piece) => piece.text)
      .join(" ")
      .replace(/\s+/gu, " "),
  );
}
