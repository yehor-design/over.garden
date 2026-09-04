import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageCircle } from "lucide-react";

import { AuthIntentTrigger } from "./auth-intent-trigger";

describe("AuthIntentTrigger", () => {
  it("posts only the typed public intent fields to the shared start boundary", () => {
    const html = renderToStaticMarkup(
      <AuthIntentTrigger
        action="comment"
        returnTo="/journal/balcony-tomato-check#comments"
        target={{ kind: "journal", ref: "balcony-tomato-check" }}
        control="reply-a7d8f9c012345678"
        label="Comment"
        icon={<MessageCircle />}
      />,
    );

    expect(html).toContain('method="post"');
    expect(html).toContain('action="/auth/intent/start"');
    expect(html).toContain('name="action" value="comment"');
    expect(html).toContain(
      'name="returnTo" value="/journal/balcony-tomato-check#comments"',
    );
    expect(html).toContain('name="targetKind" value="journal"');
    expect(html).toContain('name="targetRef" value="balcony-tomato-check"');
    expect(html).toContain('name="control" value="reply-a7d8f9c012345678"');
    expect(html).toContain('data-auth-intent-control="comment"');
    expect(html).toContain(
      'data-auth-intent-control-ref="reply-a7d8f9c012345678"',
    );
    expect(html).not.toMatch(/body|email|invite|latitude|longitude/i);
  });

  it("brings a targetless reader back to the thing they pressed", () => {
    // "New entry" pressed while signed out used to return the reader to
    // `/garden` bare, so after signing in they had to find the composer and
    // press again. `ACTION_ANCHORS` already knew where `create_entry` belongs;
    // nothing was carrying it. The reader lands on the composer now.
    const html = renderToStaticMarkup(
      <AuthIntentTrigger
        action="create_entry"
        returnTo="/garden"
        label="New entry"
      />,
    );

    const href = /href="([^"]+)"/.exec(html)?.[1] ?? "";
    const decoded = decodeURIComponent(href.replace(/&#x27;/g, "'"));

    expect(decoded).toContain("/auth/sign-in?");
    expect(decoded).toContain("intent=create_entry");
    expect(decoded).toContain("next=/garden?authIntent=create_entry");
    expect(decoded).toContain("#first-entry-composer");
    // Not a POST: with nothing to sign there is nothing to protect, and a link
    // works before the bundle does.
    expect(html).not.toContain('method="post"');
  });

  it("keeps a signed token for anything that names a target", () => {
    const html = renderToStaticMarkup(
      <AuthIntentTrigger
        action="follow"
        returnTo="/@gardener"
        target={{ kind: "profile", ref: "gardener" }}
        label="Follow"
      />,
    );

    // A query parameter would let anyone hand somebody else a crafted resume.
    expect(html).toContain('action="/auth/intent/start"');
    expect(html).not.toContain("/auth/sign-in?");
  });
});
