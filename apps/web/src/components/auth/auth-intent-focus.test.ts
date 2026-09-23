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
      querySelectorAll: vi.fn(() => [target]),
    } as unknown as Pick<Document, "querySelectorAll">;

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
      querySelectorAll: vi.fn(() => []),
    } as unknown as Pick<Document, "querySelectorAll">;

    expect(
      focusAuthIntentControl('[data-auth-intent-control="comment"]', root),
    ).toBe(false);
  });

  it("skips a hidden streamed copy that cannot take focus (OVE-504)", () => {
    const owner = { activeElement: null as unknown };
    const hidden = {
      ownerDocument: owner,
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    };
    const shown = {
      ownerDocument: owner,
      focus: vi.fn(() => {
        owner.activeElement = shown;
      }),
      scrollIntoView: vi.fn(),
    };
    const root = {
      querySelectorAll: vi.fn(() => [hidden, shown]),
    } as unknown as Pick<Document, "querySelectorAll">;

    expect(
      focusAuthIntentControl('[data-auth-intent-control="follow"]', root),
    ).toBe(true);
    expect(hidden.scrollIntoView).not.toHaveBeenCalled();
    expect(shown.scrollIntoView).toHaveBeenCalled();
  });

  it("never focuses a guest's stand-in, whatever the document order (OVE-504)", () => {
    const owner = { activeElement: null as unknown };
    const guest = {
      ownerDocument: owner,
      hasAttribute: (name: string) => name === "data-auth-intent-guest",
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    };
    const member = {
      ownerDocument: owner,
      hasAttribute: () => false,
      focus: vi.fn(() => {
        owner.activeElement = member;
      }),
      scrollIntoView: vi.fn(),
    };
    const root = {
      querySelectorAll: vi.fn(() => [guest, member]),
    } as unknown as Pick<Document, "querySelectorAll">;

    expect(
      focusAuthIntentControl('[data-auth-intent-control="follow"]', root),
    ).toBe(true);
    expect(guest.focus).not.toHaveBeenCalled();
    expect(member.focus).toHaveBeenCalled();
  });
});
