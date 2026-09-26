import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportContentLink } from "./report-content-link";

describe("ReportContentLink", () => {
  it("is a named link to the report form carrying the page's address", () => {
    const html = renderToStaticMarkup(
      <ReportContentLink address="/@olena/post/7" label="Поскаржитися" />,
    );
    expect(html).toContain('href="/report?address=%2F%40olena%2Fpost%2F7"');
    expect(html).toMatch(/<a[^>]*>.*Поскаржитися<\/a>/u);
    expect(html).toContain('rel="nofollow"');
    expect(html).toContain('aria-hidden="true"');
  });
});
