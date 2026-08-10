import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admitDocumentMutation: vi.fn(),
}));

vi.mock("@/server/document-mutation-admission", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/server/document-mutation-admission")
  >();
  return {
    ...original,
    admitDocumentMutation: mocks.admitDocumentMutation,
  };
});

import { POST } from "./route";

describe("POST /api/document-mutation-admission/continuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns MATCH as a private read-only continuity result", async () => {
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      internalResult: "MATCH",
      transportResult: "MATCH",
      scope: { userId: "private", sessionId: "private-session" },
      envelopeExpiresAtSeconds: 1,
    });

    const response = await POST(
      new Request("https://over.garden/api/document-mutation-admission/continuity", {
        method: "POST",
        headers: {
          "x-overgarden-document-generation": "opaque-old-generation",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ code: "MATCH" });
    expect(mocks.admitDocumentMutation).toHaveBeenCalledWith({
      transport: "opaque-old-generation",
    });
  });

  it("preserves the closed owner-change response without identifiers", async () => {
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "rejected",
      internalResult: "OWNER_TRANSITION_CONFIRMED",
      transportResult: "DOCUMENT_OWNER_CHANGED",
      statusCode: 409,
    });

    const response = await POST(
      new Request("https://over.garden/api/document-mutation-admission/continuity", {
        method: "POST",
        headers: {
          "x-overgarden-document-generation": "opaque-old-generation",
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      code: "DOCUMENT_OWNER_CHANGED",
    });
  });
});
