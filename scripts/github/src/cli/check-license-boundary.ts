import path from "node:path";
import { checkLicenseBoundary, formatLicenseReport } from "../license-boundary.ts";

// Usage: node check-license-boundary.ts [repo-root]   (defaults to this repository)
const repoRoot = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "../../../.."));
const result = await checkLicenseBoundary(repoRoot);

process.stdout.write(formatLicenseReport(result));
process.exit(result.violations.length === 0 ? 0 : 1);
