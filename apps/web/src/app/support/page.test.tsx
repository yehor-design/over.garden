import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import SupportPage, { metadata } from "./page";

describe("/support", () => {
  it("renders the MVP support and privacy contact without private evidence", () => {
    const html = renderToStaticMarkup(<SupportPage />);

    expect(metadata.description).toContain("MVP support and privacy contact");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(html).toContain("Support and privacy contact");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain("/auth/help");
    expect(html).toContain("/erasure");
    expect(html).toContain("/privacy");
    expect(html).not.toMatch(/placeholder|public release remains blocked/i);
    expect(html).not.toMatch(
      /00000000-0000-4000-8000|quarantine\/|raw-token|session-token|ip address|user agent/i,
    );
  });
});
