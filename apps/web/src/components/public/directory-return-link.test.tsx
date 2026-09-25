// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  DirectoryReturnLink,
  readDirectoryReturnTarget,
  readFeedReturnTarget,
  readSavedReturnTarget,
} from "./directory-return-link";

const ORIGIN = "https://over.garden";

/** The entry page, opened from a listing whose card carried `?from=`. */
function openEntryFrom(from: string) {
  window.history.replaceState(
    null,
    "",
    `/@olena/post/7?${new URLSearchParams({ from })}`,
  );
}

describe("the way back to the journals", () => {
  it("serves the plain directory: a working link before anything runs", () => {
    const html = renderToStaticMarkup(
      <DirectoryReturnLink href="/bg/journals" label="Дневници" />,
    );

    expect(html).toContain('href="/bg/journals"');
    expect(html).toContain("Дневници");
  });

  it("restores the view a reader came from, with the directory's own parameters", () => {
    expect(
      readDirectoryReturnTarget("/journals?topic=tomaty&page=2", ORIGIN),
    ).toBe("/journals?topic=tomaty&page=2");
    expect(readDirectoryReturnTarget("/bg/journals?kind=plant", ORIGIN)).toBe(
      "/bg/journals?kind=plant",
    );
    // A parameter the directory does not read never rides along.
    expect(
      readDirectoryReturnTarget("/journals?topic=tomaty&token=opaque", ORIGIN),
    ).toBe("/journals?topic=tomaty");
  });

  it("names nothing but a directory address", () => {
    for (const from of [
      null,
      "",
      "https://evil.example/journals",
      "//evil.example/journals",
      "/garden",
      "/journals#fragment",
      "/@yehor/post/3",
      "/journals/../garden",
      "journals",
      `/journals?q=${"x".repeat(2_000)}`,
    ]) {
      expect(readDirectoryReturnTarget(from, ORIGIN), String(from)).toBeNull();
    }
  });

  // OVE-493: a reader who came from the feed goes back to that feed view.
  it("returns to the feed view a reader came from, and to nothing else", () => {
    expect(readFeedReturnTarget("/", ORIGIN)).toBe("/");
    expect(readFeedReturnTarget("/bg?kind=plant&topic=tomaty", ORIGIN)).toBe(
      "/bg?kind=plant&topic=tomaty",
    );
    expect(readFeedReturnTarget("/?kind=animal&token=opaque", ORIGIN)).toBe(
      "/?kind=animal",
    );
    for (const from of [
      null,
      "/journals",
      "https://evil.example/",
      "//evil.example/",
      "/#top",
      "/garden",
      "/de",
    ]) {
      expect(readFeedReturnTarget(from, ORIGIN), String(from)).toBeNull();
    }
  });

  // OVE-502: a reader who opened a saved entry goes back to the shelf view.
  it("returns to the bookmark view a reader came from, in each language", () => {
    expect(readSavedReturnTarget("/bookmarks", ORIGIN)).toBe("/bookmarks");
    expect(
      readSavedReturnTarget("/bookmarks?kind=journal_entry&page=2", ORIGIN),
    ).toBe("/bookmarks?kind=journal_entry&page=2");
    expect(
      readSavedReturnTarget("/bg/bookmarks?kind=journal_entry", ORIGIN),
    ).toBe("/bg/bookmarks?kind=journal_entry");
    expect(readSavedReturnTarget("/ru/bookmarks?page=3", ORIGIN)).toBe(
      "/ru/bookmarks?page=3",
    );
    // What the shelf does not read never rides along — an outcome least of
    // all, or the shelf would say its last notice again.
    expect(
      readSavedReturnTarget(
        "/bookmarks?outcome=removed&action=remove&target=topic%3Atomaty&kind=topic",
        ORIGIN,
      ),
    ).toBe("/bookmarks?kind=topic");
  });

  it("names nothing but a bookmark view", () => {
    for (const from of [
      null,
      "",
      "bookmarks",
      "https://evil.example/bookmarks",
      "//evil.example/bookmarks",
      "/bookmarks#saved-topic-tomaty",
      "/bookmarks?kind=topic#shelf-outcome",
      "/notifications",
      "/uk/bookmarks",
      "/de/bookmarks",
      "/bookmarks/extra",
      "/bookmarks/../garden",
      "/journals",
      "/",
      `/bookmarks?kind=${"x".repeat(1_500)}`,
    ]) {
      expect(readSavedReturnTarget(from, ORIGIN), String(from)).toBeNull();
    }
  });
});

describe("the way back, once the page runs", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("serves the plain directory with the shelf's label unused", () => {
    // The served document cannot read `from`; the way back to the shelf
    // arrives after hydration, never in place of a working link.
    const html = renderToStaticMarkup(
      <DirectoryReturnLink
        href="/journals"
        label="Журнали"
        feedLabel="Стрічка"
        savedLabel="Закладки"
      />,
    );

    expect(html).toContain('href="/journals"');
    expect(html).toContain("Журнали");
    expect(html).not.toContain("Закладки");
  });

  it("leads back to the bookmark view a saved entry was opened from", async () => {
    openEntryFrom("/bg/bookmarks?kind=journal_entry&page=2");

    render(
      <DirectoryReturnLink
        href="/bg/journals"
        label="Дневници"
        feedLabel="Емисия"
        savedLabel="Отметки"
      />,
    );

    const link = await screen.findByRole("link", { name: "Отметки" });
    expect(link.getAttribute("href")).toBe(
      "/bg/bookmarks?kind=journal_entry&page=2",
    );
  });

  it("keeps the directory where the page was not given the shelf's label", async () => {
    openEntryFrom("/bookmarks?kind=journal_entry");

    render(
      <DirectoryReturnLink
        href="/journals"
        label="Журнали"
        feedLabel="Стрічка"
      />,
    );

    // Give the effect its turn, then check nothing changed.
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Журнали" }).getAttribute("href"),
      ).toBe("/journals"),
    );
    expect(screen.queryByRole("link", { name: "Закладки" })).toBeNull();
  });

  it("still returns to a directory view before the shelf's", async () => {
    openEntryFrom("/journals?topic=tomaty");

    render(
      <DirectoryReturnLink
        href="/journals"
        label="Журнали"
        feedLabel="Стрічка"
        savedLabel="Закладки"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Журнали" }).getAttribute("href"),
      ).toBe("/journals?topic=tomaty"),
    );
  });
});
