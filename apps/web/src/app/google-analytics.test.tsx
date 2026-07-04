import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  GoogleAnalytics,
  GoogleAnalyticsScripts,
  isGoogleAnalyticsRoute,
} from "./google-analytics";

let mockedPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname,
}));

vi.mock("next/script", () => ({
  default: ({
    children,
    id,
    src,
  }: {
    children?: ReactNode;
    id?: string;
    src?: string;
  }) => (
    <span data-script-id={id} data-script-src={src}>
      {children}
    </span>
  ),
}));

describe("GoogleAnalytics", () => {
  it("allows only authored public pages and legal/support pages", () => {
    expect(isGoogleAnalyticsRoute("/")).toBe(true);
    expect(isGoogleAnalyticsRoute("/uk")).toBe(true);
    expect(isGoogleAnalyticsRoute("/bg/blog")).toBe(true);
    expect(isGoogleAnalyticsRoute("/blog/late-blight-guide")).toBe(true);
    expect(
      isGoogleAnalyticsRoute("/ru/guides/start-a-living-plant-record"),
    ).toBe(true);
    expect(isGoogleAnalyticsRoute("/answers/why-are-tomato-leaves-yellow")).toBe(
      true,
    );
    expect(isGoogleAnalyticsRoute("/privacy")).toBe(true);
    expect(isGoogleAnalyticsRoute("/garden")).toBe(false);
    expect(isGoogleAnalyticsRoute("/garden/objects/object-id")).toBe(false);
    expect(isGoogleAnalyticsRoute("/admin")).toBe(false);
    expect(isGoogleAnalyticsRoute("/auth/help")).toBe(false);
    expect(isGoogleAnalyticsRoute("/join")).toBe(false);
    expect(isGoogleAnalyticsRoute("/journal/public-slug")).toBe(false);
    expect(isGoogleAnalyticsRoute("/lineage/objects/object-id")).toBe(false);
    expect(isGoogleAnalyticsRoute("/api/auth/sign-in/social")).toBe(false);
    expect(isGoogleAnalyticsRoute("/blogroll")).toBe(false);
  });

  it("asks for analytics consent before loading the Google tag", () => {
    mockedPathname = "/uk/blog";

    const html = renderToStaticMarkup(<GoogleAnalytics />);

    expect(html).toContain("Accept analytics");
    expect(html).toContain("Decline");
    expect(html).toContain("private garden, auth, admin, or journal pages");
    expect(html).not.toContain("https://www.googletagmanager.com/gtag/js");
    expect(html).not.toContain("G-71LP7XZ5NE");
  });

  it("renders the provided GA4 Google tag after analytics consent", () => {
    const html = renderToStaticMarkup(<GoogleAnalyticsScripts />);

    expect(html).toContain("https://www.googletagmanager.com/gtag/js");
    expect(html).toContain("G-71LP7XZ5NE");
    expect(html).toContain("window.dataLayer");
    expect(html).toContain("gtag");
    expect(html).toContain("consent");
    expect(html).toContain("granted");
    expect(html).toContain("config");
  });

  it("does not render the Google tag on private garden or admin routes", () => {
    mockedPathname = "/garden";
    expect(renderToStaticMarkup(<GoogleAnalytics />)).toBe("");

    mockedPathname = "/admin";
    expect(renderToStaticMarkup(<GoogleAnalytics />)).toBe("");
  });
});
