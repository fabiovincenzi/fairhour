/**
 * The license boundary of ADR-0002, checked mechanically for every MIT workspace package: the
 * packages that ADR-0002 designates as MIT by name (see {@link isDesignatedMit}) and any other
 * package that declares `MIT`.
 *
 * 1. its `dependencies`, `peerDependencies` and `optionalDependencies` may name workspace packages
 *    only if those are MIT too (an MIT package never depends on an AGPL one);
 * 2. every third-party package among them must carry a permissive license (see
 *    {@link PERMISSIVE_LICENSES}), read from `node_modules/<name>/package.json`;
 * 3. it ships a `LICENSE` file whose first line says MIT.
 *
 * The designated packages (`@fairhour/money`, `@fairhour/tax-core`, every `@fairhour/tax-pack-*`)
 * are held to two more rules, so that forgetting them is an error rather than a silent exemption:
 *
 * 4. the `license` field of their `package.json` is exactly the string `MIT` (a missing field, an
 *    expression such as `MIT OR Apache-2.0`, another case or another type all fail);
 * 5. their ESLint config (`eslint.config.js`, or the `.mjs`, `.cjs`, `.ts` variants) enables the
 *    import guard with `mitLibrary: true`. This is a plain text check, not an evaluation of the
 *    config: the text must contain `mitLibrary: true` outside comments, so the option has to be
 *    written out literally (not behind a variable or a spread).
 *
 * `devDependencies` are ignored: they are neither distributed with the package nor compiled into
 * it. Only the direct dependencies are inspected, not their own dependencies.
 *
 * Dependency-free on purpose (Node built-ins only), so that it runs on Node's native type
 * stripping and cannot be broken by the dependencies it polices.
 */

import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** SPDX identifiers an MIT package may depend on at runtime (ADR-0002, rule 2). */
export const PERMISSIVE_LICENSES: readonly string[] = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
];

/** Where an MIT package keeps its license text. */
export const LICENSE_FILE_NAMES: readonly string[] = ["LICENSE", "LICENSE.md", "LICENSE.txt"];

/** The names under which an ESLint flat config may be written. */
export const ESLINT_CONFIG_NAMES: readonly string[] = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
];

/** The MIT packages ADR-0002 names one by one; the rest are the `tax-pack-*` packages. */
export const MIT_PACKAGE_NAMES: readonly string[] = ["@fairhour/money", "@fairhour/tax-core"];

/** Every package whose name starts with this prefix is a country pack, so MIT (ADR-0002). */
export const MIT_PACKAGE_PREFIX = "@fairhour/tax-pack-";

/**
 * Whether ADR-0002 designates the package as MIT by its name: `@fairhour/money`,
 * `@fairhour/tax-core` and every `@fairhour/tax-pack-*`. Such a package is checked, and must
 * declare exactly `MIT`, whatever its `package.json` says.
 */
export function isDesignatedMit(name: string): boolean {
  return (
    MIT_PACKAGE_NAMES.includes(name) ||
    (name.startsWith(MIT_PACKAGE_PREFIX) && name.length > MIT_PACKAGE_PREFIX.length)
  );
}

const DEPENDENCY_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"] as const;

type DependencyField = (typeof DEPENDENCY_FIELDS)[number];

export interface WorkspacePackage {
  readonly name: string;
  /** Directory relative to the repository root, with `/` separators (`.` for the root). */
  readonly dir: string;
  /** Normalised license text (an SPDX expression), or `undefined` when none is declared. */
  readonly license: string | undefined;
  /** The `license` field exactly as written (`undefined` when the package omits it). */
  readonly licenseField: unknown;
  readonly dependencies: Readonly<Record<DependencyField, Readonly<Record<string, string>>>>;
  /** Peer dependencies marked optional in `peerDependenciesMeta`. */
  readonly optionalPeers: ReadonlySet<string>;
}

export type ViolationKind =
  | "workspace-dependency"
  | "third-party-license"
  | "unresolved-dependency"
  | "license-file"
  | "license-declaration"
  | "eslint-config";

export interface Violation {
  readonly package: string;
  readonly kind: ViolationKind;
  readonly message: string;
}

export interface LicenseBoundaryResult {
  /** Number of workspace packages found. */
  readonly packages: number;
  /** Names of the MIT packages that were checked (the designated ones and those declaring MIT). */
  readonly mitPackages: readonly string[];
  readonly violations: readonly Violation[];
  /** Things skipped without failing, such as optional dependencies that are not installed. */
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------------------------
// SPDX license expressions
// ---------------------------------------------------------------------------------------------

/**
 * Whether an SPDX license expression is acceptable: `A OR B` needs one acceptable alternative,
 * `A AND B` needs both, `WITH <exception>` is ignored (it only narrows the license), identifiers
 * compare case-insensitively. An expression that does not parse is not acceptable.
 */
export function isAllowedLicense(
  expression: string,
  allowed: readonly string[] = PERMISSIVE_LICENSES,
): boolean {
  const known = new Set(allowed.map((id) => id.toLowerCase()));
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let index = 0;

  // expression := term ("OR" term)* ; term := factor ("AND" factor)* ; factor := "(" expression ")" | id
  const parseExpression = (): boolean | undefined => {
    let result = parseTerm();
    while (result !== undefined && tokens[index]?.toUpperCase() === "OR") {
      index++;
      const next = parseTerm();
      result = next === undefined ? undefined : result || next;
    }
    return result;
  };
  const parseTerm = (): boolean | undefined => {
    let result = parseFactor();
    while (result !== undefined && tokens[index]?.toUpperCase() === "AND") {
      index++;
      const next = parseFactor();
      result = next === undefined ? undefined : result && next;
    }
    return result;
  };
  const parseFactor = (): boolean | undefined => {
    const token = tokens[index];
    if (token === undefined || token === ")") return undefined;
    index++;
    if (token === "(") {
      const inner = parseExpression();
      if (tokens[index] !== ")") return undefined;
      index++;
      return inner;
    }
    if (tokens[index]?.toUpperCase() === "WITH") index += 2; // skip the exception identifier
    return known.has(token.toLowerCase());
  };

  const result = parseExpression();
  return result === true && index === tokens.length;
}

/**
 * Whether an SPDX expression names exactly the MIT license (not a choice such as `MIT OR
 * Apache-2.0`, which would need its own decision and notice).
 */
export function isMit(expression: string | undefined): boolean {
  return expression !== undefined && /^\(*\s*MIT\s*\)*$/i.test(expression.trim());
}

// ---------------------------------------------------------------------------------------------
// Reading manifests
// ---------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(file: string): Promise<Json | undefined> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
  if (!isRecord(parsed)) throw new Error(`${file} is not a JSON object`);
  return parsed;
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * The declared license as one SPDX expression: the `license` string, the legacy `{ type }`
 * object, or the legacy `licenses` array (alternatives, so joined with `OR`).
 */
export function declaredLicense(manifest: Json): string | undefined {
  const typeOf = (value: unknown): string | undefined => {
    if (typeof value === "string") return value.trim() === "" ? undefined : value.trim();
    if (isRecord(value) && typeof value.type === "string") return typeOf(value.type);
    return undefined;
  };
  const single = typeOf(manifest.license);
  if (single !== undefined) return single;
  if (Array.isArray(manifest.licenses)) {
    const legacy: unknown[] = manifest.licenses;
    const all = legacy.map(typeOf).filter((id) => id !== undefined);
    if (all.length > 0) return all.join(" OR ");
  }
  return undefined;
}

function toPackage(dir: string, manifest: Json): WorkspacePackage {
  const meta = isRecord(manifest.peerDependenciesMeta) ? manifest.peerDependenciesMeta : {};
  const optionalPeers = Object.entries(meta)
    .filter(([, value]) => isRecord(value) && value.optional === true)
    .map(([name]) => name);
  return {
    name: typeof manifest.name === "string" ? manifest.name : dir,
    dir,
    license: declaredLicense(manifest),
    licenseField: manifest.license,
    dependencies: {
      dependencies: stringMap(manifest.dependencies),
      peerDependencies: stringMap(manifest.peerDependencies),
      optionalDependencies: stringMap(manifest.optionalDependencies),
    },
    optionalPeers: new Set(optionalPeers),
  };
}

// ---------------------------------------------------------------------------------------------
// Workspace discovery (pnpm-workspace.yaml)
// ---------------------------------------------------------------------------------------------

/** The `packages:` globs of a `pnpm-workspace.yaml` (a plain list of strings is all we need). */
export function parseWorkspacePatterns(yaml: string): string[] {
  const patterns: string[] = [];
  let inPackages = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
    } else if (inPackages) {
      const item = /^\s+-\s+(.+?)\s*$/.exec(line)?.[1];
      if (item !== undefined) {
        const unquoted = /^(["'])(.*)\1(?:\s+#.*)?$/.exec(item)?.[2] ?? item.replace(/\s+#.*$/, "");
        patterns.push(unquoted);
      } else if (/^\S/.test(line)) {
        inPackages = false; // the next top-level key
      }
    }
  }
  return patterns;
}

/** Directories (relative, `/`-separated) that match a workspace glob: `*` and `**` segments. */
async function expandPattern(repoRoot: string, pattern: string): Promise<string[]> {
  const segments = pattern.replace(/^\.\//, "").replace(/\/+$/, "").split("/");
  const matches: string[] = [];
  const walk = async (dir: string, index: number): Promise<void> => {
    const segment = segments[index];
    if (segment === undefined) {
      matches.push(dir);
      return;
    }
    if (segment !== "*" && segment !== "**") {
      await walk(dir === "" ? segment : `${dir}/${segment}`, index + 1);
      return;
    }
    if (segment === "**") await walk(dir, index + 1); // zero directories
    let entries: Dirent[];
    try {
      entries = await readdir(path.join(repoRoot, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }
      const child = dir === "" ? entry.name : `${dir}/${entry.name}`;
      await walk(child, segment === "**" ? index : index + 1);
    }
  };
  await walk("", 0);
  return matches;
}

/** The root package and every package matched by `pnpm-workspace.yaml`, in a stable order. */
export async function loadWorkspacePackages(repoRoot: string): Promise<WorkspacePackage[]> {
  const yaml = await readFile(path.join(repoRoot, "pnpm-workspace.yaml"), "utf8");
  const patterns = parseWorkspacePatterns(yaml);
  const included = new Set<string>(["."]);
  for (const pattern of patterns.filter((p) => !p.startsWith("!"))) {
    for (const dir of await expandPattern(repoRoot, pattern)) included.add(dir === "" ? "." : dir);
  }
  for (const pattern of patterns.filter((p) => p.startsWith("!"))) {
    for (const dir of await expandPattern(repoRoot, pattern.slice(1))) included.delete(dir);
  }
  const packages: WorkspacePackage[] = [];
  for (const dir of [...included].sort()) {
    const manifest = await readJson(path.join(repoRoot, dir, "package.json"));
    if (manifest !== undefined) packages.push(toPackage(dir, manifest));
  }
  return packages;
}

// ---------------------------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------------------------

/** Finds `node_modules/<name>/package.json` from `fromDir` up to the repository root. */
async function resolveInstalled(
  repoRoot: string,
  fromDir: string,
  name: string,
): Promise<Json | undefined> {
  let dir = path.join(repoRoot, fromDir);
  for (;;) {
    const manifest = await readJson(path.join(dir, "node_modules", name, "package.json"));
    if (manifest !== undefined) return manifest;
    if (path.resolve(dir) === path.resolve(repoRoot)) return undefined;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** What is wrong with the package's license file, or `undefined` when it is fine. */
async function licenseFileProblem(repoRoot: string, dir: string): Promise<string | undefined> {
  for (const name of LICENSE_FILE_NAMES) {
    let text: string;
    try {
      text = await readFile(path.join(repoRoot, dir, name), "utf8");
    } catch {
      continue;
    }
    const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
    return /\bMIT\b/i.test(firstLine)
      ? undefined
      : `${name} does not mention MIT on its first line`;
  }
  return `no LICENSE file (looked for ${LICENSE_FILE_NAMES.join(", ")})`;
}

/**
 * Removes line and block comments, so that a commented-out option does not count. String and
 * template literals are skipped over first, so that a `//` inside a URL does not start a comment.
 */
function stripComments(source: string): string {
  const stringOrComment =
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  return source.replace(stringOrComment, (_match, text: string | undefined) => text ?? "");
}

/** What is wrong with the package's ESLint config, or `undefined` when it enables `mitLibrary`. */
async function eslintConfigProblem(repoRoot: string, dir: string): Promise<string | undefined> {
  for (const name of ESLINT_CONFIG_NAMES) {
    let text: string;
    try {
      text = await readFile(path.join(repoRoot, dir, name), "utf8");
    } catch {
      continue;
    }
    return /\bmitLibrary\s*:\s*true\b/.test(stripComments(text))
      ? undefined
      : `${name} does not pass mitLibrary: true to createConfig (the import guard of ADR-0002, rule 2)`;
  }
  return `no ESLint config (looked for ${ESLINT_CONFIG_NAMES.join(", ")}); it must pass mitLibrary: true to createConfig`;
}

/** Why the `license` field is not exactly `MIT`, or `undefined` when it is. */
function licenseDeclarationProblem(pkg: WorkspacePackage): string | undefined {
  if (pkg.licenseField === "MIT") return undefined;
  const found =
    pkg.licenseField === undefined
      ? 'omits the "license" field'
      : `declares "license": ${JSON.stringify(pkg.licenseField)}`;
  return `${pkg.dir}/package.json ${found}, but ADR-0002 designates ${pkg.name} as MIT: it must declare exactly "license": "MIT"`;
}

/** Runs the ADR-0002 checks over every MIT package of the workspace at `repoRoot`. */
export async function checkLicenseBoundary(repoRoot: string): Promise<LicenseBoundaryResult> {
  const packages = await loadWorkspacePackages(repoRoot);
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const violations: Violation[] = [];
  const notes: string[] = [];
  const mitPackages = packages.filter((pkg) => isDesignatedMit(pkg.name) || isMit(pkg.license));

  for (const pkg of mitPackages) {
    const violate = (kind: ViolationKind, message: string): void => {
      violations.push({ package: pkg.name, kind, message });
    };
    const designated = isDesignatedMit(pkg.name);

    if (designated) {
      const declaration = licenseDeclarationProblem(pkg);
      if (declaration !== undefined) violate("license-declaration", declaration);
    }

    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, specifier] of Object.entries(pkg.dependencies[field])) {
        const workspace = byName.get(name);
        if (workspace !== undefined) {
          if (!isMit(workspace.license)) {
            violate(
              "workspace-dependency",
              `${field}: ${name} is a workspace package under ${workspace.license ?? "no declared license"}; ` +
                "an MIT package may only depend on MIT workspace packages",
            );
          }
          continue;
        }
        if (specifier.startsWith("workspace:")) {
          violate(
            "workspace-dependency",
            `${field}: ${name} (${specifier}) is not a workspace package`,
          );
          continue;
        }

        const installed = await resolveInstalled(repoRoot, pkg.dir, name);
        const optional = field === "optionalDependencies" || pkg.optionalPeers.has(name);
        if (installed === undefined) {
          if (optional) {
            notes.push(
              `${pkg.name}: ${field} ${name} is not installed; its license was not checked`,
            );
          } else {
            violate(
              "unresolved-dependency",
              `${field}: ${name} is not installed, so its license cannot be checked (run pnpm install)`,
            );
          }
          continue;
        }
        const license = declaredLicense(installed);
        if (license === undefined) {
          violate("third-party-license", `${field}: ${name} declares no license`);
        } else if (!isAllowedLicense(license)) {
          violate(
            "third-party-license",
            `${field}: ${name} is licensed ${license}, which is not on the permissive allowlist ` +
              `(${PERMISSIVE_LICENSES.join(", ")})`,
          );
        }
      }
    }

    const problem = await licenseFileProblem(repoRoot, pkg.dir);
    if (problem !== undefined) violate("license-file", `${pkg.dir}: ${problem}`);

    if (designated) {
      const eslint = await eslintConfigProblem(repoRoot, pkg.dir);
      if (eslint !== undefined) violate("eslint-config", `${pkg.dir}: ${eslint}`);
    }
  }

  return {
    packages: packages.length,
    mitPackages: mitPackages.map((pkg) => pkg.name),
    violations,
    notes,
  };
}

/** The report the CLI prints. */
export function formatLicenseReport(result: LicenseBoundaryResult): string {
  const lines = [
    "License boundary check (ADR-0002: MIT packages may only depend on MIT workspace packages " +
      "and permissively licensed third-party packages)",
    `Checked ${String(result.packages)} workspace package(s); ` +
      (result.mitPackages.length === 0
        ? "none is MIT yet, so there is nothing to enforce."
        : `MIT: ${result.mitPackages.join(", ")}.`),
  ];
  for (const note of result.notes) lines.push(`  note: ${note}`);
  if (result.violations.length === 0) {
    lines.push("OK: no violations.");
    return `${lines.join("\n")}\n`;
  }
  const names = [...new Set(result.violations.map((violation) => violation.package))];
  for (const name of names) {
    lines.push("", `FAIL ${name}`);
    for (const violation of result.violations.filter((v) => v.package === name)) {
      lines.push(`  - [${violation.kind}] ${violation.message}`);
    }
  }
  lines.push(
    "",
    `${String(result.violations.length)} violation(s) in ${String(names.length)} package(s). ` +
      "See docs/adr/0002-licensing.md, rule 2.",
  );
  return `${lines.join("\n")}\n`;
}
