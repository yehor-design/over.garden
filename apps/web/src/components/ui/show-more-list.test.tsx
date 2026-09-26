// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getShowMoreCopy, type ShowMorePortion } from "@/lib/show-more";

import { ShowMoreList } from "./show-more-list";

const copy = getShowMoreCopy("uk");

function items(from: number, count: number) {
  return Array.from({ length: count }, (_, index) => (
    <li key={from + index} data-item={from + index}>
      {`Запис ${from + index}`}
    </li>
  ));
}

function portion(from: number, next: number | null): ShowMorePortion {
  return {
    items: items(from, 2),
    next: next ? { token: String(next), href: `/?page=${next}` } : null,
  };
}

/** A viewport the test decides: every observed link is "in view" on demand. */
let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];

beforeEach(() => {
  observed = [];
  globalThis.IntersectionObserver = class {
    private readonly callback: (
      entries: Array<{ isIntersecting: boolean }>,
    ) => void;
    constructor(
      callback: (entries: Array<{ isIntersecting: boolean }>) => void,
    ) {
      this.callback = callback;
    }
    observe() {
      observed.push(this.callback);
    }
    unobserve() {}
    disconnect() {
      observed = observed.filter((callback) => callback !== this.callback);
    }
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function scrollIntoView() {
  await act(async () => {
    for (const callback of [...observed]) callback([{ isIntersecting: true }]);
  });
}

describe("ShowMoreList", () => {
  it("renders the page's portion and a real link to the next one", () => {
    render(
      <ShowMoreList
        copy={copy}
        next={{ token: "2", href: "/?page=2" }}
        load={vi.fn()}
        data-list="true"
      >
        {items(1, 2)}
      </ShowMoreList>,
    );
    const list = document.querySelector('[data-list="true"]')!;
    expect(list.tagName).toBe("OL");
    expect(list.children).toHaveLength(2);
    const link = screen.getByRole("link", { name: "Показати ще" });
    expect(link.getAttribute("href")).toBe("/?page=2");
  });

  it("draws no link after the last portion", () => {
    render(
      <ShowMoreList copy={copy} next={null} load={vi.fn()}>
        {items(1, 2)}
      </ShowMoreList>,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("appends a pressed portion in place, hands focus to its first item and says so", async () => {
    const load = vi.fn(async () => portion(3, 3));
    render(
      <ShowMoreList
        copy={copy}
        next={{ token: "2", href: "/?page=2" }}
        load={load}
      >
        {items(1, 2)}
      </ShowMoreList>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Показати ще" }));
    });
    expect(load).toHaveBeenCalledWith("2");
    expect(document.querySelectorAll("li")).toHaveLength(4);
    expect(document.activeElement?.getAttribute("data-item")).toBe("3");
    expect(
      screen.getByRole("link", { name: "Показати ще" }).getAttribute("href"),
    ).toBe("/?page=3");
    expect(
      document.querySelector("[data-show-more-announcement]")?.textContent,
    ).toBe("Список доповнено.");
  });

  it("loads by itself within a screen of the viewport, without moving focus, three portions in a row", async () => {
    let next = 2;
    const load = vi.fn(async () => {
      next += 1;
      return portion(next * 10, next);
    });
    render(
      <ShowMoreList
        copy={copy}
        next={{ token: "2", href: "/?page=2" }}
        load={load}
      >
        {items(1, 2)}
      </ShowMoreList>,
    );
    const before = document.activeElement;
    for (let round = 0; round < 5; round += 1) await scrollIntoView();
    // Three by scrolling, then the link waits for a press: the footer below
    // the list must stay reachable.
    expect(load).toHaveBeenCalledTimes(3);
    expect(document.activeElement).toBe(before);
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Показати ще" }));
    });
    expect(load).toHaveBeenCalledTimes(4);
    // A press lets the next ones load by themselves again.
    await scrollIntoView();
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("says a failed fetch and leaves a link that navigates", async () => {
    const load = vi.fn(async () => {
      throw new Error("offline");
    });
    render(
      <ShowMoreList
        copy={copy}
        next={{ token: "2", href: "/?page=2" }}
        load={load}
      >
        {items(1, 2)}
      </ShowMoreList>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Показати ще" }));
    });
    expect(screen.getByRole("alert").textContent).toBe(copy.failed);
    const link = screen.getByRole("link", { name: "Показати ще" });
    const press = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("starts over when a client navigation brings another view of the list", async () => {
    const load = vi.fn(async () => portion(3, 3));
    const { rerender } = render(
      <ShowMoreList copy={copy} next={null} load={load}>
        {items(1, 2)}
      </ShowMoreList>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    // The same component, now the full view: its own link, from the start.
    rerender(
      <ShowMoreList
        copy={copy}
        next={{ token: "2", href: "/?view=all&page=2" }}
        load={load}
      >
        {items(1, 2)}
      </ShowMoreList>,
    );
    expect(
      screen.getByRole("link", { name: "Показати ще" }).getAttribute("href"),
    ).toBe("/?view=all&page=2");
  });
});
