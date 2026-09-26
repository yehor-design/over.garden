import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getLegalDocument, PRIVACY_VERSION } from "@/lib/legal/legal-documents";
import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import LocalizedPrivacyNoticePage, { generateMetadata } from "./page";

describe("/{locale}/privacy", () => {
  it("renders the privacy policy as a noindex reference with no page-local language switcher", async () => {
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
    expect(html).toContain(">Политика за поверителност</h1>");
    expect(html).toContain(`data-legal-version="${PRIVACY_VERSION}"`);
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).not.toContain("data-interface-language-control");
    expect(html).not.toContain("/api/");
  });

  it.each(["uk", "bg", "ru"] as const)(
    "carries every section of the %s text, the choices and where to ask",
    async (locale) => {
      const html = renderToStaticMarkup(
        await LocalizedPrivacyNoticePage({
          params: Promise.resolve({ locale }),
        }),
      );
      const document = getLegalDocument(locale, "privacy");
      expect(html).toContain(`lang="${locale}"`);
      for (const section of document.sections) {
        expect(html).toContain(`id="${section.id}"`);
      }
      // The consent notice links to the reader's choices.
      expect(html).toContain('id="privacy-choices"');
      expect(html).toContain('href="/erasure"');
      // The other two documents, in the reader's language.
      const prefix = locale === "uk" ? "" : `/${locale}`;
      expect(html).toContain(`href="${prefix}/terms"`);
      expect(html).toContain(`href="${prefix}/cookies"`);
    },
  );
});
