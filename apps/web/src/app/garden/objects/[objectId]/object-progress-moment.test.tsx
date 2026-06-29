import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ObjectProgressMoment } from "./object-progress-moment";

describe("ObjectProgressMoment", () => {
  it("renders a private chronological readback with derivative-only media", () => {
    const html = renderToStaticMarkup(
      <ObjectProgressMoment
        plantName="Balcony tomato"
        entries={[
          {
            id: "entry-1",
            title: "First check-in",
            body: "Planted the seedling and watered lightly.",
            entryDate: "2026-06-01",
            mediaPublicUrl: "https://media.over.garden/earlier.webp",
          },
          {
            id: "entry-2",
            title: "First flowers",
            body: "Two small yellow flowers opened today.",
            entryDate: "2026-06-15",
            mediaPublicUrl: "https://media.over.garden/latest.webp",
          },
        ]}
      />,
    );

    expect(html).toContain("Your plant progress");
    expect(html).toContain("only you can see this");
    expect(html).toContain("First check-in");
    expect(html).toContain("First flowers");
    expect(html).toContain("Earlier photo");
    expect(html).toContain("Latest photo");
    expect(html).toContain("https://media.over.garden/earlier.webp");
    expect(html).toContain("https://media.over.garden/latest.webp");
    expect(html).not.toContain("derivative_key");
    expect(html).not.toContain("quarantine");
  });
});
