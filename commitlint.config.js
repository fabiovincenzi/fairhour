export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // DCO: every commit is signed off (`git commit -s`).
    "signed-off-by": [2, "always", "Signed-off-by:"],
    "header-max-length": [2, "always", 100],
    // Unknown scopes only warn: a new package or area should not block a commit.
    "scope-enum": [
      1,
      "always",
      [
        "web",
        "desktop",
        "docs",
        "api",
        "db",
        "ui",
        "pdf",
        "core",
        "money",
        "tax-core",
        "tax-pack-it",
        "tax-pack-generic",
        "tax-pack-template",
        "config",
        "github-scripts",
        "i18n",
        "deps",
        "ci",
        "release",
        "backlog",
        "maintainers",
      ],
    ],
  },
};
