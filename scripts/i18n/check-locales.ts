import { appendFile, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  compareLocale,
  formatReports,
  isFailing,
  type AppReport,
  type Messages,
} from "./src/locales.ts";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const appsDir = path.join(repoRoot, "apps");

async function readJson(file: string): Promise<Messages> {
  return JSON.parse(await readFile(file, "utf8")) as Messages;
}

const reports: AppReport[] = [];
for (const app of (await readdir(appsDir).catch(() => [])).sort()) {
  const messagesDir = path.join(appsDir, app, "messages");
  const files = await readdir(messagesDir).catch(() => [] as string[]);
  if (!files.includes("en.json")) continue;
  const english = await readJson(path.join(messagesDir, "en.json"));
  const locales = [];
  for (const file of files.filter((f) => f.endsWith(".json") && f !== "en.json").sort()) {
    locales.push(
      compareLocale(
        file.replace(/\.json$/, ""),
        english,
        await readJson(path.join(messagesDir, file)),
      ),
    );
  }
  reports.push({ app, locales });
}

const summary = formatReports(reports);
console.log(summary);
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) await appendFile(summaryFile, summary);
if (reports.some((app) => app.locales.some(isFailing))) {
  console.error("Some locales are missing keys or have mismatched placeholders.");
  process.exit(1);
}
