import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "build",
  format: ["esm", "cjs"],
  target: "node20",
  splitting: false,
  clean: true,
  sourcemap: true,
  shims: true,
  minify: false,
});
