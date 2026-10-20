import { build } from "esbuild";

/**
 * Bundles the API and the workspace packages it uses (which ship TypeScript source) into one
 * file, dist/server.mjs, so the container only needs Node: no TypeScript, no node_modules.
 */
await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // Some dependencies are CommonJS and call require(); give the ES module bundle one.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});
