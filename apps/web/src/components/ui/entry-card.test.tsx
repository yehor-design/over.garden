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

  // OVE-492 (OG-UX-041): a photograph keeps its own proportions, bounded; a
  // text note draws no box for a picture it does not have.
  it("reserves each photograph's own bounded box, and none for a text note", () => {
    const { container: portrait } = render(
      <EntryCard
        {...base}
        media={[
          {
            src: "https://media.over.garden/one.webp",
            srcSet: "https://media.over.garden/one_480.webp 480w",
            alt: "Нижній ярус без плям",
            intrinsicWidth: 1440,
            intrinsicHeight: 2560,
          },
        ]}
      />,
    );
    const single = portrait.querySelector<HTMLElement>(
      '[data-entry-card-media="single"]',
    );
    // 9:16 is clamped to 4:5, and the width follows from the height bound.
    expect(single?.style.aspectRatio).toMatch(/^0\.8( \/ 1)?$/u);
    expect(single?.style.width).toBe("min(100%, 25.600rem)");
    // The alt is the gardener's own description, never the title again.
    expect(
      screen
        .getByRole("img", { name: "Нижній ярус без плям" })
        .getAttribute("srcset"),
    ).toBe("https://media.over.garden/one_480.webp 480w");

    const { container: landscape } = render(
      <EntryCard
        {...base}
        id="entry-wide"
        cover={{
          src: "https://media.over.garden/wide.webp",
          alt: "",
          intrinsicWidth: 4000,
          intrinsicHeight: 1000,
        }}
      />,
    );
    expect(
      landscape.querySelector<HTMLElement>('[data-entry-card-media="single"]')
        ?.style.aspectRatio,
    ).toMatch(/^1\.777/u);

    const { container: text } = render(<EntryCard {...base} id="entry-2" />);
    expect(text.querySelector("[data-entry-card-media]")).toBeNull();
  });

  it("shows two or three photographs side by side, and never more than three", () => {
    const photo = (n: number) => ({
      src: `https://media.over.garden/${n}.webp`,
      alt: "",
      intrinsicWidth: 1200,
      intrinsicHeight: 900,
    });
    const { container } = render(
      <EntryCard {...base} media={[photo(1), photo(2), photo(3), photo(4)]} />,
    );
    const grid = container.querySelector('[data-entry-card-media="grid"]');
    expect(grid?.getAttribute("data-entry-card-media-count")).toBe("3");
    expect(grid?.querySelectorAll("img")).toHaveLength(3);
  });

  // OVE-492 (OG-UX-014): who and when, then where, then what was written.
  it("reads author and date first, then the object, then the words", () => {
    const { container } = render(
      <EntryCard
        {...base}
        author={{ displayName: "Олена", href: "/@olena" }}
        subject={{ label: "Томат Черрі", kindLabel: "Рослина" }}
        excerpt="Новий приріст рівний."
        published={{
          dateTime: "2026-09-12T18:40:00.000Z",
          label: "Опубліковано 12 вер. 2026 р.",
        }}
      />,
    );
    const text = container.textContent ?? "";
    const order = [
      "Олена",
      "10 лип.",
      "Опубліковано 12 вер. 2026 р.",
      "Томат Черрі",
      "Підсумок тижня для томата",
      "Новий приріст рівний.",
    ].map((part) => text.indexOf(part));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(
      container
        .querySelector('[data-entry-card-published="true"]')
        ?.getAttribute("datetime"),
    ).toBe("2026-09-12T18:40:00.000Z");
  });

  it("starts at the date when there is no public author, inventing no one", () => {
    const { container } = render(<EntryCard {...base} author={null} />);
    const byline = container.querySelector('[data-entry-card-byline="true"]');
    expect(byline?.querySelector("a")).toBeNull();
    expect(byline?.textContent).toBe("10 лип.");
  });

  // OG-UX-030: the gardener's language on their words, never on the dates.
  it("keeps the dates and the byline out of the entry's language", () => {
    const { container } = render(
      <EntryCard
        {...base}
        contentLanguage="bg"
        title="Седмичен преглед"
        author={{ displayName: "Олена", href: "/@olena" }}
        readMoreLabel="Читати далі"
      />,
    );
    const marked = [...container.querySelectorAll('[lang="bg"]')];
    expect(marked.length).toBeGreaterThan(0);
    for (const element of marked) {
      expect(element.querySelector("time")).toBeNull();
      expect(element.textContent).not.toContain("Олена");
    }
  });

  it("offers Read more with the entry's name in it", () => {
    render(<EntryCard {...base} readMoreLabel="Читати далі" />);
    const readMore = screen.getByRole("link", {
      name: "Читати далі Підсумок тижня для томата",
    });
    expect(readMore.getAttribute("href")).toBe(base.href);
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
