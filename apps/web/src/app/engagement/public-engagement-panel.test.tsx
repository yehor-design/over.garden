import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicEngagementPanel } from "./public-engagement-panel";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";

describe("PublicEngagementPanel", () => {
  it("renders a contribution thread without generic engagement controls or device activity", () => {
    const html = renderToStaticMarkup(
      <PublicEngagementPanel
        isAuthenticated={false}
        locale="uk"
        target={{
          kind: "community_contribution",
          ref: "00000000-0000-4000-8000-000000000201",
        }}
        returnTo="/communities/observation-and-care/discussions/00000000-0000-4000-8000-000000000201"
        commentOnly
        summary={{
          target: {
            kind: "community_contribution",
            ref: "00000000-0000-4000-8000-000000000201",
          },
          comments: [],
        }}
      />,
    );

    expect(html).toContain('name="action" value="comment"');
    expect(html).not.toContain("/api/engagement/likes");
    expect(html).not.toContain("/api/engagement/bookmarks");
    expect(html).not.toContain("/api/engagement/follows");
    expect(html).not.toContain("anonymousToken");
  });

  it("localizes engagement chrome without changing public comments", () => {
    const html = renderToStaticMarkup(
      <PublicEngagementPanel
        isAuthenticated
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

  it("asks a guest to sign in before showing comment input or mutating bookmarks", () => {
    const html = renderToStaticMarkup(
      <PublicEngagementPanel
        isAuthenticated={false}
        locale="uk"
        target={{ kind: "journal_entry", ref: "balcony-tomato-check" }}
        returnTo="/journal/balcony-tomato-check"
        summary={{
          target: { kind: "journal_entry", ref: "balcony-tomato-check" },
          activeLikeCount: 0,
          comments: [],
        }}
      />,
    );

    expect(html).toContain("/api/engagement/likes");
    expect(html).toContain("/auth/intent/start");
    expect(html).toContain('name="action" value="bookmark"');
    expect(html).toContain('name="action" value="comment"');
    expect(html).not.toContain("/api/engagement/bookmarks");
    expect(html).not.toContain("/api/engagement/comments");
    expect(html).not.toContain('name="body"');
  });

  it("marks the exact resumed control for keyboard focus and confirmation", () => {
    const html = renderToStaticMarkup(
      <PublicEngagementPanel
        isAuthenticated
        locale="uk"
        resumeAction="comment"
        target={{ kind: "journal_entry", ref: "balcony-tomato-check" }}
        returnTo="/journal/balcony-tomato-check"
        summary={{
          target: { kind: "journal_entry", ref: "balcony-tomato-check" },
          activeLikeCount: 0,
          comments: [],
        }}
      />,
    );

    expect(html).toContain('data-auth-intent-resumed="comment"');
    expect(html).toContain('data-auth-intent-control="comment"');
    expect(html).toContain("autofocus");
    expect(html).toContain("Вхід завершено.");
  });

  it("returns a guest reply to the exact opaque comment control", () => {
    const replyToken = "00000000-0000-4000-8000-000000000201";
    const control = createAuthIntentControlRef("reply", replyToken);
    const summary = {
      target: { kind: "journal_entry" as const, ref: "balcony-tomato-check" },
      activeLikeCount: 0,
      comments: [
        {
          key: "comment:reply-target",
          replyToken,
          body: "Reply to this observation.",
          authorLabel: "@green_thumb",
          authorHandle: "green_thumb",
          parentReplyToken: null,
          createdAt: "2026-07-04T08:00:00.000Z",
        },
      ],
    };
    const guestHtml = renderToStaticMarkup(
      <PublicEngagementPanel
        isAuthenticated={false}
        locale="uk"
        target={summary.target}
        returnTo="/journal/balcony-tomato-check"
        summary={summary}
      />,
    );
    const resumedHtml = renderToStaticMarkup(
      <PublicEngagementPanel
        isAuthenticated
        locale="uk"
        resumeAction="comment"
        resumeControl={control}
        target={summary.target}
        returnTo="/journal/balcony-tomato-check"
        summary={summary}
      />,
    );

    expect(guestHtml).toContain(`name="control" value="${control}"`);
    expect(guestHtml).not.toContain(replyToken);
    expect(resumedHtml).toContain(
      `id="comments-${control}" data-auth-intent-control="comment" data-auth-intent-control-ref="${control}" autofocus`,
    );
    expect(resumedHtml).toContain('id="engagement-comment"');
    expect(resumedHtml).not.toContain('id="engagement-comment" autofocus');
  });
});
