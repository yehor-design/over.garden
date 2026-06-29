import { beforeEach, describe, expect, it, vi } from "vitest";

import { signPilotInviteToken } from "@/lib/garden/pilot-invite";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  setPilotInviteCookie: vi.fn(async () => {}),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/server/pilot-write-access", () => ({
  setPilotInviteCookie: mocks.setPilotInviteCookie,
}));

describe("claimPilotInviteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets the eligibility cookie and redirects to the enum-only destination for a valid token", async () => {
    const { claimPilotInviteAction } = await import("./actions");
    const formData = new FormData();
    formData.set(
      "invite",
      signPilotInviteToken({ segment: "casual_practical_beginner" }),
    );

    await claimPilotInviteAction(formData);

    expect(mocks.setPilotInviteCookie).toHaveBeenCalledWith(
      "closed_pilot",
      "casual_practical_beginner",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden?source=invited-cohort",
    );
  });

  it("preserves founder rehearsal cohort metadata when claiming a rehearsal invite", async () => {
    const { claimPilotInviteAction } = await import("./actions");
    const formData = new FormData();
    formData.set(
      "invite",
      signPilotInviteToken({
        cohort: "founder_rehearsal",
        segment: "unknown_segment",
      }),
    );

    await claimPilotInviteAction(formData);

    expect(mocks.setPilotInviteCookie).toHaveBeenCalledWith(
      "founder_rehearsal",
      "unknown_segment",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden?source=invited-cohort",
    );
  });

  it("never sets a grant cookie for an invalid token but still lands on a safe destination", async () => {
    const { claimPilotInviteAction } = await import("./actions");
    const formData = new FormData();
    formData.set("invite", "v1.not-real.signature");

    await claimPilotInviteAction(formData);

    expect(mocks.setPilotInviteCookie).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden?source=invited-cohort",
    );
  });

  it("does not leak the raw invite token into the redirect destination", async () => {
    const { claimPilotInviteAction } = await import("./actions");
    const token = signPilotInviteToken();
    const formData = new FormData();
    formData.set("invite", token);

    await claimPilotInviteAction(formData);

    const redirectTarget = mocks.redirect.mock.calls[0]?.[0] as string;
    expect(redirectTarget).not.toContain(token);
    expect(redirectTarget).not.toContain("invite=");
  });
});
