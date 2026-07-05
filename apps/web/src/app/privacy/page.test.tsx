import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  MVP_LEGAL_COPY_STATUS,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";
import PrivacyNoticePage, { generateMetadata } from "./page";

describe("/privacy MVP notice", () => {
  it("renders founder-approved MVP copy, retention, and support contact", async () => {
    const html = renderToStaticMarkup(await PrivacyNoticePage());
    const metadata = await generateMetadata();

    expect(metadata.description).toContain("Founder-approved MVP");
    expect(html).toContain(MVP_LEGAL_COPY_STATUS);
    expect(html).toContain("Founder-approved MVP copy");
    expect(html).toContain("Data retention");
    expect(html).toContain("7 failed-processing days");
    expect(html).toContain("13 months");
    expect(html).toContain("Google Analytics page measurement");
    expect(html).toContain("Microsoft Clarity session insights");
    expect(html).toContain("Public analytics");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain(FIRST_PUBLICATION_DISCLOSURE_VERSION);
    expect(html).toContain("queued for public search removal");
    expect(html).toContain('lang="uk"');
    expect(html).toContain("MVP повідомлення про приватність");
    expect(html).not.toContain("Русский");
    expect(html).not.toContain("410 Gone");
    expect(html).not.toMatch(/placeholder|public release remains blocked/i);
    expect(html).not.toMatch(/\b(noindex|stripped derivatives?)\b/i);
    expect(html).not.toMatch(
      /00000000-0000-4000-8000|quarantine\/|raw-token|session-token|https?:\/\/[^"]+\/api\//i,
    );
  });
});
