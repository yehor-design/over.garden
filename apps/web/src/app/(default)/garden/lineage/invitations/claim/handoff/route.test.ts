import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspectLineageInviteToken: vi.fn(),
  sealLineageClaimToken: vi.fn(),
}));

vi.mock("@/server/lineage-invite-token", () => ({
  inspectLineageInviteToken: mocks.inspectLineageInviteToken,
}));
vi.mock("@/server/lineage-claim-cookie", () => ({
  sealLineageClaimToken: mocks.sealLineageClaimToken,
}));

import { POST } from "./route";

describe("lineage invitation claim handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspectLineageInviteToken.mockReturnValue({
      state: "valid",
      verification: { edgeId: "edge-1" },
    });
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
    expect(mocks.inspectLineageInviteToken).toHaveBeenCalledWith(rawToken);
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

  it("says a broken link is broken, and sets no cookie", async () => {
    mocks.inspectLineageInviteToken.mockReturnValueOnce({ state: "invalid" });
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
    expect(body).toBe('{"error":"lineage_invitation_invalid"}');
    expect(body).not.toContain(rawToken);
    expect(mocks.sealLineageClaimToken).not.toHaveBeenCalled();
  });

  it("says an expired link expired, and sets no cookie (OVE-495)", async () => {
    mocks.inspectLineageInviteToken.mockReturnValueOnce({
      state: "expired",
      verification: { edgeId: "edge-1" },
    });
    const rawToken = "v1.expired.private-signature";
    const response = await POST(
      new Request("http://localhost/garden/lineage/invitations/claim/handoff", {
        method: "POST",
        body: JSON.stringify({ token: rawToken }),
      }),
    );
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(body).toBe('{"error":"lineage_invitation_expired"}');
    expect(body).not.toContain(rawToken);
    expect(mocks.sealLineageClaimToken).not.toHaveBeenCalled();
  });

  it("never inspects an oversized or missing token", async () => {
    for (const token of ["", "x".repeat(4097)]) {
      const response = await POST(
        new Request(
          "http://localhost/garden/lineage/invitations/claim/handoff",
          { method: "POST", body: JSON.stringify({ token }) },
        ),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "lineage_invitation_invalid",
      });
    }
    expect(mocks.inspectLineageInviteToken).not.toHaveBeenCalled();
  });
});
