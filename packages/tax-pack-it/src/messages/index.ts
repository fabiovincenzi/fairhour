import type { MessageCatalogs } from "@fairhour/tax-core";
import { deepFreeze } from "../freeze";
import { en } from "./en";
import { it } from "./it";

/** The pack's catalogs: English (source) and Italian (document locale). */
export const itMessages: MessageCatalogs = deepFreeze({ en: { ...en }, it: { ...it } });
