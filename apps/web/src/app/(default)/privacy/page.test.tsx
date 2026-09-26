import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PRIVACY_VERSION } from "@/lib/legal/legal-documents";
import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import PrivacyNoticePage, { generateMetadata } from "./page";

describe("/privacy", () => {
  it("renders the Ukrainian privacy policy: what is public, who processes it, how long it is kept", async () => {
    const html = renderToStaticMarkup(await PrivacyNoticePage());
    const metadata = await generateMetadata();

    expect(metadata.description).toContain("що стає публічним");
    expect(html).toContain('lang="uk"');
    expect(html).toContain(">Політика приватності</h1>");
    expect(html).toContain(`data-legal-version="${PRIVACY_VERSION}"`);
    // What a reader must be able to find (ADR-0038 D1): space pages and the
    // catalogue copies are public, and how long a thing is kept.
    expect(html).toContain("сторінки просторів з їхніми фото");
    expect(html).toContain("копії фото в каталозі видів");
    expect(html).toContain("до двох годин без активності");
    expect(html).toContain("до 13 місяців");
    expect(html).toContain("Microsoft Clarity");
    expect(html).toContain(SUPPORT_EMAIL);
    // The reader's cookie choices, in place.
    expect(html).toContain('id="privacy-choices"');
    expect(html).not.toContain("Русский");
    expect(html).not.toMatch(/placeholder|public release remains blocked/i);
    expect(html).not.toMatch(
      /00000000-0000-4000-8000|quarantine\/|raw-token|session-token|https?:\/\/[^"]+\/api\//i,
    );
  });
});
