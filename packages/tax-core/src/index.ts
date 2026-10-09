/**
 * `@fairhour/tax-core`: a pure, I/O-free tax engine. Packs declare cited rules, versioned
 * parameters and message catalogs; `computeInvoice` runs them, checks the engine contract,
 * reconciles every total and returns a deeply frozen, explainable computation. MIT.
 * See ADR-0004 and the tax engine design (docs/design/tax-engine.md, section 4).
 *
 * This entry point never imports vitest, fast-check or node:* (the conformance suite lives in
 * `@fairhour/tax-core/conformance`).
 */
export { ENGINE_VERSION } from "./version";

export {
  RULE_ID_PATTERN,
  addDays,
  compareIsoDate,
  countryCode,
  daysBetweenInclusive,
  isCountryCode,
  isIsoDate,
  isJsonValue,
  isoDate,
  yearOf,
} from "./primitives";
export type { CountryCode, IsoDate, JsonValue, LocaleTag, RuleId } from "./primitives";

export { SOURCE_KINDS, sourceProblems } from "./sources";
export type { SourceKind, SourceRef, SourceVerification } from "./sources";

export {
  InvalidConfigError,
  InvalidInputError,
  InvalidIsoDateError,
  InvalidOptionsError,
  MessageFormatError,
  MissingMessageError,
  ParameterNotFoundError,
  ReconciliationError,
  RuleContractError,
  RuleExecutionError,
  TaxEngineError,
  UnsupportedInputError,
} from "./errors";
export type { RuleContractReason, SchemaIssue, TaxEngineErrorCode } from "./errors";

export { coreMessages } from "./messages/core-messages";
export { MAX_MESSAGE_DEPTH, formatMessage, parseMessage } from "./messages/format";
export { message, p } from "./messages/params";
export type {
  MessageCatalog,
  MessageCatalogs,
  MessageKey,
  MessageParam,
  MessageParamType,
  MessageRef,
} from "./messages/types";

export {
  CLIENT_KINDS,
  DOCUMENT_KINDS,
  LINE_KINDS,
  LINE_TREATMENT_KINDS,
  LINE_UNITS,
} from "./input/types";
export type {
  ClientInput,
  ClientKind,
  DocumentKind,
  ExchangeRecord,
  InvoiceInput,
  InvoiceInputJson,
  InvoiceLineInput,
  LineKind,
  LineTaxTreatment,
  LineTaxTreatmentJson,
  LineUnit,
} from "./input/types";
export {
  InvoiceInputJsonSchema,
  LINE_ID_PATTERN,
  MAX_INPUT_SCALE,
  MAX_INVOICE_LINES,
  MAX_RATE_SCALE,
  VAT_ID_PATTERN,
  validateInvoiceInput,
} from "./input/schema";
export { invoiceInputToJson, parseInvoiceInput } from "./input/json";

export { PACK_ID_PATTERN } from "./pack/types";
export type {
  FactValue,
  InputIssue,
  Maintainer,
  PackCapabilities,
  PackFacts,
  PackMeta,
  ParameterVersion,
  RoundingPolicy,
  TaxPack,
} from "./pack/types";
export {
  COMPONENT_EFFECTS,
  COMPONENT_KINDS,
  GROUP_ID_PATTERN,
  TAX_TREATMENT_KINDS,
} from "./pack/rule";
export type {
  Allocation,
  ComponentDraft,
  ComponentEffect,
  ComponentKind,
  ComputationState,
  LegalNoteDraft,
  NetLine,
  Rule,
  RuleContext,
  RuleOutput,
  TaxGroup,
  TaxTreatmentKind,
  TraceDraft,
  WarningDraft,
  WarningSeverity,
} from "./pack/rule";
export { roundingPolicyProblems } from "./pack/rounding";
export { toPackHandle } from "./pack/handle";
export type { PackHandle } from "./pack/handle";

export { computeInvoice } from "./engine/compute";
export {
  listParameters,
  parametersToJson,
  resolveParameters,
  toJsonValue,
} from "./engine/parameters";
export type { ParameterTimelineEntry, ParameterTimelineEntryJson } from "./engine/parameters";

export { ENGINE_NAME } from "./computation/types";
export type {
  Component,
  ComputedLine,
  InvoiceComputation,
  LegalNote,
  TaxSummaryEntry,
  TraceStep,
  Warning,
} from "./computation/types";
export {
  InvoiceComputationJsonSchema,
  computationFromJson,
  computationToJson,
} from "./computation/json";
export type { InvoiceComputationJson } from "./computation/json";

export { formatTrace } from "./format/trace";
export type { FormattedTraceStep } from "./format/trace";
export { formatComputation } from "./format/computation";
export type { FormattedComputation } from "./format/computation";

export {
  basesByGroup,
  findComponent,
  groupBase,
  groupOf,
  linesInGroup,
  mergeCatalogs,
  percentageByGroup,
  proRata,
  sumAllocations,
  sumNet,
  taxAllocations,
} from "./helpers/index";
export type { GroupBase } from "./helpers/index";

export { REVENUE_STATUS_ORDER } from "./thresholds/types";
export type {
  AnnualThresholdsCapability,
  RevenueReceipt,
  RevenueStatus,
  RevenueStatusKind,
  RevenueThresholdStatus,
  RevenueTrackerInput,
} from "./thresholds/types";

export { GoldenFixtureSchema } from "./fixtures/schema";
export type { GoldenFixture, GoldenFixtureJson } from "./fixtures/schema";
