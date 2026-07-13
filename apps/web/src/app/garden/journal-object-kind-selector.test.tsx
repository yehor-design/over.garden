import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { JournalObjectKindSelector } from "./journal-object-kind-selector";

describe("journal object kind selector", () => {
  it("keeps plants, animals, and bee colonies explicit in the primary flow", () => {
    const html = renderToStaticMarkup(
      <JournalObjectKindSelector value="animal" onChange={vi.fn()} />,
    );

    expect(html).toContain("Plant");
    expect(html).toContain("Animal");
    expect(html).toContain("Bee colony");
    expect(html).toContain('data-object-kind="animal"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toMatch(/car|vehicle/i);
  });
});
