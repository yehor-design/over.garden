import { describe, expect, it, vi } from "vitest";

import { scheduleHashAnchorScroll } from "./hash-scroll";

describe("scheduleHashAnchorScroll", () => {
  it("scrolls a late-mounted anchor for an intent-resume hash", () => {
    const scrollIntoView = vi.fn();
    const cancelFrame = vi.fn();
    const cleanup = scheduleHashAnchorScroll("first-entry-composer", {
      hash: "#first-entry-composer",
      findAnchor: () => ({ scrollIntoView }) as unknown as HTMLElement,
      requestFrame: (callback) => {
        callback(0);
        return 17;
      },
      cancelFrame,
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    cleanup();
    expect(cancelFrame).toHaveBeenCalledWith(17);
  });

  it("does not move the page for an unrelated hash", () => {
    const requestFrame = vi.fn();

    scheduleHashAnchorScroll("follow-up-composer", {
      hash: "#journal",
      findAnchor: vi.fn(),
      requestFrame,
      cancelFrame: vi.fn(),
    });

    expect(requestFrame).not.toHaveBeenCalled();
  });
});
