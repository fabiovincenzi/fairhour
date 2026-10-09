import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { availableFrom, MILESTONE_BY_AREA, parseEnvExample, renderEnvReference } from "./env.ts";

/** The backlog file of each area in `MILESTONE_BY_AREA`. */
const BACKLOG_FILES: Readonly<Record<string, string>> = {
  DATA: "03-data-auth.yml",
  WEB: "04-web-mvp.yml",
  REP: "05-reports.yml",
  HARD: "06-hardening.yml",
  API: "07-api.yml",
  HOST: "08-selfhost.yml",
  DESK: "09-desktop.yml",
  FPA: "10-fatturapa.yml",
  LAUNCH: "11-launch.yml",
};

const SAMPLE = `# Header comment
#   cp .env.example .env

# --- Core ---------------------------------------------------------------

# Public base URL, for example http://localhost:3000. Used with | pipes.
# Used from: DATA-006 (authentication), WEB-002 (app shell).
APP_URL=http://localhost:3000

# Log level.
LOG_LEVEL=debug
# Directly after a variable: a new block without a blank line.
# Used from: HARD-006 (redaction),
#   HOST-003 (compose).
DEMO=false

# --- Email (SMTP) ----------------------------------------------------------

# Outgoing email.
# Used from: DATA-006 (magic links).
SMTP_HOST=localhost
SMTP_FROM="Fairhour <no-reply@example.test>"
SMTP_USER=

# --- Tooling (optional) ----------------------------------------------------

# Opt out of telemetry.
# TURBO_TELEMETRY_DISABLED=1
`;

describe("parseEnvExample", () => {
  const sections = parseEnvExample(SAMPLE);

  it("groups entries by section and drops sections without variables", () => {
    expect(sections.map((section) => section.title)).toEqual(["Core", "Email (SMTP)"]);
    expect(sections[0]?.entries).toHaveLength(3);
  });

  it("reads names, defaults, descriptions and backlog references", () => {
    expect(sections[0]?.entries[0]).toEqual({
      variables: [{ name: "APP_URL", value: "http://localhost:3000" }],
      description: "Public base URL, for example http://localhost:3000. Used with | pipes.",
      usedFrom: ["DATA-006", "WEB-002"],
    });
    expect(sections[0]?.entries[1]).toEqual({
      variables: [{ name: "LOG_LEVEL", value: "debug" }],
      description: "Log level.",
      usedFrom: [],
    });
    expect(sections[0]?.entries[2]?.usedFrom).toEqual(["HARD-006", "HOST-003"]);
  });

  it("keeps variables that share a comment together", () => {
    expect(sections[1]?.entries[0]?.variables).toEqual([
      { name: "SMTP_HOST", value: "localhost" },
      { name: "SMTP_FROM", value: '"Fairhour <no-reply@example.test>"' },
      { name: "SMTP_USER", value: "" },
    ]);
  });

  it("puts variables before the first banner in a General section", () => {
    expect(parseEnvExample("A=1\r\n\r\n# --- X ---\r\nB=2\r\n")).toEqual([
      {
        title: "General",
        entries: [{ variables: [{ name: "A", value: "1" }], description: "", usedFrom: [] }],
      },
      {
        title: "X",
        entries: [{ variables: [{ name: "B", value: "2" }], description: "", usedFrom: [] }],
      },
    ]);
  });

  it("ignores lines that are neither comments, assignments nor blank", () => {
    expect(parseEnvExample("not a variable\nexport A=1\n")).toEqual([]);
  });
});

describe("availableFrom", () => {
  it("returns the earliest milestone, comparing versions numerically", () => {
    expect(availableFrom(["WEB-002", "DATA-006"])).toBe("v0.3");
    expect(availableFrom(["HOST-003", "LAUNCH-003"])).toBe("v0.8");
    expect(availableFrom(["LAUNCH-003", "API-002"])).toBe("v0.7");
  });

  it("is empty when no item maps to a milestone", () => {
    expect(availableFrom([])).toBe("");
    expect(availableFrom(["FND-001"])).toBe("");
  });

  it("compares v0.10 after v0.9", () => {
    expect(availableFrom(["FPA-002", "DESK-002"])).toBe("v0.9");
    expect(availableFrom(["FPA-002", "LAUNCH-002"])).toBe("v0.10");
  });
});

describe("renderEnvReference", () => {
  const page = renderEnvReference(SAMPLE);

  it("starts with the page title and the in-development notice", () => {
    expect(page.startsWith("# Environment variables\n\n:::caution[In development]\n")).toBe(true);
    expect(page).toContain("[`.env.example`](.env.example)");
  });

  it("renders one table per section with the milestone of each variable", () => {
    expect(page).toContain("## Core\n\n| Variable | Default | Description | Available from |");
    expect(page).toContain("## Email (SMTP)");
    expect(page).not.toContain("Tooling");
    expect(page).toContain("| `LOG_LEVEL` | `debug` | Log level. |  |");
    expect(page).toContain(
      "| `DEMO` | `false` | Directly after a variable: a new block without a blank line. | v0.6 |",
    );
  });

  it("escapes pipes, wraps localhost URLs in code and joins grouped variables", () => {
    expect(page).toContain(
      "Public base URL, for example `http://localhost:3000`. Used with \\| pipes. | v0.3 |",
    );
    expect(page).toContain(
      '| `SMTP_HOST`<br>`SMTP_FROM`<br>`SMTP_USER` | `localhost`<br>`"Fairhour <no-reply@example.test>"`<br>_empty_ |',
    );
  });
});

describe("the repository's .env.example", () => {
  const text = readFileSync(path.resolve(import.meta.dirname, "../../../../.env.example"), "utf8");

  it("documents every variable, each with a description", () => {
    const sections = parseEnvExample(text);
    const entries = sections.flatMap((section) => section.entries);
    const names = entries.flatMap((entry) => entry.variables.map((variable) => variable.name));
    expect(names).toContain("APP_URL");
    expect(names).toContain("BETTER_AUTH_SECRET");
    expect(names).toContain("DATABASE_URL");
    for (const entry of entries) {
      expect(entry.description, entry.variables[0]?.name).not.toBe("");
    }
  });

  it("only names backlog areas that have a milestone", () => {
    const areas = new Set(
      [...text.matchAll(/Used from: ([^\n]+)/g)].flatMap((match) =>
        [...(match[1] ?? "").matchAll(/\b([A-Z]+)-\d+\b/g)].map((id) => id[1] ?? ""),
      ),
    );
    for (const area of areas) expect(Object.keys(MILESTONE_BY_AREA), area).toContain(area);
  });

  it("agrees with the milestones of the backlog files", () => {
    const backlog = path.resolve(import.meta.dirname, "../../../../.github/backlog");
    for (const [area, milestone] of Object.entries(MILESTONE_BY_AREA)) {
      const file = readFileSync(path.join(backlog, BACKLOG_FILES[area] ?? ""), "utf8");
      expect(file, area).toContain(`milestone: "${milestone} `);
      expect(file, area).toContain(`- id: ${area}-001`);
    }
  });
});
