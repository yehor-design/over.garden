import { describe, expect, it, vi } from "vitest";

import {
  assertSafeMetaMarketingEvidence,
  buildMetaConversionsApiPayload,
  normalizeMetaConversionsRequestBody,
  resolveMetaConversionsApiConfig,
  sendMetaConversionsApiEvent,
} from "./conversions-api";

const enabledEnv = {
  NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED: "true",
  NEXT_PUBLIC_META_PIXEL_ID: "1234567890",
  META_CONVERSIONS_API_ACCESS_TOKEN: "test-access-token",
  META_CONVERSIONS_API_TEST_EVENT_CODE: "TEST12345",
  META_CONVERSIONS_API_GRAPH_VERSION: "v23.0",
};

describe("Meta Conversions API privacy contract", () => {
  it("requires explicit enabled flag, pixel id, and access token before sending", async () => {
    const fetcher = vi.fn();

    expect(
      resolveMetaConversionsApiConfig({
        ...enabledEnv,
        NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED: "false",
      }),
    ).toMatchObject({ enabled: false });

    const disabledResult = await sendMetaConversionsApiEvent(
      {
        eventName: "landing_page_view",
        eventId: "og_landing_page_view_12345678",
        marketingConsent: "accepted",
        browserPixelSent: true,
      },
      {
        env: {
          ...enabledEnv,
          NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED: "false",
        },
        fetcher,
      },
    );

    expect(disabledResult).toEqual({ sent: false, reason: "disabled" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes only the allowlisted browser request fields", () => {
    expect(
      normalizeMetaConversionsRequestBody({
        eventName: "first_entry_saved",
        eventId: "og_first_entry_saved_12345678",
        marketingConsent: "accepted",
        browserPixelSent: false,
      }),
    ).toEqual({
      eventName: "first_entry_saved",
      eventId: "og_first_entry_saved_12345678",
      marketingConsent: "accepted",
      browserPixelSent: false,
    });

    expect(
      normalizeMetaConversionsRequestBody({
        eventName: "first_entry_saved",
        eventId: "og_first_entry_saved_12345678",
        marketingConsent: "declined",
        browserPixelSent: false,
      }),
    ).toBeNull();
    expect(
      normalizeMetaConversionsRequestBody({
        eventName: "first_entry_saved",
        eventId: "og_first_entry_saved_12345678",
        marketingConsent: "accepted",
        browserPixelSent: false,
        email: "gardener@example.com",
      }),
    ).toBeNull();
  });

  it("builds a dedupe-compatible CAPI payload without user data, URLs, cookies, or private garden fields", () => {
    const payload = buildMetaConversionsApiPayload(
      {
        eventName: "landing_page_view",
        eventId: "og_landing_page_view_12345678",
        marketingConsent: "accepted",
        browserPixelSent: true,
      },
      {
        testEventCode: "TEST12345",
        now: () => new Date("2026-07-05T12:00:00.000Z"),
      },
    );
    const serialized = JSON.stringify(payload);

    expect(payload).toEqual({
      data: [
        {
          event_name: "landing_page_view",
          event_time: 1783252800,
          event_id: "og_landing_page_view_12345678",
          action_source: "website",
          user_data: {},
          custom_data: {
            overgarden_event_class: "landing_page_view",
            overgarden_surface_class: "public_marketing",
            browser_pixel_sent: true,
          },
        },
      ],
      test_event_code: "TEST12345",
    });
    expect(serialized).not.toMatch(
      /email|phone|ip|user_agent|user-agent|fbc|fbp|cookie|url|referrer|callback|journal|plant|catalog|media|location|latitude|longitude|token/i,
    );
  });

  it("rejects poisoned marketing evidence before it can be sent to Meta", () => {
    expect(() =>
      assertSafeMetaMarketingEvidence({
        journalBody: "Private notes from the greenhouse.",
      }),
    ).toThrow("Forbidden Meta marketing measurement evidence fragment: body.");
    expect(() =>
      assertSafeMetaMarketingEvidence({
        preciseLocation: "50.4501,30.5234",
      }),
    ).toThrow(
      "Forbidden Meta marketing measurement evidence fragment: location.",
    );
    expect(() =>
      assertSafeMetaMarketingEvidence({
        callbackUrl: "/api/auth/callback/facebook?code=secret",
      }),
    ).toThrow("Forbidden Meta marketing measurement evidence fragment: auth.");
  });

  it("sends only the safe event class and shared event id to Meta when configured", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const result = await sendMetaConversionsApiEvent(
      {
        eventName: "first_entry_saved",
        eventId: "og_first_entry_saved_12345678",
        marketingConsent: "accepted",
        browserPixelSent: false,
      },
      {
        env: enabledEnv,
        fetcher,
        now: () => new Date("2026-07-05T12:00:00.000Z"),
      },
    );

    expect(result).toEqual({ sent: true, reason: "sent" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init.body));

    expect(body.data[0]).toMatchObject({
      event_name: "first_entry_saved",
      event_id: "og_first_entry_saved_12345678",
      action_source: "website",
      user_data: {},
      custom_data: {
        overgarden_event_class: "first_entry_saved",
        overgarden_surface_class: "garden_activation",
        browser_pixel_sent: false,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /email|phone|ip|user_agent|fbc|fbp|cookie|url|referrer|journal|plant|catalog|media|location|latitude|longitude/i,
    );
  });
});
