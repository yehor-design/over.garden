import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicProfilePageByHandle: vi.fn(),
}));

vi.mock("@/server/public-profile-repository", () => ({
  getPublicProfilePageByHandle: mocks.getPublicProfilePageByHandle,
}));

describe("/{locale}/@:handle public profile route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getPublicProfilePageByHandle.mockResolvedValue({
      handle: "green_thumb",
      mention: "@green_thumb",
      displayName: "Green Thumb",
      avatarUrl: null,
      summary: {
        publicEntryCount: 2,
        publicObjectCount: 1,
        confirmedLineageEdgeCount: 3,
      },
      links: [
        {
          kind: "journal_entry",
          href: "/journal/first-public-entry",
          entryDate: "2026-07-04",
        },
      ],
    });
  });

  it("keeps public profile metadata noindex with a localized canonical URL", async () => {
    const { generateMetadata } = await import("./page");

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "uk",
        profileHandle: "@green_thumb",
      }),
    });

    expect(metadata).toMatchObject({
      title: "@green_thumb | OverGarden",
      alternates: {
        canonical: "/@green_thumb",
      },
      robots: {
        index: false,
        follow: false,
      },
    });
    expect(metadata.alternates?.languages).toMatchObject({
      uk: "/@green_thumb",
      bg: "/bg/@green_thumb",
      ru: "/ru/@green_thumb",
    });
  });

  it("renders only public-safe profile fields and public links", async () => {
    const { default: LocalizedPublicProfileRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedPublicProfileRoute({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "@green_thumb",
        }),
      }),
    );

    expect(mocks.getPublicProfilePageByHandle).toHaveBeenCalledWith(
      "@green_thumb",
    );
    expect(html).toContain("@green_thumb");
    expect(html).toContain("Green Thumb");
    expect(html).toContain("Public entries");
    expect(html).toContain("Confirmed lineage links");
    expect(html).toContain("/journal/first-public-entry");
    expect(html).not.toMatch(
      /email|provider|account|session|ip_address|user_agent|raw user|00000000-0000|private journal|quarantine|derivative|invite|token|pending|unconfirmed/i,
    );
  });

  it("keeps missing or non-handle localized routes noindex", async () => {
    mocks.getPublicProfilePageByHandle.mockResolvedValueOnce(null);
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "@missing",
        }),
      }),
    ).resolves.toMatchObject({
      title: "Profile | OverGarden",
      robots: {
        index: false,
        follow: false,
      },
    });

    await expect(
      generateMetadata({
        params: Promise.resolve({
          locale: "uk",
          profileHandle: "blog",
        }),
      }),
    ).resolves.toMatchObject({
      title: "Profile | OverGarden",
      robots: {
        index: false,
        follow: false,
      },
    });
  });
});
