import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FIRST_PUBLICATION_DISCLOSURE_VERSION } from "@/lib/privacy/disclosures";
import FirstPublicationDisclosurePage, { metadata } from "./page";

describe("/first-publication-disclosure", () => {
  it("renders the current logged disclosure without placeholder wording", () => {
    const html = renderToStaticMarkup(<FirstPublicationDisclosurePage />);

    expect(metadata.description).toContain("Closed-pilot OverGarden disclosure");
    expect(html).toContain(FIRST_PUBLICATION_DISCLOSURE_VERSION);
    expect(html).toContain("noindex is not a secrecy guarantee");
    expect(html).toContain("410 Gone");
    expect(html).not.toMatch(/placeholder/i);
  });
});
