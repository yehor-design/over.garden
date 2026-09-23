import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import LocalizedPrivacyNoticePage, { generateMetadata } from "./page";

describe("/{locale}/privacy", () => {
  it("renders a localized noindex route without a page-local language switcher", async () => {
    const html = renderToStaticMarkup(
      await LocalizedPrivacyNoticePage({
        params: Promise.resolve({ locale: "bg" }),
      }),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "bg" }),
    });

    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(metadata.alternates).toBeUndefined();
    expect(html).toContain('lang="bg"');
    expect(html).toContain(
      '<h1 class="text-h1 break-words text-text-heading">Уведомление за поверителност</h1>',
    );
    expect(html).toContain("одобрен от основателя");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain("след два часа");
    expect(html).toContain("Google Tag Manager / Google Analytics");
    expect(html).toContain("данните за сесии от Microsoft Clarity");
    expect(html).toContain("Публични анализи");
    expect(html).not.toContain("/uk/privacy");
    expect(html).not.toContain("Українська");
    expect(html).not.toContain("/ru/privacy");
    expect(html).not.toContain("data-interface-language-control");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
    expect(html).not.toMatch(
      /public release remains blocked|публичното пускане остава блокирано/i,
    );
    expect(html).not.toMatch(
      /Founder-approved|Data retention|Review boundaries|Public analytics|Turn off/i,
    );
  });

  it.each([
    ["uk", "Повідомлення про приватність"],
    ["bg", "Уведомление за поверителност"],
    ["ru", "Уведомление о конфиденциальности"],
  ] as const)("renders complete %s authored copy", async (locale, title) => {
    const html = renderToStaticMarkup(
      await LocalizedPrivacyNoticePage({
        params: Promise.resolve({ locale }),
      }),
    );

    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(title);
    // The heading names the page; its review status closes it (`OVE-505`).
    expect(html).not.toMatch(/<h1[^>]*>[^<]*MVP/u);
    expect(html).not.toMatch(
      /Founder-approved|Data retention|Review boundaries|Public analytics|Turn off/i,
    );
  });
});
