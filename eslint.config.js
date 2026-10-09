import { createConfig } from "@fairhour/config/eslint";

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  // Workspaces lint themselves (`turbo run lint`); this config only covers the root files.
  ignores: ["apps/**", "packages/**", "scripts/**"],
});
