import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FIRST_PUBLICATION_DISCLOSURE_VERSION } from "@/lib/privacy/disclosures";
import LocalizedFirstPublicationDisclosurePage, {
  generateMetadata,
} from "./page";

describe("/{locale}/first-publication-disclosure", () => {
  it.each([
    ["uk", "Повідомлення перед першою публікацією в MVP"],
    ["bg", "Уведомление преди първото публикуване в MVP"],
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
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(html).not.toMatch(
      /first-publication disclosure|Founder-approved|Material wording changes/i,
    );
    expect(html).not.toMatch(/raw-token|session-token|quarantine\//i);
  });
});
