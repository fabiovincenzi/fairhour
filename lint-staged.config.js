const CODE = "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}";

// Prettier and ESLint run one after the other on the same files (one glob, several commands) so
// they never race. Files ESLint ignores (build output, etc.) are skipped instead of warned about.
export default {
  [CODE]: ["prettier --write", "eslint --fix --max-warnings=0 --no-warn-ignored"],
  [`!(${CODE})`]: "prettier --write --ignore-unknown",
};
