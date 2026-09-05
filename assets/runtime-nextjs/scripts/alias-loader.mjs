import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";
const root = pathResolve(dirname(fileURLToPath(import.meta.url)), "../src");
export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = pathResolve(root, specifier.slice(2));
    for (const path of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (existsSync(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}
