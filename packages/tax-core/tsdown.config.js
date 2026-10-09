import { createLibraryConfig } from "@fairhour/config/tsdown";

export default createLibraryConfig({
  entry: ["src/index.ts", "src/conformance/index.ts"],
  // Only the conformance entry imports node:fs/node:path (to read golden fixtures); they stay
  // external. The main entry never imports node:* (src/purity.test.ts checks it).
  deps: { neverBundle: [/^node:/] },
});
