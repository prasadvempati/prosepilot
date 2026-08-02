/**
 * ESM loader hooks that remap .js → .ts for local imports.
 * Only touches relative imports ending in .js; everything else passes through.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export function resolve(specifier, context, nextResolve) {
  // Only remap relative imports ending in .js
  const isRelative =
    specifier.startsWith("./") || specifier.startsWith("../") ||
    specifier.startsWith(".\\") || specifier.startsWith("..\\");
  if (isRelative && specifier.endsWith(".js")) {
    const tsVariant = specifier.replace(/\.js$/, ".ts");
    try {
      const parentPath = context.parentURL
        ? fileURLToPath(context.parentURL)
        : process.cwd();
      const parentDir = path.dirname(parentPath);
      const resolved = path.resolve(parentDir, tsVariant);
      if (existsSync(resolved)) {
        return { shortCircuit: true, url: pathToFileURL(resolved).href };
      }
    } catch (e) {
      // Fall through to nextResolve
    }
  }
  return nextResolve(specifier, context);
}
