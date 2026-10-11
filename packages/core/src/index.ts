/**
 * `@fairhour/core`: time math, rounding, overlaps, rates, budgets, the quick-add parser and the
 * invoice draft builder.
 * Pure functions only: no I/O, and clocks are injected (nothing reads `Date.now()`).
 */
export * from "./errors";
export * from "./time/index";
export * from "./entries/index";
export * from "./quick-add/index";
export * from "./rates/index";
export * from "./budgets/index";
export * from "./invoice/index";
