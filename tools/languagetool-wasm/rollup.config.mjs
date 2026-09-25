import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";

export default {
  input: "offline-grammar-worker.js",
  output: {
    file: "../../apps/extension/lib/offline-grammar-worker.js",
    format: "iife",
    name: "OfflineGrammarWorker",
    sourcemap: true,
  },
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    json(),
    terser(),
  ],
};