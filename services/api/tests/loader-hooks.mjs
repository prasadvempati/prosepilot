/**
 * ESM loader hooks that remap .js → .ts for local imports.
 * Only touches relative imports ending in .js; everything else passes through.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export function resolve(specifier, context, nextResolve) {
  // Workspace package isn't always linked in node_modules (partial installs). Resolve
  // @prosepilot/writing-core straight to packages/writing-core so tests can run.
  if (specifier === "@prosepilot/writing-core" || specifier.startsWith("@prosepilot/writing-core/")) {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const pkgDir = path.join(repoRoot, "packages", "writing-core");
    const sub = specifier === "@prosepilot/writing-core" ? "dist/index.js" : specifier.slice("@prosepilot/writing-core/".length);
    const target = path.join(pkgDir, sub.endsWith(".js") || sub.includes("/") ? sub : sub);
    if (existsSync(target)) {
      return { shortCircuit: true, url: pathToFileURL(target).href };
    }
    const distTarget = path.join(pkgDir, "dist", "index.js");
    if (existsSync(distTarget)) {
      return { shortCircuit: true, url: pathToFileURL(distTarget).href };
    }
  }
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
