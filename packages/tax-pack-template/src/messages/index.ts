import type { MessageCatalogs } from "@fairhour/tax-core";
import { deepFreeze } from "../freeze";
import { en } from "./en";
import { eo } from "./eo";

// TEMPLATE: one entry per catalog, the same locales as meta.locales (index.ts).
/** The pack's catalogs (`en` is the source locale). Keys `core.*` come from tax-core. */
export const xxMessages: MessageCatalogs = deepFreeze({ en: { ...en }, eo: { ...eo } });
