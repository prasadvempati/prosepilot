/**
 * ESM loader hooks that remap .js → .ts for local imports.
 * Only touches relative imports ending in .js; everything else passes through.
 * Also handles bare specifiers for packages with non-standard entry points.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

function tryResolvePackage(subpath) {
  const repoRoot = getRepoRoot();
  const target = path.join(repoRoot, "node_modules", subpath);
  if (existsSync(target)) {
    return { shortCircuit: true, url: pathToFileURL(target).href };
  }
  // Also check workspace node_modules
  const wsTarget = path.join(repoRoot, "services", "api", "node_modules", subpath);
  if (existsSync(wsTarget)) {
    return { shortCircuit: true, url: pathToFileURL(wsTarget).href };
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  // Workspace package isn't always linked in node_modules (partial installs). Resolve
  // @prosepilot/writing-core straight to packages/writing-core so tests can run.
  if (specifier === "@prosepilot/writing-core" || specifier.startsWith("@prosepilot/writing-core/")) {
    const repoRoot = getRepoRoot();
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

  // fastify 5.x uses "fastify.js" as main, not "index.js"
  if (specifier === "fastify") {
    const resolved = tryResolvePackage("fastify/fastify.js");
    if (resolved) return resolved;
  }

  // @clerk/backend ESM entry is at dist/index.mjs (or .js for require)
  if (specifier === "@clerk/backend" || specifier.startsWith("@clerk/backend/")) {
    const subpath = specifier === "@clerk/backend" ? "@clerk/backend/dist/index.mjs" : `@clerk/backend/${specifier.slice("@clerk/backend/".length)}`;
    const resolved = tryResolvePackage(subpath);
    if (resolved) return resolved;
  }

  // drizzle-orm uses "index.js" as ESM entry (type: module)
  if (specifier === "drizzle-orm" || specifier.startsWith("drizzle-orm/")) {
    const subpath = specifier === "drizzle-orm" ? "drizzle-orm/index.js" : `drizzle-orm/${specifier.slice("drizzle-orm/".length)}`;
    const resolved = tryResolvePackage(subpath);
    if (resolved) return resolved;
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
