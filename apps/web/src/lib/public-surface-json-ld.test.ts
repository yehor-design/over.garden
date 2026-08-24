import { describe, expect, it } from "vitest";

import { serializePublicSurfaceJsonLd } from "./public-surface-json-ld";

describe("public surface JSON-LD serialization", () => {
  it("is client-safe and escapes markup boundaries", () => {
    expect(
      serializePublicSurfaceJsonLd({
        headline: "</script><script>unsafe</script>",
      }),
    ).toBe('{"headline":"\\u003c/script>\\u003cscript>unsafe\\u003c/script>"}');
    expect(serializePublicSurfaceJsonLd(null)).toBeNull();
  });
});
