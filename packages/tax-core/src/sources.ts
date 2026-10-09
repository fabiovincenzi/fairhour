import { isIsoDate, type IsoDate } from "./primitives";

export type SourceKind =
  | "statute" // laws, decrees with force of law (L., DPR, DL, D.Lgs.)
  | "regulation" // ministerial decrees, regulations
  | "eu-law" // directives, regulations, Council decisions
  | "ruling" // tax authority rulings, answers to interpelli, resolutions
  | "guidance" // circulars, official guides, FAQs
  | "technical-specification" // e.g. FatturaPA specifications
  | "case-law"
  | "professional-practice" // established practice, professional bodies' opinions
  | "user-configuration"; // values supplied by the user (generic pack)

export const SOURCE_KINDS: readonly SourceKind[] = Object.freeze([
  "statute",
  "regulation",
  "eu-law",
  "ruling",
  "guidance",
  "technical-specification",
  "case-law",
  "professional-practice",
  "user-configuration",
]);

export type SourceVerification =
  | {
      readonly status: "verified";
      readonly on: IsoDate;
      /**
       * primary-text:     the consolidated legal text was read in full;
       * official-summary: an official publication (tax authority guide, ruling, FAQ, Gazette
       *                   notice) or a quoted extract of it confirms the point;
       * secondary:        consistent professional literature confirms it.
       */
      readonly against: "primary-text" | "official-summary" | "secondary";
    }
  | { readonly status: "to-be-verified"; readonly reason: string };

export interface SourceRef {
  /** Unique within a pack: "it.l-190-2014.c54-89". */
  readonly id: string;
  readonly kind: SourceKind;
  /** Official title in the source's language: "Legge 23 dicembre 2014, n. 190". */
  readonly title: string;
  /** Pinpoint citation: "art. 1, commi 54-89". */
  readonly citation: string;
  /** https only. */
  readonly url?: string;
  readonly verification: SourceVerification;
  readonly note?: string;
}

/** An absolute https URL with a dotted host. */
export const HTTPS_URL_PATTERN = /^https:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Structural problems of a source, in English (empty when the source is well-formed): required
 * texts present, a known kind, an https URL when there is one, a complete verification.
 */
export function sourceProblems(source: unknown): readonly string[] {
  if (!isRecord(source)) return ["not an object"];
  const problems: string[] = [];
  if (!nonEmptyString(source.id)) problems.push("id is empty");
  if (
    typeof source.kind !== "string" ||
    !(SOURCE_KINDS as readonly string[]).includes(source.kind)
  ) {
    problems.push("kind is not a SourceKind");
  }
  if (!nonEmptyString(source.title)) problems.push("title is empty");
  if (!nonEmptyString(source.citation)) problems.push("citation is empty");
  if (
    source.url !== undefined &&
    (typeof source.url !== "string" || !HTTPS_URL_PATTERN.test(source.url))
  ) {
    problems.push("url is not an https URL");
  }
  if (source.note !== undefined && typeof source.note !== "string")
    problems.push("note is not a string");
  const verification = source.verification;
  if (!isRecord(verification)) {
    problems.push("verification is missing");
  } else if (verification.status === "verified") {
    if (typeof verification.on !== "string" || !isIsoDate(verification.on)) {
      problems.push("verification.on is not an ISO date");
    }
    if (
      verification.against !== "primary-text" &&
      verification.against !== "official-summary" &&
      verification.against !== "secondary"
    ) {
      problems.push("verification.against is invalid");
    }
  } else if (verification.status === "to-be-verified") {
    if (!nonEmptyString(verification.reason)) problems.push("verification.reason is empty");
  } else {
    problems.push("verification.status is invalid");
  }
  return problems;
}

/** A copy with keys in type order, so that output does not depend on how a pack wrote it. */
export function copySource(source: SourceRef): SourceRef {
  const verification: SourceVerification =
    source.verification.status === "verified"
      ? { status: "verified", on: source.verification.on, against: source.verification.against }
      : { status: "to-be-verified", reason: source.verification.reason };
  return {
    id: source.id,
    kind: source.kind,
    title: source.title,
    citation: source.citation,
    ...(source.url === undefined ? {} : { url: source.url }),
    verification,
    ...(source.note === undefined ? {} : { note: source.note }),
  };
}
