import { CODE_FILES, createConfig } from "@fairhour/config/eslint";

// Everything in this package is a command-line tool: printing to the console is expected.
export default createConfig({ tsconfigRootDir: import.meta.dirname, allowConsoleIn: CODE_FILES });
