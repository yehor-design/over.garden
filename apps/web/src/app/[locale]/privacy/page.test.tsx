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
      alternates: {
        canonical: "/bg/privacy",
        languages: {
          uk: "/privacy",
          bg: "/bg/privacy",
          ru: "/ru/privacy",
        },
      },
      robots: { index: false, follow: false },
    });
    expect(html).toContain('lang="bg"');
    expect(html).toContain("Уведомление за поверителност за MVP");
    expect(html).toContain("одобрен от основателя");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain("7 дни неуспешна обработка");
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
    ["uk", "Повідомлення про приватність для MVP"],
    ["bg", "Уведомление за поверителност за MVP"],
    ["ru", "Уведомление о конфиденциальности для MVP"],
  ] as const)("renders complete %s authored copy", async (locale, title) => {
    const html = renderToStaticMarkup(
      await LocalizedPrivacyNoticePage({
        params: Promise.resolve({ locale }),
      }),
    );

    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(title);
    expect(html).not.toMatch(
      /Founder-approved|Data retention|Review boundaries|Public analytics|Turn off/i,
    );
  });
});
