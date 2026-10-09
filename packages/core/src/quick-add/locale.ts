import type { QuickAddLocale } from "./types";

export interface LocaleKeywords {
  /** Unit words after a number of hours (folded, longest alternatives first when used in a regex). */
  readonly hourUnits: readonly string[];
  readonly minuteUnits: readonly string[];
  /** Words that join the two ends of a time range (`9 to 10`, `dalle 9 alle 10`). */
  readonly rangeJoiners: readonly string[];
  readonly rangePrefixes: readonly string[];
  readonly today: readonly string[];
  readonly yesterday: readonly string[];
  /** ISO weekday number (1 = Monday ... 7 = Sunday) to the words that name it. */
  readonly weekdays: readonly (readonly [number, readonly string[]])[];
}

/** Keywords are folded (no diacritics, lower case). */
export const KEYWORDS: Readonly<Record<QuickAddLocale, LocaleKeywords>> = {
  en: {
    hourUnits: ["hours", "hour", "hrs", "hr", "h"],
    minuteUnits: ["minutes", "minute", "mins", "min", "m"],
    rangeJoiners: ["to"],
    rangePrefixes: ["from"],
    today: ["today"],
    yesterday: ["yesterday"],
    weekdays: [
      [1, ["monday", "mon"]],
      [2, ["tuesday", "tues", "tue"]],
      [3, ["wednesday", "wed"]],
      [4, ["thursday", "thurs", "thur", "thu"]],
      [5, ["friday", "fri"]],
      [6, ["saturday", "sat"]],
      [7, ["sunday", "sun"]],
    ],
  },
  it: {
    hourUnits: ["ore", "ora", "h"],
    minuteUnits: ["minuti", "minuto", "min", "m"],
    rangeJoiners: ["fino alle", "alle", "a"],
    rangePrefixes: ["dalle", "dal", "da"],
    today: ["oggi"],
    yesterday: ["ieri"],
    weekdays: [
      [1, ["lunedi", "lun"]],
      [2, ["martedi", "mar"]],
      [3, ["mercoledi", "mer"]],
      [4, ["giovedi", "gio"]],
      [5, ["venerdi", "ven"]],
      [6, ["sabato", "sab"]],
      [7, ["domenica", "dom"]],
    ],
  },
};
