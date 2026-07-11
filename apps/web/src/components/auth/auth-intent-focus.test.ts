import { describe, expect, it, vi } from "vitest";

import {
  authIntentFocusSelector,
  focusAuthIntentControl,
} from "./auth-intent-focus";

describe("auth intent focus selector", () => {
  it("maps only supported actions to a stable focus contract", () => {
    expect(authIntentFocusSelector("create_object")).toBe(
      '[data-auth-intent-control="create_object"]',
    );
    expect(authIntentFocusSelector("publish")).toBe(
      '[data-auth-intent-control="publish"]',
    );
    expect(authIntentFocusSelector("comment", "reply-a7d8f9c012345678")).toBe(
      '[data-auth-intent-control="comment"][data-auth-intent-control-ref="reply-a7d8f9c012345678"]',
    );
    expect(authIntentFocusSelector(null)).toBeNull();
  });

  it("focuses and centers the exact resolved control", () => {
    const target = {
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    };
    const root = {
      querySelector: vi.fn(() => target),
    } as unknown as Pick<Document, "querySelector">;

    expect(
      focusAuthIntentControl('[data-auth-intent-control="publish"]', root),
    ).toBe(true);
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
  });

  it("returns false while a delayed control is not mounted", () => {
    const root = {
      querySelector: vi.fn(() => null),
    } as unknown as Pick<Document, "querySelector">;

    expect(
      focusAuthIntentControl('[data-auth-intent-control="comment"]', root),
    ).toBe(false);
  });
});
