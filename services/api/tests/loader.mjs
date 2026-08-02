/**
 * ESM loader that remaps .js → .ts for local imports.
 * Registered via --import, uses register() from node:module.
 *
 * Usage: node --experimental-strip-types --import ./tests/loader.mjs --test tests/api.test.ts
 */
import { register } from "node:module";

register("./loader-hooks.mjs", import.meta.url);
