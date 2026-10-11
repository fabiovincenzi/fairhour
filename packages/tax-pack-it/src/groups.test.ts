import { decimal } from "@fairhour/money";
import { describe, expect, test } from "vitest";
import {
  aliquotaIva,
  compareGroups,
  n1Group,
  n21Group,
  n22Group,
  n4Group,
  vatGroup,
  vatGroupId,
} from "./groups";

describe("tax groups (docs section 6)", () => {
  test.each([
    ["22", "vat-22", "22.00"],
    ["22.00", "vat-22", "22.00"],
    ["10", "vat-10", "10.00"],
    ["5", "vat-5", "5.00"],
    ["4", "vat-4", "4.00"],
    ["5.5", "vat-5.5", "5.50"],
  ])("rate %s -> %s, AliquotaIVA %s", (rate, id, code) => {
    expect(vatGroupId(decimal(rate))).toBe(id);
    expect(aliquotaIva(decimal(rate))).toBe(code);
    const group = vatGroup(decimal(rate));
    expect(group).toMatchObject({
      id,
      treatment: "taxable",
      exportCodes: { "fatturapa.AliquotaIVA": code },
    });
  });

  test.each([
    [n22Group("forfettario"), "n2.2", "out-of-scope", "N2.2", "it.group.n2-2-forfettario"],
    [n22Group("ordinario"), "n2.2", "out-of-scope", "N2.2", "it.group.n2-2"],
    [n21Group(), "n2.1", "out-of-scope", "N2.1", "it.group.n2-1"],
    [n4Group(), "n4", "exempt", "N4", "it.group.n4"],
    [n1Group(), "n1", "excluded", "N1", "it.group.n1"],
  ])("%o", (group, id, treatment, natura, label) => {
    expect(group.id).toBe(id);
    expect(group.treatment).toBe(treatment);
    expect(group.rate).toBeUndefined();
    expect(group.exportCodes).toEqual({ "fatturapa.Natura": natura });
    expect(group.label.key).toBe(label);
  });

  test("canonical order: VAT by descending rate, then N2.1, N2.2, N4, N1", () => {
    const groups = [
      n1Group(),
      vatGroup(decimal("4")),
      n4Group(),
      n22Group("ordinario"),
      vatGroup(decimal("22")),
      n21Group(),
      vatGroup(decimal("10")),
    ];
    expect([...groups].sort(compareGroups).map((group) => group.id)).toEqual([
      "vat-22",
      "vat-10",
      "vat-4",
      "n2.1",
      "n2.2",
      "n4",
      "n1",
    ]);
  });
});
