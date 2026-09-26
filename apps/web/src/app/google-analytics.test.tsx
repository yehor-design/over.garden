import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import Clarity from "@microsoft/clarity";

import {
  AnalyticsConsentNotice,
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
    expect(isGoogleAnalyticsRoute("/terms")).toBe(true);
    expect(isGoogleAnalyticsRoute("/cookies")).toBe(true);
    expect(isGoogleAnalyticsRoute("/first-publication-disclosure")).toBe(false);
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

  it("keeps the instrumented set closed, whatever the pages look like", () => {
    // These ten patterns are the only paths the product measures, and
    // `OVE-453` redesigned every one of them. A silent analytics regression
    // here is invisible until a month of data is missing, so the set is
    // enumerated rather than sampled: a redesign that moved one of these
    // addresses would fail here before anybody noticed the gap.
    const instrumented = [
      "/",
      "/blog",
      "/privacy",
      "/support",
      "/terms",
      "/cookies",
      "/answers/yellow-tomato-leaves",
      "/blog/field-note",
      "/guides/start-a-living-plant-record",
      "/markets/ua",
    ];
    for (const path of instrumented) {
      expect(isGoogleAnalyticsRoute(path), path).toBe(true);
      // And in every locale, because a prefixed spelling is the same page.
      for (const locale of ["uk", "bg", "ru"]) {
        expect(
          isGoogleAnalyticsRoute(`/${locale}${path === "/" ? "" : path}`),
          `/${locale}${path}`,
        ).toBe(true);
      }
    }

    // Nothing the redesign touched joined the set by accident: the catalogue
    // and the profile families are not measured and did not become so.
    for (const path of [
      "/catalog",
      "/catalog?kingdom=fungi",
      "/species/solanum-lycopersicum",
      "/@yehor",
      "/@yehor/polyv",
      "/knowledge",
      "/topics/care-checks",
      "/sources/eppo",
    ]) {
      expect(isGoogleAnalyticsRoute(path), path).toBe(false);
    }
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

    const html = renderToStaticMarkup(
      <>
        <AnalyticsConsentNotice locale="bg" clarityEnabled />
        <GoogleAnalytics />
      </>,
    );

    expect(html).toContain("Разрешавам");
    expect(html).toContain("Не разрешавам");
    // Who measures and which pages, in one question; the routes and tools in
    // full are a link away, on the reader's own language's privacy page
    // (`OVE-505`).
    expect(html).toContain(
      "Разрешавате ли на Google и Microsoft да измерват посещенията на началната страница, статиите и справочните страници?",
    );
    expect(html).toContain('href="/bg/privacy#privacy-choices"');
    expect(html).not.toMatch(/callback|API/);
    expect(html).toContain('data-analytics-consent-banner="true"');
    expect(html).toContain('data-analytics-consent-actions="true"');
    expect(html).toContain("analytics-consent-banner");
    // A named region, never a non-modal "dialog" on every page.
    expect(html).toMatch(/<section aria-label="Съгласие за анализ"/);
    expect(html).not.toContain('role="dialog"');
    // Two answers of one weight: the same variant, the same size.
    const answers = [
      ...html.matchAll(
        /<button[^>]*class="([^"]*)"[^>]*data-analytics-consent-answer="(accepted|declined)"/g,
      ),
    ];
    expect(answers.map((match) => match[2])).toEqual(["accepted", "declined"]);
    expect(answers[0]![1]).toBe(answers[1]![1]);
    expect(answers[0]![1]).toContain("border-border-control");
    // Each answer is described by the question it answers.
    expect(
      html.match(/aria-describedby="analytics-consent-message"/g),
    ).toHaveLength(2);
    // The room the notice takes at the end of the page, while it is owed.
    expect(html).toContain('data-analytics-consent-spacer="true"');
    expect(html).not.toContain("GTM-W979KSX3");
    expect(html).not.toContain("clarity-project");
    expect(html).not.toContain("clarity.ms");
  });

  it("asks on every page, and the tags draw nothing of the asking", () => {
    // The owner, 2026-09-21: the notice is owed on every page until the reader
    // answers, the private and unmeasured ones included. It reads no address,
    // so no address can hide it; which paths are *measured* is still the
    // tags' decision, and the tags render no notice of their own.
    process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED = "true";
    process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID = "clarity-project";

    for (const path of [
      "/",
      "/garden",
      "/admin",
      "/auth/sign-in",
      "/journals",
      "/@yehor/post/3",
    ]) {
      mockedPathname = path;
      const notice = renderToStaticMarkup(<AnalyticsConsentNotice />);
      expect(notice, path).toContain('data-analytics-consent-banner="true"');
      expect(notice, path).toContain("Дозволити");
      expect(notice, path).toContain("Не дозволяти");
      expect(notice, path).not.toContain("GTM-W979KSX3");
      expect(renderToStaticMarkup(<GoogleAnalytics />), path).toBe("");
    }
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

  it("renders a localized privacy-page control for public analytics consent", () => {
    const html = renderToStaticMarkup(<AnalyticsPrivacyControls locale="ru" />);

    expect(html).toContain("Публичная аналитика");
    expect(html).toContain("Google Tag Manager / Google Analytics");
    expect(html).toContain("Microsoft Clarity");
    expect(html).toContain("Microsoft Clarity выключен");
    expect(html).toContain("Ключ настройки:");
    expect(html).toContain("overgarden:analytics-consent");
    expect(html).toContain("Разрешить аналитику");
    expect(html).toContain("Выключить");
    expect(html).not.toMatch(/Public analytics|Allow analytics|Turn off/i);
  });
});
