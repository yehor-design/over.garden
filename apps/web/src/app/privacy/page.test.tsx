import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  PILOT_LEGAL_COPY_STATUS,
} from "@/lib/privacy/disclosures";
import PrivacyNoticePage, { metadata } from "./page";

describe("/privacy pilot notice", () => {
  it("renders closed-pilot reviewed copy and public-release blockers", () => {
    const html = renderToStaticMarkup(<PrivacyNoticePage />);

    expect(metadata.description).toContain("Closed-pilot privacy notice");
    expect(html).toContain(PILOT_LEGAL_COPY_STATUS);
    expect(html).toContain("Public release blockers");
    expect(html).toContain(FIRST_PUBLICATION_DISCLOSURE_VERSION);
    expect(html).toContain("stop showing the journal text");
    expect(html).not.toContain("410 Gone");
    expect(html).not.toMatch(/placeholder/i);
    expect(html).not.toMatch(/\b(noindex|stripped derivatives?)\b/i);
    expect(html).not.toMatch(
      /\b(address|coordinates?|latitude|longitude|email|ip_address|user[_ -]?agent)\b/i,
    );
  });
});
