import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";
import FirstPublicationDisclosurePage, { generateMetadata } from "./page";

describe("/first-publication-disclosure", () => {
  it("renders the current logged disclosure without placeholder wording", async () => {
    const html = renderToStaticMarkup(await FirstPublicationDisclosurePage());
    const metadata = await generateMetadata();

    // What publishing means, first; the version and who approved the text
    // close the page (`OVE-505`).
    expect(metadata.description).toContain("Що стає публічним");
    expect(html).toContain("затверджено засновником");
    expect(html).toContain(FIRST_PUBLICATION_DISCLOSURE_VERSION);
    expect(html).toContain("Опубліковані записи відкриті для всіх");
    expect(html).toContain("не зберігає вибрані оригінали");
    expect(html).toContain("Видалення запису остаточне");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).not.toContain("410 Gone");
    expect(html).not.toMatch(/placeholder|public launch still needs/i);
    expect(html).not.toMatch(
      /first-publication disclosure|Founder-approved|Material wording changes/i,
    );
    expect(html).not.toMatch(/\b(noindex|stripped derivatives?)\b/i);
  });
});
