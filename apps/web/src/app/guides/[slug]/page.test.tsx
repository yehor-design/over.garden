import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import GuideRoute, {
  generateMetadata,
} from "../../[locale]/guides/[slug]/page";

describe("/guides/[slug]", () => {
  it("renders a localized authored guide as a read-only public page", async () => {
    const html = renderToStaticMarkup(
      await GuideRoute({
        params: Promise.resolve({
          locale: "bg",
          slug: "start-a-living-plant-record",
        }),
      }),
    );

    expect(html).toContain("Как да започнете жив запис на растение");
    expect(html).toContain("Изберете едно растение");
    expect(html).toContain("/ru/guides/start-a-living-plant-record");
    expect(html).toContain("/garden");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/journal/");
  });

  it("uses indexable metadata for known guides", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({
          locale: "bg",
          slug: "start-a-living-plant-record",
        }),
      }),
    ).resolves.toMatchObject({
      title: "Как да започнете жив запис на растение | OverGarden",
      alternates: {
        canonical: "/bg/guides/start-a-living-plant-record",
        languages: {
          uk: "/guides/start-a-living-plant-record",
          bg: "/bg/guides/start-a-living-plant-record",
          ru: "/ru/guides/start-a-living-plant-record",
        },
      },
      robots: { index: true, follow: true },
    });
  });
});
