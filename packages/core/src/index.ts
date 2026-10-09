/**
 * `@fairhour/core`: time math, rounding, overlaps, rates, budgets and the quick-add parser.
 * Pure functions only: no I/O, and clocks are injected (nothing reads `Date.now()`).
 */
export * from "./errors";
export * from "./time/index";
export * from "./entries/index";
export * from "./quick-add/index";
export * from "./rates/index";
export * from "./budgets/index";
