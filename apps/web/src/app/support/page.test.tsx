import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import SupportPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({ getRequestInterfaceLocale: vi.fn() }));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

describe("/support", () => {
  beforeEach(() => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
  });

  it("renders the localized MVP support contact without private evidence", async () => {
    const html = renderToStaticMarkup(await SupportPage());
    const metadata = await generateMetadata();

    expect(metadata.description).toContain("OverGarden");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(html).toContain('lang="bg"');
    expect(html).toContain("Поддръжка и въпроси за поверителност");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain("/auth/help");
    expect(html).toContain("/erasure");
    expect(html).toContain("/privacy");
    expect(html).not.toMatch(/placeholder|public release remains blocked/i);
    expect(html).not.toMatch(
      /Support and privacy contact|Common support paths/i,
    );
    expect(html).not.toMatch(
      /00000000-0000-4000-8000|quarantine\/|raw-token|session-token|ip address|user agent/i,
    );
  });
});
