import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SaveProgressMoment } from "./save-progress-moment";

describe("SaveProgressMoment", () => {
  it("renders first-save readback as a compact local win", () => {
    const html = renderToStaticMarkup(
      <SaveProgressMoment
        kind="first-entry"
        entryCount={1}
        objectName="Balcony tomato"
        primaryHref="#follow-up-composer"
        primaryLabel="Add another entry"
        secondaryHref="/garden"
        secondaryLabel="Back to journal"
      />,
    );

    expect(html).toContain("Your garden record has started");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("1 / 4 starter notes");
    expect(html).toContain("#follow-up-composer");
    expect(html).toContain("Back to journal");
    expect(html).not.toMatch(/leaderboard|streak|likes|followers|modal/i);
  });

  it("renders follow-up readback without hiding the next action", () => {
    const html = renderToStaticMarkup(
      <SaveProgressMoment
        kind="follow-up"
        entryCount={2}
        objectName="Balcony tomato"
        primaryHref="#follow-up-composer"
        primaryLabel="Add another entry"
      />,
    );

    expect(html).toContain("This record is getting useful");
    expect(html).toContain("2 dated notes");
    expect(html).toContain("w-1/2");
    expect(html).toContain("Add another entry");
    expect(html).not.toMatch(/share|feed|public praise|leaderboard|streak/i);
  });
});
