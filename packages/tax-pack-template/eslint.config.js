import { createConfig } from "@fairhour/config/eslint";

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  mitLibrary: true,
  moneySafety: true,
});
