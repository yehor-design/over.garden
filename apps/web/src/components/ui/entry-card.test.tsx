// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import NextLink from "next/link";
import { describe, expect, it, vi } from "vitest";

import { EntryCard } from "./entry-card";

vi.mock("@/components/media/subject-aware-media-image", () => ({
  SubjectAwareMediaImage: ({
    alt,
    src,
    srcSet,
  }: {
    alt: string;
    src: string;
    srcSet?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} srcSet={srcSet} />
  ),
}));

const base = {
  id: "entry-1",
  href: "/@olena/tomato-week",
  title: "Підсумок тижня для томата",
  dateTime: "2026-07-10T12:00:00.000Z",
  dateLabel: "10 лип.",
};

describe("EntryCard", () => {
  it("is an article a reader can find by name", () => {
    render(<EntryCard {...base} />);

    // The `<article>` takes its name from the entry's own title, so a screen
    // reader announces which entry it has reached rather than "article".
    const card = screen.getByRole("article", {
      name: "Підсумок тижня для томата",
    });
    expect(card.tagName).toBe("ARTICLE");
    expect(
      screen
        .getByRole("link", { name: "Підсумок тижня для томата" })
        .getAttribute("href"),
    ).toBe("/@olena/tomato-week");
  });

  it("names the object and its kind above the title", () => {
    render(
      <EntryCard
        {...base}
        subject={{
          label: "Томат Черрі",
          href: "/@olena/objects/tomato",
          kindLabel: "Рослина",
          meta: "Регіон UA-30",
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Томат Черрі" }).getAttribute("href"),
    ).toBe("/@olena/objects/tomato");
    expect(screen.getByText("Рослина")).toBeTruthy();
    expect(screen.getByText("Регіон UA-30")).toBeTruthy();
  });

  it("reserves the same box with a photograph and without one", () => {
    const { container: withCover } = render(
      <EntryCard
        {...base}
        cover={{
          src: "https://media.over.garden/one.webp",
          srcSet: "https://media.over.garden/one_480.webp 480w",
          alt: "Томат Черрі: підсумок тижня",
        }}
      />,
    );
    const cover = withCover.querySelector('[data-entry-card-media="cover"]');
    expect(cover?.className).toContain("aspect-card");
    // The alt text is the caller's real sentence, never an empty string: a
    // photograph of the thing the entry is about carries meaning.
    expect(
      screen
        .getByRole("img", { name: "Томат Черрі: підсумок тижня" })
        .getAttribute("srcset"),
    ).toBe("https://media.over.garden/one_480.webp 480w");

    const { container: withoutCover } = render(
      <EntryCard {...base} id="entry-2" />,
    );
    const fallback = withoutCover.querySelector(
      '[data-entry-card-media="fallback"]',
    );
    expect(fallback?.className).toContain("aspect-card");
    // Decorative: the heading beside it already says what the entry is.
    expect(fallback?.getAttribute("aria-hidden")).toBe("true");
  });

  it("carries the entry's own language only when it differs from the page's", () => {
    const { container: bulgarian } = render(
      <EntryCard {...base} contentLanguage="bg" title="Седмичен преглед" />,
    );
    expect(bulgarian.querySelector('[lang="bg"]')).toBeTruthy();

    const { container: same } = render(<EntryCard {...base} id="entry-3" />);
    expect(same.querySelector("[lang]")).toBeNull();
  });

  it("renders the byline as a link and the engagement the page handed it", () => {
    render(
      <EntryCard
        {...base}
        author={{ displayName: "Олена", href: "/@olena" }}
        authorPrefix="Автор"
        engagement={
          <NextLink href="/@olena/tomato-week#comments">Обговорення</NextLink>
        }
      />,
    );

    expect(
      screen.getByRole("link", { name: /Автор Олена/u }).getAttribute("href"),
    ).toBe("/@olena");
    expect(screen.getByRole("link", { name: "Обговорення" })).toBeTruthy();
  });

  it("takes its heading level from the page it sits in", () => {
    render(<EntryCard {...base} headingLevel={3} />);

    // Levels never skip (DESIGN.md §8): inside a named section the card is an
    // h3, and on a page whose h1 is the page title it is an h2.
    expect(
      screen.getByRole("heading", { level: 3, name: base.title }),
    ).toBeTruthy();
  });

  it("lists the entry's topics as a list", () => {
    render(
      <EntryCard
        {...base}
        topics={[{ label: "Зимовий догляд", href: "/?topic=winter-care" }]}
      />,
    );

    expect(screen.getByRole("list")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "#Зимовий догляд" })
        .getAttribute("href"),
    ).toBe("/?topic=winter-care");
  });
});
