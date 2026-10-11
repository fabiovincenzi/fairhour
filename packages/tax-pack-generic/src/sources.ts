/**
 * Sources cited by the generic pack (docs/tax-packs/generic.md, section 2.5).
 *
 * The pack applies no country's law: every rate, label and wording comes from the workspace's
 * tax settings, so every rule and the parameter version cite the user's configuration (kind
 * `user-configuration`). That source is `to-be-verified` on purpose: the pack cannot check what
 * the user configured, and the UI shows the marker next to every figure it produced.
 *
 * The reverse-charge classification also cites, as context only, the two provisions of the EU
 * VAT Directive behind the usual wording, and only in the case they were written for here: an
 * automatic reverse charge to a business client in another country, both countries being EU
 * Member States on the issue day (src/eu.ts). A forced reverse charge (for example a domestic
 * scheme) and parties outside the EU cite the configuration only. The pack does not apply EU law (it does not check
 * VAT registration, establishment or the place of supply); it prints the user's wording.
 */
import { isoDate, type SourceRef } from "@fairhour/tax-core";

const VERIFIED_ON = isoDate("2026-10-10");

/** EUR-Lex permanent (ELI) link of Council Directive 2006/112/EC. */
const VAT_DIRECTIVE_URL = "https://eur-lex.europa.eu/eli/dir/2006/112/oj";
const VAT_DIRECTIVE_TITLE =
  "Council Directive 2006/112/EC of 28 November 2006 on the common system of value added tax";

/** Values supplied in the workspace's tax settings: the only source of every amount. */
export const userConfiguration: SourceRef = Object.freeze({
  id: "generic.user-configuration",
  kind: "user-configuration",
  title: "Workspace tax settings",
  citation: "Values supplied in the workspace's tax settings",
  verification: Object.freeze({
    status: "to-be-verified",
    reason:
      "Supplied by the user: the pack cannot verify the rates, labels and wording configured in the workspace's tax settings; check them with an accountant or the tax authority",
  }),
  note: "The generic pack knows no country's law: the user is responsible for the configured values.",
});

/** Art. 196: the customer is liable for VAT on B2B services from a supplier established elsewhere. */
export const vatDirectiveArt196: SourceRef = Object.freeze({
  id: "generic.eu.dir-2006-112.art-196",
  kind: "eu-law",
  title: VAT_DIRECTIVE_TITLE,
  citation: "art. 196",
  url: VAT_DIRECTIVE_URL,
  verification: Object.freeze({
    status: "verified",
    on: VERIFIED_ON,
    against: "secondary",
  }),
  note: "Context only: the pack does not apply EU law. Cited only between a supplier and a client in different EU Member States on the issue day (from 2013-01-01), for an automatic reverse charge: not for a forced reverse charge (a domestic scheme rests on national law) nor when a party is outside the EU (art. 196 can also cover a supplier established outside the EU, but the pack cannot check where a party is established). Checked against professional VAT literature (the customer of Article 44 services from a supplier not established in the Member State is liable); EUR-Lex was not reachable from the build environment, so a maintainer should read the consolidated text and upgrade the verification to primary-text.",
});

/** Art. 226 point (11a): the invoice mention "Reverse charge" when the customer is liable. */
export const vatDirectiveArt226: SourceRef = Object.freeze({
  id: "generic.eu.dir-2006-112.art-226-11a",
  kind: "eu-law",
  title: VAT_DIRECTIVE_TITLE,
  citation: "art. 226, point (11a)",
  url: VAT_DIRECTIVE_URL,
  verification: Object.freeze({
    status: "verified",
    on: VERIFIED_ON,
    against: "secondary",
  }),
  note: "Context only: the pack prints the wording configured by the user. Cited only between a supplier and a client in different EU Member States on the issue day, for an automatic reverse charge, and from 2013-01-01 (point (11a) was inserted by Directive 2010/45/EU): not for a forced reverse charge nor when a party is outside the EU, where the pack cannot tell which law makes the customer liable. Checked against a quoted extract of point (11a) (\"where the customer is liable for the payment of the VAT, the mention 'Reverse charge'\") in published case-law commentary; EUR-Lex was not reachable from the build environment, so a maintainer should read the consolidated text and upgrade the verification to primary-text.",
});

/**
 * Sources of the reverse-charge trace step and legal note when the reverse charge applies
 * automatically between two EU Member States (and of the classification rule, which may cite
 * them). A forced reverse charge and parties outside the EU cite {@link configurationSources}.
 */
export const reverseChargeSources: readonly SourceRef[] = Object.freeze([
  userConfiguration,
  vatDirectiveArt196,
  vatDirectiveArt226,
]);

/** Sources of every other step: the user's configuration only. */
export const configurationSources: readonly SourceRef[] = Object.freeze([userConfiguration]);
