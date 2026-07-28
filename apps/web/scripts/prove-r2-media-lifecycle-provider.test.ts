import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("OVE-216 provider proof request bounds", () => {
  it("passes a finite abort signal to every AWS SDK request", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("./prove-r2-media-lifecycle-provider.ts", import.meta.url),
      ),
      "utf8",
    );

    const sends = source.match(/client\.send\(/g) ?? [];
    const boundedSends = source.match(
      /\{ abortSignal: AbortSignal\.timeout\(PROVIDER_REQUEST_TIMEOUT_MS\) \}/g,
    ) ?? [];

    expect(sends).toHaveLength(5);
    expect(boundedSends).toHaveLength(sends.length);
  });
});
