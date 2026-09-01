import { createRequire } from "node:module";

/**
 * `@/server/*` modules open with `import "server-only"`, a guard that throws
 * when the module is reached outside a Next server bundle. An operator proof
 * that must exercise the real repository therefore cannot import it under a
 * plain Node runtime.
 *
 * This neutralises the guard the same way `vitest.config.ts` does for the test
 * suites — by resolving it to an empty module — and nothing else. Import it
 * before any `@/server/*` import; ES module evaluation order guarantees it runs
 * first. Inside Next the guard is resolved by the bundler, never by Node, so
 * this file has no effect there and must never be imported from application
 * code.
 */
try {
  const nodeRequire = createRequire(`${process.cwd()}/`);
  const resolved = nodeRequire.resolve("server-only");
  nodeRequire.cache[resolved] = {
    id: resolved,
    filename: resolved,
    path: resolved,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  } as unknown as NodeJS.Module;
} catch {
  // Nothing resolvable to neutralise: the guard is not reachable from here, so
  // no `@/server/*` import in this process can be stopped by it.
}

export {};
