import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import GardenError from "./error";
import GardenLoading from "./loading";

describe("/garden route states", () => {
  it("keeps workspace hierarchy visible while owner data streams", () => {
    const html = renderToStaticMarkup(<GardenLoading />);

    expect(html).toContain('data-garden-workspace="loading"');
    expect(html).toContain("Loading your garden");
    expect(html).toContain("Living objects");
    expect(html).toContain("Recent continuity");
  });

  it("offers a recoverable unexpected-error action without rendering details", () => {
    const html = renderToStaticMarkup(
      <GardenError
        error={new Error("private database detail")}
        reset={vi.fn()}
      />,
    );

    expect(html).toContain('data-garden-workspace="unexpected-error"');
    expect(html).toContain("Your garden could not be loaded");
    expect(html).toContain("Try again");
    expect(html).not.toContain("private database detail");
  });
});
