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
    // A contribution thread is comments only: no like, bookmark or follow.
    expect(html).not.toContain("Подобається");
    expect(html).not.toContain("Зберегти");
    expect(html).not.toContain("Стежити");
    expect(html).not.toContain("anonymousToken");
  });

  it("localizes engagement chrome without changing public comments", () => {
    const html = renderToStaticMarkup(
      <PublicEngagementPanel
        isAuthenticated
        locale="ru"
        target={{ kind: "variety", ref: "red-cherry" }}
        returnTo="/variety/red-cherry"
        likeState={{ activeLikeCount: 2, viewerLiked: false }}
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
    expect(html).toContain("2 отметки");
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
        likeState={{ activeLikeCount: 0, viewerLiked: false }}
        summary={{
          target: { kind: "journal_entry", ref: "balcony-tomato-check" },
          activeLikeCount: 0,
          comments: [],
        }}
      />,
    );

    // A guest may like — that is the hybrid ownership decision of 2026-09-04 —
    // but bookmarking and commenting still need an account.
    expect(html).toContain("Подобається");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("/auth/intent/start");
    expect(html).toContain('name="action" value="bookmark"');
    expect(html).toContain('name="action" value="comment"');
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
    // One element carries all four, in whatever order React emits them.
    expect(resumedHtml).toMatch(
      new RegExp(
        `<textarea(?=[^>]*id="comments-${control}")(?=[^>]*data-auth-intent-control="comment")(?=[^>]*data-auth-intent-control-ref="${control}")(?=[^>]*autofocus)[^>]*>`,
      ),
    );
    expect(resumedHtml).toContain('id="engagement-comment"');
    expect(resumedHtml).not.toContain('id="engagement-comment" autofocus');
  });
});

describe("buildCommentThreads", () => {
  const comment = (
    token: string,
    parentReplyToken: string | null,
    body: string,
  ) => ({
    key: `comment:${token}`,
    replyToken: token,
    body,
    authorLabel: "@gardener",
    authorHandle: "gardener",
    parentReplyToken,
    createdAt: "2026-07-04T08:00:00.000Z",
  });

  it("flattens a third level into the thread rather than losing it", async () => {
    const { buildCommentThreads } = await import("./public-engagement-panel");
    // The previous shape filed replies under `parentReplyToken` and only ever
    // read the map at a root's token, so `deep` — a reply to a reply — was
    // present in the database, counted, and absent from the page
    // (`OVE-454` criterion 3).
    const threads = buildCommentThreads([
      comment("root", null, "the first"),
      comment("reply", "root", "the second"),
      comment("deep", "reply", "the third"),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.root.replyToken).toBe("root");
    expect(threads[0]!.replies.map((reply) => reply.replyToken)).toEqual([
      "reply",
      "deep",
    ]);
  });

  it("opens a thread for a comment whose parent is on another page", async () => {
    const { buildCommentThreads } = await import("./public-engagement-panel");
    const threads = buildCommentThreads([comment("orphan", "gone", "hello")]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.root.replyToken).toBe("orphan");
  });

  it("survives a cycle rather than following it", async () => {
    const { buildCommentThreads } = await import("./public-engagement-panel");
    const threads = buildCommentThreads([
      comment("a", "b", "one"),
      comment("b", "a", "two"),
    ]);

    expect(threads.length + threads[0]!.replies.length).toBeGreaterThan(0);
  });

  it("gives every comment an address of its own", async () => {
    const { commentAnchorId } = await import("./public-engagement-panel");
    const html = renderToStaticMarkup(
      <PublicEngagementPanel
        isAuthenticated
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
          comments: [
            comment("root", null, "the first"),
            comment("reply", "root", "the second"),
          ],
        }}
      />,
    );

    const rootRef = createAuthIntentControlRef("reply", "root");
    const replyRef = createAuthIntentControlRef("reply", "reply");
    expect(html).toContain(`id="${commentAnchorId(rootRef)}"`);
    expect(html).toContain(`id="${commentAnchorId(replyRef)}"`);
    expect(html).toContain(`href="#${commentAnchorId(replyRef)}"`);
    // The address is the opaque ref, never the comment's own id.
    expect(html).not.toContain('id="comment-root"');
    // Every Reply in the thread leads to the one box under the root: that is
    // the flatten, and no reader is offered a depth the server refuses.
    expect(
      html.match(new RegExp(`href="#engagement-${rootRef}"`, "gu")) ?? [],
    ).toHaveLength(2);
    expect(html).toContain('dateTime="2026-07-04T08:00:00.000Z"');
  });
});
