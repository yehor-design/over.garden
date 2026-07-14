import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import Clarity from "@microsoft/clarity";

import {
  AnalyticsPrivacyControls,
  GoogleAnalytics,
  GoogleTagManagerScripts,
  initializeMicrosoftClarity,
  isGoogleAnalyticsRoute,
  resetMicrosoftClarityForTests,
  resolveMicrosoftClarityPublicConfig,
  writeStoredGoogleAnalyticsConsent,
} from "./google-analytics";

let mockedPathname = "/";

vi.mock("@microsoft/clarity", () => ({
  default: {
    init: vi.fn(),
    consentV2: vi.fn(),
    identify: vi.fn(),
    setTag: vi.fn(),
    event: vi.fn(),
    upgrade: vi.fn(),
  },
}));

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

describe("public analytics consent", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED;
    delete process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID;
    mockedPathname = "/";
    resetMicrosoftClarityForTests();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("allows analytics only on authored public/legal/support routes", () => {
    expect(isGoogleAnalyticsRoute("/")).toBe(true);
    expect(isGoogleAnalyticsRoute("/blog")).toBe(true);
    expect(isGoogleAnalyticsRoute("/bg/blog")).toBe(true);
    expect(isGoogleAnalyticsRoute("/guides/start-a-living-plant-record")).toBe(
      true,
    );
    expect(isGoogleAnalyticsRoute("/answers/yellow-tomato-leaves")).toBe(true);
    expect(isGoogleAnalyticsRoute("/markets/ua")).toBe(true);
    expect(isGoogleAnalyticsRoute("/privacy")).toBe(true);
    expect(isGoogleAnalyticsRoute("/support")).toBe(true);
    expect(isGoogleAnalyticsRoute("/first-publication-disclosure")).toBe(true);
    expect(isGoogleAnalyticsRoute("/garden")).toBe(false);
    expect(isGoogleAnalyticsRoute("/garden/objects/object-id")).toBe(false);
    expect(isGoogleAnalyticsRoute("/admin")).toBe(false);
    expect(isGoogleAnalyticsRoute("/auth/help")).toBe(false);
    expect(isGoogleAnalyticsRoute("/join")).toBe(false);
    expect(isGoogleAnalyticsRoute("/erasure")).toBe(false);
    expect(isGoogleAnalyticsRoute("/journal/public-slug")).toBe(false);
    expect(isGoogleAnalyticsRoute("/lineage/objects/object-id")).toBe(false);
    expect(isGoogleAnalyticsRoute("/api/auth/callback/google")).toBe(false);
  });

  it("keeps Microsoft Clarity disabled until both public env values are configured", () => {
    expect(
      resolveMicrosoftClarityPublicConfig({
        NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED: "true",
      }),
    ).toEqual({ enabled: false, projectId: null });

    expect(
      resolveMicrosoftClarityPublicConfig({
        NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED: "false",
        NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID: "clarity-project",
      }),
    ).toEqual({ enabled: false, projectId: "clarity-project" });

    expect(
      resolveMicrosoftClarityPublicConfig({
        NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED: "yes",
        NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID: "clarity-project",
      }),
    ).toEqual({ enabled: true, projectId: "clarity-project" });
  });

  it("asks for analytics consent before loading Google Tag Manager or Clarity", () => {
    process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED = "true";
    process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID = "clarity-project";
    mockedPathname = "/blog";

    const html = renderToStaticMarkup(<GoogleAnalytics locale="bg" />);

    expect(html).toContain("Приемете аналитиката");
    expect(html).toContain("Откажете");
    expect(html).toContain("Microsoft Clarity");
    expect(html).toContain("публични, правни и страници за поддръжка");
    expect(html).toContain('data-analytics-consent-banner="true"');
    expect(html).toContain('data-analytics-consent-actions="true"');
    expect(html).toContain("analytics-consent-banner");
    expect(html).toContain("w-full min-w-0 sm:w-auto");
    expect(html).not.toContain("GTM-W979KSX3");
    expect(html).not.toContain("clarity-project");
    expect(html).not.toContain("clarity.ms");
  });

  it("does not render consent UI or measurement scripts on private routes", () => {
    process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED = "true";
    process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID = "clarity-project";

    mockedPathname = "/garden";
    expect(renderToStaticMarkup(<GoogleAnalytics />)).toBe("");

    mockedPathname = "/admin";
    expect(renderToStaticMarkup(<GoogleAnalytics />)).toBe("");
  });

  it("renders consented Google Tag Manager with advertising storage denied", () => {
    const html = renderToStaticMarkup(<GoogleTagManagerScripts />);

    expect(html).toContain("googletagmanager.com/gtm.js");
    expect(html).toContain("GTM-W979KSX3");
    expect(html).toContain("G-71LP7XZ5NE");
    expect(html).toContain("ad_storage: &#x27;denied&#x27;");
    expect(html).toContain("analytics_storage: &#x27;granted&#x27;");
  });

  it("initializes Clarity once after consent and never identifies users", async () => {
    const clarityBridge = vi.fn();
    vi.stubGlobal("window", { clarity: clarityBridge });

    await initializeMicrosoftClarity("clarity-project");
    await initializeMicrosoftClarity("clarity-project");

    expect(Clarity.init).toHaveBeenCalledOnce();
    expect(Clarity.init).toHaveBeenCalledWith("clarity-project");
    expect(Clarity.consentV2).toHaveBeenCalledOnce();
    expect(Clarity.consentV2).toHaveBeenCalledWith({
      ad_Storage: "denied",
      analytics_Storage: "granted",
    });
    expect(Clarity.identify).not.toHaveBeenCalled();
    expect(Clarity.setTag).not.toHaveBeenCalled();
    expect(Clarity.event).not.toHaveBeenCalled();
  });

  it("revokes Clarity analytics storage when public analytics are turned off", () => {
    const clarityBridge = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      clarity: clarityBridge,
      dispatchEvent: vi.fn(),
      localStorage: { setItem },
    });

    writeStoredGoogleAnalyticsConsent("declined");

    expect(setItem).toHaveBeenCalledWith(
      "overgarden:analytics-consent",
      "declined",
    );
    expect(clarityBridge).toHaveBeenCalledWith("consentv2", {
      ad_Storage: "denied",
      analytics_Storage: "denied",
    });
  });

  it("renders a privacy-page control for public analytics consent", () => {
    const html = renderToStaticMarkup(<AnalyticsPrivacyControls />);

    expect(html).toContain("Public analytics");
    expect(html).toContain("Google Tag Manager / Google Analytics");
    expect(html).toContain("Microsoft Clarity");
    expect(html).toContain("Microsoft Clarity is off");
    expect(html).toContain("Preference key: overgarden:analytics-consent");
    expect(html).toContain("Allow analytics");
    expect(html).toContain("Turn off");
  });
});
