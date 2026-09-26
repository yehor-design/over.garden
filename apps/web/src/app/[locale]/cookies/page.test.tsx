import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getLegalDocument } from "@/lib/legal/legal-documents";
import LocalizedPage, { generateMetadata } from "./page";

describe("/{locale}/cookies", () => {
  it.each(["uk", "bg", "ru"] as const)(
    "renders the %s text with every section and the other two documents",
    async (locale) => {
      const html = renderToStaticMarkup(
        await LocalizedPage({ params: Promise.resolve({ locale }) }),
      );
      const document = getLegalDocument(locale, "cookies");
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(`>${document.title}</h1>`);
      expect(html).toContain(`data-legal-version="${document.version}"`);
      for (const section of document.sections) {
        expect(html).toContain(`id="${section.id}"`);
      }
      const prefix = locale === "uk" ? "" : `/${locale}`;
      expect(html).toContain(`href="${prefix}/privacy"`);
    },
  );

  it("is a noindex reference in the reader's language", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ru" }),
    });
    expect(metadata).toMatchObject({ robots: { index: false, follow: false } });
    expect(String(metadata.title)).toContain(
      getLegalDocument("ru", "cookies").title,
    );
  });
});
