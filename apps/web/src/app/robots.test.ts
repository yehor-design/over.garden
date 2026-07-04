import { describe, expect, it } from "vitest";

import robots from "./robots";

describe("/robots.txt", () => {
  it("allows public discovery and points crawlers to the canonical sitemap", () => {
    expect(robots()).toEqual({
      rules: [
        {
          userAgent: "*",
          allow: "/",
        },
      ],
      sitemap: "https://over.garden/sitemap.xml",
    });
  });
});
