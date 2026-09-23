import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FIRST_PUBLICATION_DISCLOSURE_VERSION } from "@/lib/privacy/disclosures";
import LocalizedFirstPublicationDisclosurePage, {
  generateMetadata,
} from "./page";

describe("/{locale}/first-publication-disclosure", () => {
  it.each([
    ["uk", "Повідомлення перед першою публікацією"],
    ["bg", "Уведомление преди първото публикуване"],
    ["ru", "Уведомление перед первой публикацией"],
  ] as const)("renders complete %s disclosure copy", async (locale, title) => {
    const html = renderToStaticMarkup(
      await LocalizedFirstPublicationDisclosurePage({
        params: Promise.resolve({ locale }),
      }),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale }),
    });

    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(title);
    expect(html).toContain(FIRST_PUBLICATION_DISCLOSURE_VERSION);
    // The heading and the description name what publishing means; the
    // version and the review status close the page (`OVE-505`).
    expect(html).not.toMatch(/<h1[^>]*>[^<]*MVP/u);
    expect(`${metadata.title} ${metadata.description}`).not.toContain("MVP");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(html).not.toMatch(
      /first-publication disclosure|Founder-approved|Material wording changes/i,
    );
    expect(html).not.toMatch(/raw-token|session-token|quarantine\//i);
  });
});
