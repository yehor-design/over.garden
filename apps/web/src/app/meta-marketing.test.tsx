import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MetaMarketingAttribution,
  MetaMarketingPrivacyControls,
  MetaPixelScripts,
  isMetaMarketingRoute,
} from "./meta-marketing";

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

describe("MetaMarketingAttribution", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED;
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    mockedPathname = "/";
  });

  it("allows marketing measurement only on authored public/legal/support routes", () => {
    expect(isMetaMarketingRoute("/")).toBe(true);
    expect(isMetaMarketingRoute("/blog")).toBe(true);
    expect(isMetaMarketingRoute("/bg/blog")).toBe(true);
    expect(isMetaMarketingRoute("/guides/start-a-living-plant-record")).toBe(
      true,
    );
    expect(isMetaMarketingRoute("/answers/yellow-tomato-leaves")).toBe(true);
    expect(isMetaMarketingRoute("/privacy")).toBe(true);
    expect(isMetaMarketingRoute("/garden")).toBe(false);
    expect(isMetaMarketingRoute("/garden/objects/object-id")).toBe(false);
    expect(isMetaMarketingRoute("/admin")).toBe(false);
    expect(isMetaMarketingRoute("/auth/help")).toBe(false);
    expect(isMetaMarketingRoute("/join")).toBe(false);
    expect(isMetaMarketingRoute("/journal/public-slug")).toBe(false);
    expect(isMetaMarketingRoute("/lineage/objects/object-id")).toBe(false);
    expect(isMetaMarketingRoute("/api/auth/callback/facebook")).toBe(false);
  });

  it("stays fully disabled until the explicit public env flag and pixel id are configured", () => {
    process.env.NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED = "false";
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "1234567890";

    expect(renderToStaticMarkup(<MetaMarketingAttribution />)).toBe("");

    process.env.NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED = "true";
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;

    expect(renderToStaticMarkup(<MetaMarketingAttribution />)).toBe("");
  });

  it("asks for marketing consent before loading Meta Pixel", () => {
    process.env.NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED = "true";
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "1234567890";
    mockedPathname = "/blog";

    const html = renderToStaticMarkup(<MetaMarketingAttribution locale="bg" />);

    expect(html).toContain("Разрешаване на маркетингово измерване");
    expect(html).toContain("Без разрешение");
    expect(html).toContain("никога личен текст от градината");
    expect(html).not.toContain("connect.facebook.net/en_US/fbevents.js");
    expect(html).not.toContain("1234567890");
  });

  it("renders a consent-granted Pixel without PageView or automatic form metadata collection", () => {
    const html = renderToStaticMarkup(
      <MetaPixelScripts pixelId="1234567890" />,
    );

    expect(html).toContain("connect.facebook.net/en_US/fbevents.js");
    expect(html).toContain("fbq(&#x27;consent&#x27;, &#x27;grant&#x27;)");
    expect(html).toContain(
      "fbq(&#x27;set&#x27;, &#x27;autoConfig&#x27;, false",
    );
    expect(html).toContain("fbq(&#x27;init&#x27;, &quot;1234567890&quot;)");
    expect(html).not.toContain("PageView");
    expect(html).not.toContain("AdvancedMatching");
  });

  it("does not render consent UI or Meta scripts on private routes", () => {
    process.env.NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED = "true";
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "1234567890";

    mockedPathname = "/garden";
    expect(renderToStaticMarkup(<MetaMarketingAttribution />)).toBe("");

    mockedPathname = "/admin";
    expect(renderToStaticMarkup(<MetaMarketingAttribution />)).toBe("");
  });

  it("renders localized privacy controls without changing consent keys", () => {
    const html = renderToStaticMarkup(
      <MetaMarketingPrivacyControls locale="uk" />,
    );

    expect(html).toContain("Маркетингові вимірювання Meta");
    expect(html).toContain("overgarden:meta-marketing-consent");
    expect(html).toContain("Дозволити маркетингові вимірювання");
    expect(html).not.toMatch(/Meta marketing measurement|Keep off|Turn off/i);
  });
});
