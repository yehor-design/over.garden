import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMetaConversionsApiEvent: vi.fn(),
}));

vi.mock("@/server/meta-marketing/conversions-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/meta-marketing/conversions-api")>();

  return {
    ...actual,
    sendMetaConversionsApiEvent: mocks.sendMetaConversionsApiEvent,
  };
});

describe("POST /api/meta/conversions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.sendMetaConversionsApiEvent.mockResolvedValue({
      sent: false,
      reason: "disabled",
    });
  });

  it("does not queue Meta CAPI without explicit marketing consent", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        eventName: "landing_page_view",
        eventId: "og_landing_page_view_12345678",
        marketingConsent: "declined",
        browserPixelSent: true,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      sent: false,
      reason: "invalid_payload",
    });
    expect(mocks.sendMetaConversionsApiEvent).not.toHaveBeenCalled();
  });

  it("queues only normalized allowlisted event classes", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        eventName: "landing_page_view",
        eventId: "og_landing_page_view_12345678",
        marketingConsent: "accepted",
        browserPixelSent: true,
      }),
    );

    expect(response.status).toBe(202);
    expect(mocks.sendMetaConversionsApiEvent).toHaveBeenCalledWith({
      eventName: "landing_page_view",
      eventId: "og_landing_page_view_12345678",
      marketingConsent: "accepted",
      browserPixelSent: true,
    });
  });

  it("rejects poisoned extra fields instead of silently forwarding them", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        eventName: "first_entry_saved",
        eventId: "og_first_entry_saved_12345678",
        marketingConsent: "accepted",
        browserPixelSent: false,
        journalBody: "Private tomato note",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.sendMetaConversionsApiEvent).not.toHaveBeenCalled();
  });
});

function jsonRequest(body: unknown) {
  return new Request("https://over.garden/api/meta/conversions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
