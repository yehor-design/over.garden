import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";
import PrivacyNoticePage, { generateMetadata } from "./page";

describe("/privacy MVP notice", () => {
  it("renders founder-approved MVP copy, retention, and support contact", async () => {
    const html = renderToStaticMarkup(await PrivacyNoticePage());
    const metadata = await generateMetadata();

    expect(metadata.description).toContain("Затверджене засновником");
    expect(html).toContain("затверджено засновником");
    expect(html).toContain("Строки зберігання даних");
    expect(html).toContain("7 днів невдалої обробки");
    expect(html).toContain("13 місяців");
    expect(html).toContain("Google Tag Manager / Google Analytics");
    expect(html).toContain("дані сесій Microsoft Clarity");
    expect(html).toContain("Публічна аналітика");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain(FIRST_PUBLICATION_DISCLOSURE_VERSION);
    expect(html).toContain("чергу на вилучення з публічного пошуку");
    expect(html).toContain('lang="uk"');
    expect(html).toContain("Повідомлення про приватність для MVP");
    expect(html).not.toContain("Русский");
    expect(html).not.toContain("410 Gone");
    expect(html).not.toMatch(/placeholder|public release remains blocked/i);
    expect(html).not.toMatch(
      /Founder-approved|Data retention|Review boundaries|Public analytics|Turn off/i,
    );
    expect(html).not.toMatch(/\b(noindex|stripped derivatives?)\b/i);
    expect(html).not.toMatch(
      /00000000-0000-4000-8000|quarantine\/|raw-token|session-token|https?:\/\/[^"]+\/api\//i,
    );
  });
});
