import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("root loading state", () => {
  it("renders a static, accessible skeleton with no locale-bound text", () => {
    const html = renderToStaticMarkup(<Loading />);

    expect(html).toContain('data-site-shell-state="loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-slot="skeleton"');
    expect(html).not.toContain("lang=");
  });
});
