import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { coreMessages, formatMessage, mergeCatalogs, parseMessage } from "@fairhour/tax-core";
import { describe, expect, test } from "vitest";
import { en } from "./en";
import { itMessages } from "./index";
import { it as italian } from "./it";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** Every non-test TypeScript file of src/. */
function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const code = sourceFiles(SRC)
  .filter((path) => !path.includes(join("src", "messages")))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

describe("message catalogs (docs section 12)", () => {
  test("en and it have the same keys and the same placeholders", () => {
    expect(Object.keys(italian).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect([...parseMessage(italian[key], key)].sort()).toEqual(
        [...parseMessage(en[key], key)].sort(),
      );
    }
  });

  test("every key used in the code exists, and every key is used", () => {
    const used = [...code.matchAll(/message\(\s*"([^"]+)"/g)].map((match) => match[1] ?? "");
    const pack = used.filter((key) => !key.startsWith("core."));
    for (const key of pack) expect(Object.keys(en)).toContain(key);
    // meta.name and meta.description are read by the app (PackMeta), not by the rules.
    const ruleKeys = Object.keys(en).filter(
      (key) => key !== "meta.name" && key !== "meta.description",
    );
    for (const key of ruleKeys) expect(code.includes(`"${key}"`), key).toBe(true);
  });

  test("the legal notes are the wording of the specification", () => {
    const notes: Readonly<Record<string, string>> = {
      "it.note.forfettario":
        "Operazione effettuata in regime forfettario ai sensi dell'articolo 1, commi da 54 a 89, della Legge n. 190/2014 e successive modificazioni.",
      "it.note.forfettario-no-withholding":
        "Si richiede la non applicazione della ritenuta alla fonte a titolo d'acconto ai sensi dell'articolo 1, comma 67, della Legge n. 190/2014.",
      "it.note.art15":
        "Spese anticipate in nome e per conto del cliente, escluse dalla base imponibile IVA ai sensi dell'articolo 15, primo comma, n. 3), del DPR n. 633/1972.",
      "it.note.exempt": "Operazione esente da IVA ({reference}).",
      "it.note.out-of-scope": "Operazione non soggetta a IVA ({reference}).",
      "it.note.reverse-charge-eu":
        "Inversione contabile: operazione non soggetta a IVA in Italia ai sensi dell'articolo 7-ter del DPR n. 633/1972.",
      "it.note.outside-eu":
        "Operazione non soggetta ai sensi dell'articolo 7-ter del DPR n. 633/1972.",
      "it.note.stamp-duty":
        "Imposta di bollo assolta in modo virtuale ai sensi dell'articolo 6 del DM 17 giugno 2014.",
      "it.note.split-payment":
        "Scissione dei pagamenti ai sensi dell'articolo 17-ter del DPR n. 633/1972.",
      "it.note.custom": "{text}",
      "meta.disclaimer":
        "Gli importi sono indicativi e vanno verificati con il proprio commercialista prima di emettere la fattura.",
    };
    for (const [key, text] of Object.entries(notes))
      expect(italian[key as keyof typeof en]).toBe(text);
  });

  test("legal notes stay within Latin-1 (FatturaPA text fields)", () => {
    for (const [key, text] of Object.entries(italian)) {
      // eslint-disable-next-line no-control-regex -- the Latin-1 range is the point
      if (key.startsWith("it.note.")) expect(text).toMatch(/^[\u0000-ÿ]*$/);
    }
  });

  test("every message without parameters formats in both locales", () => {
    const catalogs = mergeCatalogs(coreMessages, itMessages);
    for (const key of Object.keys(en)) {
      if (parseMessage(en[key as keyof typeof en]).length > 0) continue;
      for (const locale of ["en", "it"])
        expect(formatMessage({ key }, catalogs, locale)).not.toBe("");
    }
  });

  test("the catalogs are frozen", () => {
    expect(Object.isFrozen(itMessages.en)).toBe(true);
    expect(Object.isFrozen(itMessages)).toBe(true);
  });
});
