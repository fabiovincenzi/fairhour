import { deepFreeze } from "../engine/freeze";
import { ownValue, setOwn } from "../internal/records";
import type { MessageCatalog, MessageCatalogs } from "./types";

/**
 * Merges catalogs locale by locale; for the same key in the same locale the later catalog wins.
 * The result always has an "en" catalog and is deeply frozen (the inputs are not modified).
 */
export function mergeCatalogs(...catalogs: readonly MessageCatalogs[]): MessageCatalogs {
  const english: Record<string, string> = {};
  const result: { en: MessageCatalog } & Record<string, Record<string, string>> = { en: english };
  for (const catalog of catalogs) {
    for (const [locale, messages] of Object.entries(catalog)) {
      let target = ownValue(result, locale);
      if (target === undefined) {
        target = {};
        setOwn(result, locale, target);
      }
      for (const [key, text] of Object.entries(messages)) setOwn(target, key, text);
    }
  }
  return deepFreeze(result);
}
