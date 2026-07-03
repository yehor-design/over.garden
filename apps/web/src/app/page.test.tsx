import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home, { metadata } from "./page";

describe("/", () => {
  it("is an indexable authored landing page without leaking private routes", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.description).toContain("living, dated record");
    expect(html).toContain("Keep a living record");
    expect(html).not.toContain("/join?");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/garden/pilot");
  });
});
