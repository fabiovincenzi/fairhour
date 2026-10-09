import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  PERMISSIVE_LICENSES,
  checkLicenseBoundary,
  declaredLicense,
  formatLicenseReport,
  isAllowedLicense,
  isMit,
  loadWorkspacePackages,
  parseWorkspacePatterns,
} from "./license-boundary.ts";

// Every test builds its own workspace in a temporary directory.
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

type Files = Record<string, string | object>;

/** Writes `files` (object values become JSON) into a fresh directory and returns it. */
function workspace(files: Files, patterns = ["apps/*", "packages/*"]): string {
  const root = mkdtempSync(path.join(tmpdir(), "fairhour-license-"));
  roots.push(root);
  const all: Files = {
    "pnpm-workspace.yaml": `packages:\n${patterns.map((p) => `  - "${p}"`).join("\n")}\n`,
    "package.json": { name: "root", private: true, license: "AGPL-3.0-only" },
    ...files,
  };
  for (const [file, content] of Object.entries(all)) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

const MIT_TEXT = "MIT License\n\nCopyright (c) 2026 The Fairhour contributors\n";

/** An MIT package with its LICENSE file. */
function mit(
  dir: string,
  name: string,
  extra: Record<string, unknown> = {},
  licenseText: string | null = MIT_TEXT,
): Files {
  return {
    [`${dir}/package.json`]: { name, version: "0.0.0", license: "MIT", ...extra },
    ...(licenseText === null ? {} : { [`${dir}/LICENSE`]: licenseText }),
  };
}

function agpl(dir: string, name: string, extra: Record<string, unknown> = {}): Files {
  return {
    [`${dir}/package.json`]: { name, version: "0.0.0", license: "AGPL-3.0-only", ...extra },
  };
}

/** An installed third-party package under `<where>/node_modules/<name>`. */
function installed(where: string, name: string, license: unknown): Files {
  const manifest = license === undefined ? { name } : { name, license };
  return { [`${where}/node_modules/${name}/package.json`]: manifest };
}

const kinds = async (root: string) =>
  (await checkLicenseBoundary(root)).violations.map((v) => v.kind);

describe("parseWorkspacePatterns", () => {
  it("reads quoted, single-quoted, bare and commented items, and stops at the next key", () => {
    const yaml = [
      "# the workspace",
      "packages:",
      '  - "apps/*"',
      "  - 'packages/*'",
      "  - scripts/*   # tooling",
      '  - "!packages/legacy"',
      "",
      "ignoredBuiltDependencies:",
      "  - lefthook",
    ].join("\n");
    expect(parseWorkspacePatterns(yaml)).toEqual([
      "apps/*",
      "packages/*",
      "scripts/*",
      "!packages/legacy",
    ]);
  });

  it("returns nothing without a packages key", () => {
    expect(parseWorkspacePatterns("onlyBuiltDependencies:\n  - esbuild\n")).toEqual([]);
  });
});

describe("isAllowedLicense", () => {
  it.each(PERMISSIVE_LICENSES.map((id) => [id]))("accepts %s", (id) => {
    expect(isAllowedLicense(id)).toBe(true);
  });

  it.each([
    ["mit", true],
    ["(MIT)", true],
    ["(MIT OR Apache-2.0)", true],
    ["GPL-3.0-only OR MIT", true],
    ["(GPL-3.0-only OR (MIT AND ISC))", true],
    ["MIT AND ISC", true],
    ["Apache-2.0 WITH LLVM-exception", true],
    ["MIT AND GPL-3.0-only", false],
    ["GPL-3.0-only OR AGPL-3.0-only", false],
    ["GPL-2.0-only WITH Classpath-exception-2.0", false],
    ["AGPL-3.0-only", false],
    ["LGPL-3.0-or-later", false],
    ["MPL-2.0", false],
    ["UNLICENSED", false],
    ["SEE LICENSE IN LICENSE.md", false],
    ["", false],
    ["MIT OR", false],
    ["OR MIT", false],
    ["(MIT", false],
    ["MIT)", false],
    ["MIT ISC", false],
  ])("%j is %s", (expression, expected) => {
    expect(isAllowedLicense(expression)).toBe(expected);
  });

  it("uses the allowlist it is given", () => {
    expect(isAllowedLicense("MPL-2.0", ["MPL-2.0"])).toBe(true);
    expect(isAllowedLicense("MIT", ["MPL-2.0"])).toBe(false);
  });
});

describe("isMit", () => {
  it.each([
    ["MIT", true],
    ["mit", true],
    [" (MIT) ", true],
    ["MIT OR Apache-2.0", false],
    ["Apache-2.0", false],
    ["AGPL-3.0-only", false],
    ["", false],
    [undefined, false],
  ])("%j is %s", (license, expected) => {
    expect(isMit(license)).toBe(expected);
  });
});

describe("declaredLicense", () => {
  it.each([
    [{ license: "MIT" }, "MIT"],
    [{ license: "  ISC  " }, "ISC"],
    [{ license: { type: "BSD-3-Clause", url: "https://example.com" } }, "BSD-3-Clause"],
    [{ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] }, "MIT OR Apache-2.0"],
    [{ licenses: ["ISC"] }, "ISC"],
    [{ license: "", licenses: [{ type: "MIT" }] }, "MIT"],
    [{ license: "" }, undefined],
    [{ license: 42 }, undefined],
    [{ licenses: [] }, undefined],
    [{}, undefined],
  ])("%j is %j", (manifest, expected) => {
    expect(declaredLicense(manifest)).toBe(expected);
  });
});

describe("loadWorkspacePackages", () => {
  it("finds the root and the packages of every pattern, skipping folders without a manifest", async () => {
    const root = workspace({
      ...agpl("apps/web", "@x/web"),
      ...mit("packages/money", "@x/money"),
      "packages/notes/README.md": "not a package",
      "packages/node_modules/ghost/package.json": { name: "ghost" },
    });
    const found = await loadWorkspacePackages(root);
    expect(found.map((pkg) => [pkg.dir, pkg.name, pkg.license])).toEqual([
      [".", "root", "AGPL-3.0-only"],
      ["apps/web", "@x/web", "AGPL-3.0-only"],
      ["packages/money", "@x/money", "MIT"],
    ]);
  });

  it("supports ** and negated patterns", async () => {
    const root = workspace(
      {
        ...mit("libs/a/b/deep", "@x/deep"),
        ...mit("libs/top", "@x/top"),
        ...mit("libs/legacy", "@x/legacy"),
        ...mit("tools/one", "@x/one"),
      },
      ["libs/**", "tools/*", "!libs/legacy"],
    );
    expect((await loadWorkspacePackages(root)).map((pkg) => pkg.name)).toEqual([
      "root",
      "@x/deep",
      "@x/top",
      "@x/one",
    ]);
  });

  it("names a package after its folder when it has no name, and reports broken manifests", async () => {
    const unnamed = workspace({ "packages/anon/package.json": { license: "MIT" } });
    expect((await loadWorkspacePackages(unnamed)).map((pkg) => pkg.name)).toContain(
      "packages/anon",
    );
    const broken = workspace({ "packages/bad/package.json": "{ nope" });
    await expect(loadWorkspacePackages(broken)).rejects.toThrow(/package\.json is not valid JSON/);
    const array = workspace({ "packages/bad/package.json": "[]" });
    await expect(loadWorkspacePackages(array)).rejects.toThrow(/is not a JSON object/);
  });
});

describe("checkLicenseBoundary", () => {
  it("has nothing to enforce when no package is MIT", async () => {
    const root = workspace({
      ...agpl("apps/web", "@x/web", { dependencies: { "@x/core": "workspace:*", gpl: "1.0.0" } }),
      ...agpl("packages/core", "@x/core"),
      ...installed("apps/web", "gpl", "GPL-3.0-only"),
    });
    const result = await checkLicenseBoundary(root);
    expect(result).toMatchObject({ packages: 3, mitPackages: [], violations: [], notes: [] });
  });

  it("accepts MIT packages that depend on MIT packages and permissive third-party packages", async () => {
    const root = workspace({
      ...mit("packages/money", "@x/money", { dependencies: { zod: "^4.0.0" } }),
      ...mit("packages/tax-core", "@x/tax-core", {
        dependencies: { "@x/money": "workspace:*", "decimal-lib": "^1.0.0" },
        peerDependencies: { typescript: "~6.0.0" },
        // The AGPL config package and a copyleft tool are fine as devDependencies.
        devDependencies: { "@x/config": "workspace:*", "gpl-tool": "1.0.0" },
      }),
      ...agpl("packages/config", "@x/config"),
      ...agpl("apps/web", "@x/web", { dependencies: { "@x/tax-core": "workspace:*" } }),
      ...installed("packages/money", "zod", "MIT"),
      ...installed("packages/tax-core", "decimal-lib", "(MIT OR GPL-3.0-only)"),
      ...installed("packages/tax-core", "typescript", "Apache-2.0"),
      ...installed("packages/tax-core", "gpl-tool", "GPL-3.0-only"),
    });
    const result = await checkLicenseBoundary(root);
    expect(result.violations).toEqual([]);
    expect(result.mitPackages).toEqual(["@x/money", "@x/tax-core"]);
  });

  describe("workspace dependencies", () => {
    it.each(["dependencies", "peerDependencies", "optionalDependencies"])(
      "rejects an AGPL workspace package in %s",
      async (field) => {
        const root = workspace({
          ...mit("packages/tax-pack-it", "@x/tax-pack-it", {
            [field]: { "@x/core": "workspace:*" },
          }),
          ...agpl("packages/core", "@x/core"),
        });
        const result = await checkLicenseBoundary(root);
        expect(result.violations).toEqual([
          {
            package: "@x/tax-pack-it",
            kind: "workspace-dependency",
            message: expect.stringContaining(`${field}: @x/core`) as string,
          },
        ]);
        expect(result.violations[0]?.message).toContain("AGPL-3.0-only");
      },
    );

    it("rejects workspace packages without a license or with a different permissive one", async () => {
      const root = workspace({
        ...mit("packages/a", "@x/a", {
          dependencies: { "@x/none": "workspace:*", "@x/apache": "workspace:^", "@x/dual": "*" },
        }),
        "packages/none/package.json": { name: "@x/none" },
        ...agpl("packages/apache", "@x/apache", { license: "Apache-2.0" }),
        ...agpl("packages/dual", "@x/dual", { license: "MIT OR Apache-2.0" }),
      });
      const messages = (await checkLicenseBoundary(root)).violations.map((v) => v.message);
      expect(messages).toHaveLength(3);
      expect(messages.join("\n")).toContain("no declared license");
      expect(messages.join("\n")).toContain("Apache-2.0");
      expect(messages.join("\n")).toContain("MIT OR Apache-2.0");
    });

    it("rejects a workspace: dependency on a package the workspace does not contain", async () => {
      const root = workspace(
        mit("packages/a", "@x/a", { dependencies: { "@x/ghost": "workspace:*" } }),
      );
      const result = await checkLicenseBoundary(root);
      expect(result.violations.map((v) => v.kind)).toEqual(["workspace-dependency"]);
      expect(result.violations[0]?.message).toContain("not a workspace package");
    });

    it("does not treat a dual-licensed package as MIT, so it is not checked", async () => {
      const root = workspace({
        ...mit("packages/dual", "@x/dual", {
          license: "MIT OR Apache-2.0",
          dependencies: { "@x/core": "workspace:*" },
        }),
        ...agpl("packages/core", "@x/core"),
      });
      expect((await checkLicenseBoundary(root)).mitPackages).toEqual([]);
    });
  });

  describe("third-party dependencies", () => {
    it.each(PERMISSIVE_LICENSES.map((id) => [id]))("accepts %s", async (license) => {
      const root = workspace({
        ...mit("packages/a", "@x/a", { dependencies: { dep: "1.0.0" } }),
        ...installed("packages/a", "dep", license),
      });
      expect((await checkLicenseBoundary(root)).violations).toEqual([]);
    });

    it.each(["GPL-3.0-only", "AGPL-3.0-only", "LGPL-3.0-or-later", "MPL-2.0", "UNLICENSED"])(
      "rejects %s",
      async (license) => {
        const root = workspace({
          ...mit("packages/a", "@x/a", { dependencies: { dep: "1.0.0" } }),
          ...installed("packages/a", "dep", license),
        });
        const result = await checkLicenseBoundary(root);
        expect(result.violations.map((v) => v.kind)).toEqual(["third-party-license"]);
        expect(result.violations[0]?.message).toContain(license);
        expect(result.violations[0]?.message).toContain("allowlist");
      },
    );

    it("rejects a dependency that declares no license", async () => {
      const root = workspace({
        ...mit("packages/a", "@x/a", { dependencies: { dep: "1.0.0" } }),
        ...installed("packages/a", "dep", undefined),
      });
      const result = await checkLicenseBoundary(root);
      expect(result.violations[0]?.message).toContain("declares no license");
    });

    it("accepts any alternative of an OR expression and demands every part of an AND", async () => {
      const root = workspace({
        ...mit("packages/a", "@x/a", { dependencies: { either: "1", both: "1" } }),
        ...installed("packages/a", "either", "GPL-3.0-only OR BSD-3-Clause"),
        ...installed("packages/a", "both", "MIT AND GPL-3.0-only"),
      });
      const result = await checkLicenseBoundary(root);
      expect(result.violations.map((v) => v.message)).toEqual([
        expect.stringContaining("both is licensed MIT AND GPL-3.0-only") as string,
      ]);
    });

    it("reads the legacy license formats of installed packages", async () => {
      const root = workspace({
        ...mit("packages/a", "@x/a", { dependencies: { object: "1", array: "1" } }),
        ...installed("packages/a", "object", { type: "MIT" }),
        "packages/a/node_modules/array/package.json": {
          name: "array",
          licenses: [{ type: "ISC" }],
        },
      });
      expect((await checkLicenseBoundary(root)).violations).toEqual([]);
    });

    it("resolves scoped packages and walks up to a hoisted node_modules", async () => {
      const root = workspace({
        ...mit("packages/a", "@x/a", { dependencies: { "@scope/dep": "1", hoisted: "1" } }),
        ...installed("packages/a", "@scope/dep", "GPL-3.0-only"),
        ...installed(".", "hoisted", "AGPL-3.0-only"),
      });
      const messages = (await checkLicenseBoundary(root)).violations.map((v) => v.message);
      expect(messages).toEqual([
        expect.stringContaining("@scope/dep") as string,
        expect.stringContaining("hoisted") as string,
      ]);
    });

    it("prefers the package's own node_modules over a hoisted copy", async () => {
      const root = workspace({
        ...mit("packages/a", "@x/a", { dependencies: { dep: "1" } }),
        ...installed("packages/a", "dep", "MIT"),
        ...installed(".", "dep", "GPL-3.0-only"),
      });
      expect((await checkLicenseBoundary(root)).violations).toEqual([]);
    });

    it("cannot verify a dependency that is not installed", async () => {
      const root = workspace(
        mit("packages/a", "@x/a", {
          dependencies: { missing: "1" },
          peerDependencies: { "missing-peer": "1" },
        }),
      );
      const result = await checkLicenseBoundary(root);
      expect(result.violations.map((v) => v.kind)).toEqual([
        "unresolved-dependency",
        "unresolved-dependency",
      ]);
      expect(result.violations[0]?.message).toContain("pnpm install");
    });

    it("only notes optional dependencies and optional peers that are not installed", async () => {
      const root = workspace(
        mit("packages/a", "@x/a", {
          optionalDependencies: { fsevents: "1" },
          peerDependencies: { prettier: "3" },
          peerDependenciesMeta: { prettier: { optional: true }, other: "ignored" },
        }),
      );
      const result = await checkLicenseBoundary(root);
      expect(result.violations).toEqual([]);
      expect(result.notes).toHaveLength(2);
      expect(result.notes.join("\n")).toContain("fsevents");
      expect(result.notes.join("\n")).toContain("prettier");
    });

    it("still checks an optional dependency that is installed", async () => {
      const root = workspace({
        ...mit("packages/a", "@x/a", { optionalDependencies: { native: "1" } }),
        ...installed("packages/a", "native", "GPL-3.0-only"),
      });
      expect(await kinds(root)).toEqual(["third-party-license"]);
    });
  });

  describe("LICENSE file", () => {
    it("is required", async () => {
      const root = workspace(mit("packages/a", "@x/a", {}, null));
      const result = await checkLicenseBoundary(root);
      expect(result.violations.map((v) => v.kind)).toEqual(["license-file"]);
      expect(result.violations[0]?.message).toContain("packages/a: no LICENSE file");
    });

    it("must mention MIT on its first line", async () => {
      const root = workspace(mit("packages/a", "@x/a", {}, "GNU AFFERO GENERAL PUBLIC LICENSE\n"));
      const result = await checkLicenseBoundary(root);
      expect(result.violations[0]?.message).toContain("does not mention MIT on its first line");
    });

    it("does not count an MIT mention on a later line", async () => {
      const root = workspace(mit("packages/a", "@x/a", {}, "Copyright (c) 2026\n\nMIT License\n"));
      expect(await kinds(root)).toEqual(["license-file"]);
    });

    it.each([
      ["MIT License\n"],
      ["\n\n  The MIT License (MIT)\r\nCopyright\r\n"],
      ["Licensed under the mit license\n"],
    ])("accepts %j", async (text) => {
      const root = workspace(mit("packages/a", "@x/a", {}, text));
      expect((await checkLicenseBoundary(root)).violations).toEqual([]);
    });

    it("accepts LICENSE.md and LICENSE.txt", async () => {
      const root = workspace({
        ...mit("packages/md", "@x/md", {}, null),
        "packages/md/LICENSE.md": "# MIT License\n",
        ...mit("packages/txt", "@x/txt", {}, null),
        "packages/txt/LICENSE.txt": "MIT License\n",
      });
      expect((await checkLicenseBoundary(root)).violations).toEqual([]);
    });
  });

  it("reports every problem of every MIT package", async () => {
    const root = workspace({
      ...mit("packages/a", "@x/a", { dependencies: { "@x/core": "workspace:*", dep: "1" } }, null),
      ...mit("packages/b", "@x/b", { dependencies: { other: "1" } }),
      ...agpl("packages/core", "@x/core"),
      ...installed("packages/a", "dep", "GPL-3.0-only"),
      ...installed("packages/b", "other", "SSPL-1.0"),
    });
    const result = await checkLicenseBoundary(root);
    expect(result.violations.map((v) => [v.package, v.kind])).toEqual([
      ["@x/a", "workspace-dependency"],
      ["@x/a", "third-party-license"],
      ["@x/a", "license-file"],
      ["@x/b", "third-party-license"],
    ]);
  });

  it("checks the root package too when it is MIT", async () => {
    const root = workspace({
      "package.json": { name: "root", license: "MIT", dependencies: { dep: "1" } },
      ...installed(".", "dep", "GPL-3.0-only"),
    });
    const result = await checkLicenseBoundary(root);
    expect(result.violations.map((v) => [v.package, v.kind])).toEqual([
      ["root", "third-party-license"],
      ["root", "license-file"],
    ]);
  });
});

describe("formatLicenseReport", () => {
  it("says there is nothing to enforce without MIT packages", () => {
    const text = formatLicenseReport({ packages: 4, mitPackages: [], violations: [], notes: [] });
    expect(text).toContain("Checked 4 workspace package(s); none is MIT yet");
    expect(text).toContain("OK: no violations.");
  });

  it("lists the MIT packages and the notes when everything passes", () => {
    const text = formatLicenseReport({
      packages: 4,
      mitPackages: ["@x/money", "@x/tax-core"],
      violations: [],
      notes: ["@x/money: optionalDependencies fsevents is not installed"],
    });
    expect(text).toContain("MIT: @x/money, @x/tax-core.");
    expect(text).toContain("note: @x/money: optionalDependencies fsevents");
    expect(text).toContain("OK: no violations.");
  });

  it("groups violations by package and cites the ADR", () => {
    const text = formatLicenseReport({
      packages: 3,
      mitPackages: ["@x/a", "@x/b"],
      violations: [
        { package: "@x/a", kind: "workspace-dependency", message: "dependencies: @x/core" },
        { package: "@x/a", kind: "license-file", message: "packages/a: no LICENSE file" },
        { package: "@x/b", kind: "third-party-license", message: "dependencies: dep is GPL" },
      ],
      notes: [],
    });
    expect(text).toContain("FAIL @x/a\n  - [workspace-dependency] dependencies: @x/core");
    expect(text).toContain("  - [license-file] packages/a: no LICENSE file");
    expect(text).toContain("FAIL @x/b\n  - [third-party-license]");
    expect(text).toContain("3 violation(s) in 2 package(s)");
    expect(text).toContain("docs/adr/0002-licensing.md");
    expect(text).not.toContain("OK:");
  });
});

describe("check-license-boundary CLI", () => {
  const cli = path.join(import.meta.dirname, "cli/check-license-boundary.ts");
  const run = (root: string) =>
    spawnSync(process.execPath, [cli, root], { encoding: "utf8", timeout: 30_000 });

  it("exits 0 and prints the report when the boundary holds", () => {
    const root = workspace(mit("packages/money", "@x/money"));
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MIT: @x/money.");
    expect(result.stdout).toContain("OK: no violations.");
  });

  it("exits 1 and names the violations otherwise", () => {
    const root = workspace({
      ...mit("packages/tax-core", "@x/tax-core", { dependencies: { "@x/core": "workspace:*" } }),
      ...agpl("packages/core", "@x/core"),
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("FAIL @x/tax-core");
    expect(result.stdout).toContain("@x/core");
  });
});
