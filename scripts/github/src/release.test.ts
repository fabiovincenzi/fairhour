import { describe, expect, it } from "vitest";
import { releaseCommand } from "./release.ts";

describe("releaseCommand", () => {
  it("publishes to npm only when NPM_PUBLISH_ENABLED is exactly 'true'", () => {
    const command = releaseCommand({ NPM_PUBLISH_ENABLED: "true" });
    expect(command.args).toEqual(["exec", "changeset", "publish"]);
    expect(command.description).toContain("publishing");
  });

  it.each([undefined, "", "false", "TRUE", "1", "yes"])(
    "only creates git tags when NPM_PUBLISH_ENABLED is %j",
    (value) => {
      const command = releaseCommand({ NPM_PUBLISH_ENABLED: value });
      expect(command.args).toEqual(["exec", "changeset", "git-tag"]);
      expect(command.description).toContain("git tags only");
    },
  );

  it("ignores unrelated variables such as NPM_TOKEN", () => {
    expect(releaseCommand({ NPM_TOKEN: "secret" }).args).toEqual(["exec", "changeset", "git-tag"]);
  });
});
