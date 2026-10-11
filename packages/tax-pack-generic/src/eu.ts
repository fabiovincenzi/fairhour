/**
 * EU Member States for VAT purposes (docs/tax-packs/generic.md, section 2.5). Used only to decide
 * whether the reverse-charge step and note cite Council Directive 2006/112/EC: nothing is computed
 * from it, and the reverse-charge decision itself still compares country codes only.
 *
 * The two provisions the pack cites (art. 196 and art. 226, point (11a)) concern a supplier and a
 * customer in different Member States, so the pack cites them only when both countries are EU
 * Member States on the issue date, and not before 2013-01-01, when point (11a) started to apply.
 *
 * Basis (mirrored in the docs, with how each was checked):
 * - Member States: Treaty on European Union, art. 52(1).
 * - Croatia: Member State from 2013-07-01 (Treaty of Accession of Croatia, OJ L 112, 24.4.2012).
 * - United Kingdom: left the EU on 2020-01-31, but Union VAT law applied to and in it until the
 *   end of the transition period on 2020-12-31 (Withdrawal Agreement, OJ L 29, 31.1.2020,
 *   art. 126 and 127).
 * - Point (11a) of art. 226: inserted by Council Directive 2010/45/EU, applied from 2013-01-01
 *   (art. 2 of that Directive); art. 196 in its current wording applies from 2010-01-01
 *   (Council Directive 2008/8/EC).
 *
 * Codes are ISO 3166-1 alpha-2, as in `ClientInput.country` (`GR` for Greece, whose VAT prefix is
 * `EL`). Territories with their own ISO code (Åland `AX`, Réunion `RE`, ...) are not listed.
 * Territories that share a Member State's code but are outside the EU VAT territory (Directive
 * art. 6: the Canary Islands, Mount Athos, Livigno, ...) cannot be told apart by a country code.
 */
import { compareIsoDate, isoDate, type IsoDate } from "@fairhour/tax-core";

/** The first issue day on which the pack cites the Directive: point (11a) applies from then. */
export const DIRECTIVE_CITED_FROM: IsoDate = isoDate("2013-01-01");

/** Membership bounds (inclusive) after {@link DIRECTIVE_CITED_FROM}; absent: no bound. */
interface Membership {
  readonly from?: IsoDate;
  readonly until?: IsoDate;
}

const ALWAYS: Membership = Object.freeze({});

/** A `Map`, not an object literal: lookups never reach `Object.prototype`. */
const EU_VAT_MEMBERSHIP: ReadonlyMap<string, Membership> = new Map<string, Membership>([
  ["AT", ALWAYS],
  ["BE", ALWAYS],
  ["BG", ALWAYS],
  ["CY", ALWAYS],
  ["CZ", ALWAYS],
  ["DE", ALWAYS],
  ["DK", ALWAYS],
  ["EE", ALWAYS],
  ["ES", ALWAYS],
  ["FI", ALWAYS],
  ["FR", ALWAYS],
  ["GR", ALWAYS],
  ["HR", Object.freeze({ from: isoDate("2013-07-01") })],
  ["HU", ALWAYS],
  ["IE", ALWAYS],
  ["IT", ALWAYS],
  ["LT", ALWAYS],
  ["LU", ALWAYS],
  ["LV", ALWAYS],
  ["MT", ALWAYS],
  ["NL", ALWAYS],
  ["PL", ALWAYS],
  ["PT", ALWAYS],
  ["RO", ALWAYS],
  ["SE", ALWAYS],
  ["SI", ALWAYS],
  ["SK", ALWAYS],
  ["GB", Object.freeze({ until: isoDate("2020-12-31") })],
]);

/** True when `country` is an EU Member State for VAT purposes on `on` (from 2013-01-01). */
export function isEuMemberState(country: string, on: IsoDate): boolean {
  if (compareIsoDate(on, DIRECTIVE_CITED_FROM) < 0) return false;
  const membership = EU_VAT_MEMBERSHIP.get(country);
  if (membership === undefined) return false;
  if (membership.from !== undefined && compareIsoDate(on, membership.from) < 0) return false;
  return membership.until === undefined || compareIsoDate(on, membership.until) <= 0;
}

/**
 * True when the Directive's reverse charge between Member States can be cited: the supplier and
 * the client are in two different EU Member States on the issue day.
 */
export function isIntraEuSupply(
  supplierCountry: string,
  clientCountry: string,
  on: IsoDate,
): boolean {
  return (
    supplierCountry !== clientCountry &&
    isEuMemberState(supplierCountry, on) &&
    isEuMemberState(clientCountry, on)
  );
}
