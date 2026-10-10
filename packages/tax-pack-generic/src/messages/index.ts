import type { MessageCatalogs } from "@fairhour/tax-core";
import { deepFreeze } from "../freeze";
import { en } from "./en";
import { it } from "./it";

/** The pack's catalogs (`en` is the source locale). Keys `core.*` come from tax-core. */
export const genericMessages: MessageCatalogs = deepFreeze({ en: { ...en }, it: { ...it } });
