import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  tsconfig: "tsconfig.build.json",

  // If need to bundle CSS
  // loader: {
  //   ".css": "copy",
  // },
});
