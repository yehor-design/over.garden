// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANALYTICS_CONSENT_NOTICE_HEIGHT_PROPERTY,
  META_MARKETING_CONSENT_NOTICE_HEIGHT_PROPERTY,
} from "@/lib/consent-notice-room";
import { AnalyticsConsentNotice } from "./google-analytics";
import { MetaMarketingAttribution } from "./meta-marketing";

vi.mock("next/navigation", () => ({ usePathname: () => "/blog" }));

/**
 * The consent questions in a document (`OVE-505`): what they ask, and the
 * room the page keeps for them. `google-analytics.test.tsx` and
 * `meta-marketing.test.tsx` read served bytes; this file needs the elements
 * themselves, because the room is an element's measured height and a string
 * of markup has none.
 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets: Element[] = [];
  disconnected = false;

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true;
  }

  /** What the browser does when the observed box changes size. */
  resize() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function measure(element: HTMLElement, height: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    height,
  } as DOMRect);
}

describe("the consent notice", () => {
  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("style");
    delete process.env.NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED;
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  });

  it("names only the tools this deployment runs", () => {
    const { unmount } = render(
      <AnalyticsConsentNotice locale="uk" clarityEnabled={false} />,
    );
    const googleOnly = screen.getByRole("region", {
      name: "Згода на аналітику",
    });
    expect(googleOnly.textContent).toContain(
      "Дозволите Google вимірювати відвідування головної, статей і довідкових сторінок?",
    );
    expect(googleOnly.textContent).not.toContain("Microsoft");
    unmount();

    render(<AnalyticsConsentNotice locale="bg" clarityEnabled />);
    const withClarity = screen.getByRole("region", {
      name: "Съгласие за анализ",
    });
    expect(withClarity.textContent).toContain(
      "Разрешавате ли на Google и Microsoft да измерват",
    );
    // The details are one link away, in the reader's language.
    expect(
      screen.getByRole("link", { name: "Повече" }).getAttribute("href"),
    ).toBe("/bg/privacy#privacy-choices");
  });

  it("writes its own measured height on <html> for the page to keep clear", () => {
    const { unmount } = render(
      <AnalyticsConsentNotice locale="uk" clarityEnabled={false} />,
    );
    const notice = screen.getByRole("region", { name: "Згода на аналітику" });
    const [observer] = FakeResizeObserver.instances;
    expect(observer?.targets).toEqual([notice]);
    const room = () =>
      document.documentElement.style.getPropertyValue(
        ANALYTICS_CONSENT_NOTICE_HEIGHT_PROPERTY,
      );

    measure(notice, 131.2);
    act(() => observer!.resize());
    // Rounded up: a fraction of a pixel under the notice is still under it.
    expect(room()).toBe("132px");

    // The text rewraps — a phone turned, a larger text size — and the room
    // follows it rather than a guess made for one language at one width.
    measure(notice, 188);
    act(() => observer!.resize());
    expect(room()).toBe("188px");

    unmount();
    expect(observer!.disconnected).toBe(true);
    expect(room()).toBe("");
  });

  it("keeps the marketing question the same room, under its own name", () => {
    // It takes the analytics notice's place once that is answered; the
    // hidden analytics notice measures zero, so the two never share a
    // property.
    process.env.NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED = "true";
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "1234567890";
    render(<MetaMarketingAttribution locale="uk" />);
    const question = screen.getByRole("region", {
      name: "Згода на маркетингові вимірювання Meta",
    });
    const [observer] = FakeResizeObserver.instances;
    expect(observer?.targets).toEqual([question]);

    measure(question, 96.5);
    act(() => observer!.resize());
    expect(
      document.documentElement.style.getPropertyValue(
        META_MARKETING_CONSENT_NOTICE_HEIGHT_PROPERTY,
      ),
    ).toBe("97px");
    expect(
      document.documentElement.style.getPropertyValue(
        ANALYTICS_CONSENT_NOTICE_HEIGHT_PROPERTY,
      ),
    ).toBe("");
  });

  it("keeps the property names globals.css reads", () => {
    expect(ANALYTICS_CONSENT_NOTICE_HEIGHT_PROPERTY).toBe(
      "--analytics-consent-notice-height",
    );
    expect(META_MARKETING_CONSENT_NOTICE_HEIGHT_PROPERTY).toBe(
      "--meta-marketing-consent-notice-height",
    );
  });
});
