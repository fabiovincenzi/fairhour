import { describe, expect, it } from "vitest";
import prettier from "../prettier.js";

describe("prettier preset", () => {
  it("uses the Fairhour house style", () => {
    expect(prettier).toMatchObject({
      printWidth: 100,
      singleQuote: false,
      trailingComma: "all",
      semi: true,
      endOfLine: "lf",
    });
  });
});
