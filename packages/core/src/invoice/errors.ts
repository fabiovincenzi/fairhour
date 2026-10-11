import { MAX_INVOICE_LINES } from "@fairhour/tax-core";
import { CoreError } from "../errors";

/** Why an invoice draft could not be built (the data cannot be invoiced as it is). */
export type DraftErrorReason =
  /** An entry that starts inside the period is still running: stop it before invoicing. */
  | "running-entry"
  /** A price is in another currency than the invoice and no explicit exchange rate was given. */
  | "missing-exchange-rate"
  /** An entry belongs to a project that has no billing settings in `projects`. */
  | "unknown-project"
  /** Two projects, two selected entries or two extra lines share an id. */
  | "duplicate-id"
  /** An id is empty, too long or has characters that cannot be part of a line id. */
  | "invalid-id"
  /** The period starts after it ends. */
  | "invalid-period"
  /** More lines than an invoice can have. */
  | "too-many-lines";

const MESSAGES: Readonly<Record<DraftErrorReason, string>> = {
  "running-entry": "An entry in the period is still running: stop it before invoicing",
  "missing-exchange-rate":
    "A price is in another currency than the invoice and no explicit exchange rate was given",
  "unknown-project": "An entry belongs to a project that has no billing settings",
  "duplicate-id": "Project, entry and extra line ids must be unique",
  "invalid-id": "Ids must be 1 to 48 characters among A-Z a-z 0-9 . _ -",
  "invalid-period": "The period starts after it ends",
  "too-many-lines": `An invoice has at most ${MAX_INVOICE_LINES} lines`,
};

/**
 * The invoice draft builder refused its input (CORE-009). Narrow on `reason`. The message never
 * contains user text; `subject` names what the reason is about (an entry, project or extra
 * line id, or the currency without an exchange rate) for the caller to show or log.
 */
export class DraftError extends CoreError {
  override readonly name = "DraftError";
  readonly code = "invalid-invoice-draft";
  readonly reason: DraftErrorReason;
  readonly subject: string | undefined;

  constructor(reason: DraftErrorReason, subject?: string) {
    super(
      reason === "missing-exchange-rate" && subject !== undefined
        ? `No explicit exchange rate from ${subject} to the invoice currency`
        : MESSAGES[reason],
    );
    this.reason = reason;
    this.subject = subject;
  }
}
