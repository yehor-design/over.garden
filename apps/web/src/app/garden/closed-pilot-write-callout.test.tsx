import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ClosedPilotWriteCallout } from "./closed-pilot-write-callout";

describe("closed pilot locale handoff", () => {
  it("returns Bulgarian gardeners to Bulgarian public surfaces", () => {
    const html = renderToStaticMarkup(<ClosedPilotWriteCallout locale="bg" />);

    expect(html).toContain('href="/bg"');
    expect(html).toContain('href="/bg/privacy"');
    expect(html).toContain('href="/auth/help"');
  });
});
