import { describe, expect, it } from "vitest";
import { isoDate } from "./primitives";
import {
  HTTPS_URL_PATTERN,
  SOURCE_KINDS,
  copySource,
  sourceProblems,
  type SourceRef,
} from "./sources";

const valid: SourceRef = {
  id: "it.l-190-2014.c54-89",
  kind: "statute",
  title: "Legge 23 dicembre 2014, n. 190",
  citation: "art. 1, commi 54-89",
  url: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2014-12-23;190",
  verification: { status: "verified", on: isoDate("2026-10-09"), against: "primary-text" },
  note: "Regime forfettario",
};

describe("sourceProblems", () => {
  it("accepts well-formed sources", () => {
    expect(sourceProblems(valid)).toEqual([]);
    expect(
      sourceProblems({
        id: "x",
        kind: "guidance",
        title: "T",
        citation: "C",
        verification: { status: "to-be-verified", reason: "not read yet" },
      }),
    ).toEqual([]);
  });

  it.each([
    ["not an object", "x", ["not an object"]],
    ["an array", [], ["not an object"]],
    ["an empty id", { ...valid, id: " " }, ["id is empty"]],
    ["an unknown kind", { ...valid, kind: "blog" }, ["kind is not a SourceKind"]],
    ["a non-string kind", { ...valid, kind: 3 }, ["kind is not a SourceKind"]],
    ["an empty title", { ...valid, title: "" }, ["title is empty"]],
    ["an empty citation", { ...valid, citation: "" }, ["citation is empty"]],
    ["an http URL", { ...valid, url: "http://example.com/x" }, ["url is not an https URL"]],
    ["a non-string URL", { ...valid, url: 1 }, ["url is not an https URL"]],
    ["a non-string note", { ...valid, note: 1 }, ["note is not a string"]],
    ["no verification", { ...valid, verification: undefined }, ["verification is missing"]],
    [
      "a bad verification date",
      { ...valid, verification: { status: "verified", on: "2026-13-01", against: "secondary" } },
      ["verification.on is not an ISO date"],
    ],
    [
      "a non-string verification date",
      { ...valid, verification: { status: "verified", on: 5, against: "secondary" } },
      ["verification.on is not an ISO date"],
    ],
    [
      "a bad verification basis",
      { ...valid, verification: { status: "verified", on: "2026-01-01", against: "rumour" } },
      ["verification.against is invalid"],
    ],
    [
      "a to-be-verified without reason",
      { ...valid, verification: { status: "to-be-verified", reason: "" } },
      ["verification.reason is empty"],
    ],
    [
      "an unknown status",
      { ...valid, verification: { status: "maybe" } },
      ["verification.status is invalid"],
    ],
  ])("reports %s", (_label, source, problems) => {
    expect(sourceProblems(source)).toEqual(problems);
  });

  it("lists every kind of design 4.3", () => {
    expect(SOURCE_KINDS).toEqual([
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
  });

  it.each([
    ["https://example.com", true],
    ["https://example.com/a?b#c", true],
    ["http://example.com", false],
    ["https://localhost", false],
    ["https://exa mple.com", false],
  ])("HTTPS_URL_PATTERN %s -> %s", (url, ok) => {
    expect(HTTPS_URL_PATTERN.test(url)).toBe(ok);
  });
});

describe("copySource", () => {
  it("copies with keys in type order and drops absent optionals", () => {
    const scrambled = {
      note: valid.note,
      verification: valid.verification,
      url: valid.url,
      citation: valid.citation,
      title: valid.title,
      kind: valid.kind,
      id: valid.id,
    } as SourceRef;
    const copy = copySource(scrambled);
    expect(Object.keys(copy)).toEqual([
      "id",
      "kind",
      "title",
      "citation",
      "url",
      "verification",
      "note",
    ]);
    expect(copy).toEqual(valid);
    expect(copy.verification).not.toBe(valid.verification);
    const minimal = copySource({
      id: "x",
      kind: "ruling",
      title: "T",
      citation: "C",
      verification: { status: "to-be-verified", reason: "r" },
    });
    expect(Object.keys(minimal)).toEqual(["id", "kind", "title", "citation", "verification"]);
  });
});
