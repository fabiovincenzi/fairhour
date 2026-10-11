/**
 * The legal sources the Exampleland pack cites: one `SourceRef` per provision, reused by the
 * rules (`Rule.sources`), the parameter versions and, through them, every trace step. Mirror
 * each one in the pack's documentation (docs/tax-packs/<cc>.md, "Sources").
 *
 * Exampleland and its laws are FICTIONAL. Every source below is marked `to-be-verified` with that
 * reason, and its URL points at example.com, a domain reserved for documentation (RFC 2606).
 */
import type { SourceRef, SourceVerification } from "@fairhour/tax-core";
import { deepFreeze } from "./freeze";

// TEMPLATE: replace every source with a real provision of your country. For each one:
// - `id`: unique within the pack and stable, "<cc>.<act>.<article>" ("de.ustg.par-19");
// - `kind`: statute, regulation, eu-law, ruling, guidance, technical-specification, case-law,
//   professional-practice or user-configuration;
// - `title`: the official title in the source's language; `citation`: the pinpoint (article,
//   paragraph, letter); `url`: an https link to the official text, when one exists;
// - `verification`: how you checked it. Use
//     { status: "verified", on: isoDate("2026-10-10"), against: "primary-text" }
//   ("official-summary" or "secondary" when you could not read the consolidated text), and
//     { status: "to-be-verified", reason: "..." }
//   when you could not confirm it. Never invent a citation: mark it to be verified instead.

const FICTIONAL: SourceVerification = {
  status: "to-be-verified",
  reason:
    "Fictional provision of the Exampleland template pack: replace it with a real one and verify it",
};

const VAT_ACT = "Exampleland Value Added Tax Act (fictional)";
const VAT_ACT_URL = "https://example.com/exampleland/vat-act";

/** Art. 5: VAT rates, standard and reduced. */
export const vatActRates: SourceRef = deepFreeze({
  id: "xx.vat-act.art-5",
  kind: "statute",
  title: VAT_ACT,
  citation: "art. 5 (rates)",
  url: `${VAT_ACT_URL}#art-5`,
  verification: FICTIONAL,
});

/** Art. 12: exempt supplies, supplies outside the scope of VAT, and the reason on the invoice. */
export const vatActExemptions: SourceRef = deepFreeze({
  id: "xx.vat-act.art-12",
  kind: "statute",
  title: VAT_ACT,
  citation: "art. 12 (exemptions and supplies outside the scope of VAT)",
  url: `${VAT_ACT_URL}#art-12`,
  verification: FICTIONAL,
});

/** Art. 30: the small-business exemption and the note its invoices must carry. */
export const vatActSmallBusiness: SourceRef = deepFreeze({
  id: "xx.vat-act.art-30",
  kind: "statute",
  title: VAT_ACT,
  citation: "art. 30 (small-business exemption)",
  url: `${VAT_ACT_URL}#art-30`,
  verification: FICTIONAL,
  note: "Below the annual turnover threshold, a business may choose not to charge VAT; its invoices must say so.",
});

/** Art. 25: income tax withheld on professional fees by clients that are withholding agents. */
export const incomeTaxActWithholding: SourceRef = deepFreeze({
  id: "xx.income-tax-act.art-25",
  kind: "statute",
  title: "Exampleland Income Tax Act (fictional)",
  citation: "art. 25 (withholding on professional fees)",
  url: "https://example.com/exampleland/income-tax-act#art-25",
  verification: FICTIONAL,
});

/** The 2025 budget act, which raised the standard VAT rate from 2026-01-01. */
export const budgetAct2025: SourceRef = deepFreeze({
  id: "xx.budget-act-2025.art-3",
  kind: "statute",
  title: "Exampleland Budget Act 2025 (fictional)",
  citation: "art. 3 (standard VAT rate from 1 January 2026)",
  verification: FICTIONAL,
});
