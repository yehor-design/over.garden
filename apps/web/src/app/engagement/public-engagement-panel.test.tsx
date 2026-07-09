import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicEngagementPanel } from "./public-engagement-panel";

describe("PublicEngagementPanel", () => {
  it("localizes engagement chrome without changing public comments", () => {
    const html = renderToStaticMarkup(
      <PublicEngagementPanel
        locale="ru"
        target={{ kind: "variety", ref: "red-cherry" }}
        returnTo="/variety/red-cherry"
        summary={{
          target: { kind: "variety", ref: "red-cherry" },
          activeLikeCount: 2,
          comments: [
            {
              key: "comment:1",
              replyToken: "comment-token",
              body: "Looks sturdy after rain.",
              authorLabel: "@green_thumb",
              authorHandle: "green_thumb",
              parentReplyToken: null,
              createdAt: "2026-07-04T08:00:00.000Z",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Нравится");
    expect(html).toContain("Ответить");
    expect(html).toContain("Looks sturdy after rain.");
  });
});
