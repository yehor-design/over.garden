import { afterEach } from "vitest";

/**
 * Component tests opt into a DOM with `// @vitest-environment jsdom` at the top
 * of the file; everything else stays on the `node` environment, which is what
 * keeps the 3,700-test suite at ten seconds. This file is loaded for every test
 * and only does anything when a DOM is actually present.
 */
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
}
