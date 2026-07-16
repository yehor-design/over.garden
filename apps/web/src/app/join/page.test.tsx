import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signPilotInviteToken } from "@/lib/garden/pilot-invite";
import { gardenFirstEntryInvitePath } from "@/lib/garden/public-paths";
import JoinPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({ getRequestInterfaceLocale: vi.fn() }));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("./actions", () => ({
  claimPilotInviteAction: vi.fn(async () => {}),
}));

async function renderJoin(searchParams?: Record<string, string | string[]>) {
  return renderToStaticMarkup(
    await JoinPage({
      searchParams: Promise.resolve(searchParams ?? {}),
    }),
  );
}

describe("/join closed-pilot invite gate", () => {
  beforeEach(() => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
  });

  it("stays out of search indexes for the closed pilot", async () => {
    const metadata = await generateMetadata();
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.title).toBe("Ваше запрошення до OverGarden");
  });

  it("offers the claim action only with a valid signed invite token", async () => {
    const token = signPilotInviteToken();
    const html = await renderJoin({ invite: token });

    expect(html).toContain("Відкрити мій сад");
    expect(html).toContain("першу нотатку про рослину");
    // The claim flow carries only the enum cohort source forward, not the raw
    // token, into the post-auth destination.
    expect(gardenFirstEntryInvitePath()).toBe("/garden?source=invited-cohort");
    expect(html).not.toContain("Це посилання-запрошення неактивне.");
  });

  it("shows a safe read-only state for a missing invite token", async () => {
    const html = await renderJoin();

    expect(html).toContain("Це посилання-запрошення неактивне.");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("Відкрити мій сад");
    expect(html).not.toContain("Зберегти першу нотатку про рослину");
  });

  it("treats a tampered or expired token as no invite", async () => {
    const html = await renderJoin({ invite: "v1.tampered.signature" });

    expect(html).toContain("Це посилання-запрошення неактивне.");
    expect(html).not.toContain("Відкрити мій сад");
  });

  it("uses calm, non-technical invite copy without jargon or PII", async () => {
    const token = signPilotInviteToken();
    const html = await renderJoin({ invite: token });
    // Strip href targets and hidden field values so the safe slug/token are not
    // mistaken for jargon or PII in the visible copy.
    const visibleCopy = html
      .replace(/href="[^"]*"/g, "")
      .replace(/value="[^"]*"/g, "");

    expect(html).toContain("запрошено");
    expect(visibleCopy).not.toMatch(
      /\b(noindex|activation[_ ]?source|invited_cohort|cohort|enum|analytics)\b/i,
    );
    expect(visibleCopy).not.toMatch(
      /\b(address|coordinates?|latitude|longitude|email|ip_address|user[_ -]?agent)\b/i,
    );
  });
});
