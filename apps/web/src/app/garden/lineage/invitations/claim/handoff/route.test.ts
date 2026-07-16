import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyLineageInviteToken: vi.fn(),
  sealLineageClaimToken: vi.fn(),
}));

vi.mock("@/server/lineage-invite-token", () => ({
  verifyLineageInviteToken: mocks.verifyLineageInviteToken,
}));
vi.mock("@/server/lineage-claim-cookie", () => ({
  sealLineageClaimToken: mocks.sealLineageClaimToken,
}));

import { POST } from "./route";

describe("lineage invitation claim handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyLineageInviteToken.mockReturnValue({ edgeId: "edge-1" });
    mocks.sealLineageClaimToken.mockReturnValue("v1.opaque.sealed.tag");
  });

  it("validates the fragment token and stores only an encrypted HttpOnly cookie", async () => {
    const rawToken = "v1.private-payload.private-signature";
    const response = await POST(
      new Request("http://localhost/garden/lineage/invitations/claim/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken }),
      }),
    );
    const body = JSON.stringify(await response.json());
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(mocks.verifyLineageInviteToken).toHaveBeenCalledWith(rawToken);
    expect(mocks.sealLineageClaimToken).toHaveBeenCalledWith(rawToken);
    expect(body).toBe('{"next":"/garden/lineage/invitations/claim"}');
    expect(cookie).toContain("overgarden-lineage-claim=v1.opaque.sealed.tag");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toContain("Path=/garden/lineage/invitations/claim");
    expect(cookie).not.toMatch(/;\s*Secure/i);
    expect(`${body}${cookie}`).not.toContain(rawToken);
  });

  it("marks the claim cookie secure for an HTTPS or forwarded HTTPS request", async () => {
    const rawToken = "v1.private-payload.private-signature";

    for (const request of [
      new Request(
        "https://over.garden/garden/lineage/invitations/claim/handoff",
        {
          method: "POST",
          body: JSON.stringify({ token: rawToken }),
        },
      ),
      new Request("http://internal/garden/lineage/invitations/claim/handoff", {
        method: "POST",
        headers: { "x-forwarded-proto": "https" },
        body: JSON.stringify({ token: rawToken }),
      }),
    ]) {
      const response = await POST(request);
      expect(response.headers.get("set-cookie")).toMatch(/;\s*Secure/i);
    }
  });

  it("returns a generic error and no cookie for an invalid token", async () => {
    mocks.verifyLineageInviteToken.mockReturnValueOnce(null);
    const rawToken = "v1.invalid.private-signature";
    const response = await POST(
      new Request("http://localhost/garden/lineage/invitations/claim/handoff", {
        method: "POST",
        body: JSON.stringify({ token: rawToken }),
      }),
    );
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(body).toBe('{"error":"lineage_invitation_unavailable"}');
    expect(body).not.toContain(rawToken);
    expect(mocks.sealLineageClaimToken).not.toHaveBeenCalled();
  });
});
