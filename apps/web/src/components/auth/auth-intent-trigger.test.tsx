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
});
