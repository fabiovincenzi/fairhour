import { describe, expect, it } from "vitest";
import { createLibraryConfig } from "../tsdown.js";

describe("createLibraryConfig", () => {
  it("builds ESM and declarations from src/index.ts into a clean dist", () => {
    expect(createLibraryConfig()).toEqual({
      entry: ["src/index.ts"],
      format: "esm",
      platform: "neutral",
      dts: true,
      clean: true,
    });
  });

  it("lets a package override any default", () => {
    expect(createLibraryConfig({ entry: ["src/main.ts"], platform: "node" })).toMatchObject({
      entry: ["src/main.ts"],
      platform: "node",
      dts: true,
    });
  });
});
