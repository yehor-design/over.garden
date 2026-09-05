import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/garden/catalog/typeahead", () => {
  it("answers a permanent redirect to the public picker route with the query intact", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/api/garden/catalog/typeahead?q=%D1%82%D0%BE%D0%BC%D0%B0%D1%82&kind=plant",
      ),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/api/public/catalog/typeahead?q=%D1%82%D0%BE%D0%BC%D0%B0%D1%82&kind=plant",
    );
  });
});
