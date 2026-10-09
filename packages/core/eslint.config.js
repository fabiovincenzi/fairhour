import { createConfig } from "@fairhour/config/eslint";

export default createConfig({ tsconfigRootDir: import.meta.dirname, moneySafety: true });
