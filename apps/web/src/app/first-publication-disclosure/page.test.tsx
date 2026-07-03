import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";
import FirstPublicationDisclosurePage, { metadata } from "./page";

describe("/first-publication-disclosure", () => {
  it("renders the current logged disclosure without placeholder wording", () => {
    const html = renderToStaticMarkup(<FirstPublicationDisclosurePage />);

    expect(metadata.description).toContain(
      "Founder-approved OverGarden MVP disclosure",
    );
    expect(html).toContain(FIRST_PUBLICATION_DISCLOSURE_VERSION);
    expect(html).toContain("thin or unsafe user-generated surfaces");
    expect(html).toContain("7 failed-processing days");
    expect(html).toContain("queued for public search removal");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).not.toContain("410 Gone");
    expect(html).not.toMatch(/placeholder|public launch still needs/i);
    expect(html).not.toMatch(/\b(noindex|stripped derivatives?)\b/i);
  });
});
