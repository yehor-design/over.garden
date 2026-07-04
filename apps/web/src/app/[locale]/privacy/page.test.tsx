import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import LocalizedPrivacyNoticePage, { generateMetadata } from "./page";

describe("/{locale}/privacy", () => {
  it("renders a localized noindex static privacy route with language switcher", async () => {
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
          uk: "/uk/privacy",
          bg: "/bg/privacy",
          ru: "/ru/privacy",
        },
      },
      robots: { index: false, follow: false },
    });
    expect(html).toContain('lang="bg"');
    expect(html).toContain("MVP уведомление за поверителност");
    expect(html).toContain("Founder-approved MVP copy");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain("7 failed-processing days");
    expect(html).toContain("Google Analytics page measurement");
    expect(html).toContain("/uk/privacy");
    expect(html).toContain("/ru/privacy");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
    expect(html).not.toMatch(/public release remains blocked|публичното пускане остава блокирано/i);
  });
});
