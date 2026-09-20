// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TabLinks, Tabs } from "./tabs";

const TABS = [
  { id: "entries", label: "Записи", content: <p>Список записів</p> },
  { id: "photos", label: "Фото", content: <p>Галерея</p> },
  { id: "notes", label: "Нотатки", content: <p>Нотатки</p> },
];

describe("Tabs", () => {
  it("is a named tab list with one selected tab and one visible panel", () => {
    render(<Tabs label="Розділи журналу" tabs={TABS} />);
    expect(
      screen.getByRole("tablist", { name: "Розділи журналу" }),
    ).not.toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe(
      "Записи",
    );
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("keeps exactly one tab in the tab order — a roving tabindex", async () => {
    render(<Tabs label="Розділи журналу" tabs={TABS} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    await userEvent.tab();
    expect(document.activeElement).toBe(tabs[0]);
    // Tab leaves the list rather than walking through every tab.
    await userEvent.tab();
    expect(document.activeElement).not.toBe(tabs[1]);
  });

  it("moves and selects with the arrow keys, and wraps", async () => {
    render(<Tabs label="Розділи журналу" tabs={TABS} />);
    screen.getAllByRole("tab")[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe(
      "Фото",
    );
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe(
      "Нотатки",
    );
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe(
      "Записи",
    );
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe(
      "Нотатки",
    );
  });

  it("skips a disabled tab and never selects it", async () => {
    render(
      <Tabs
        label="Розділи журналу"
        tabs={[TABS[0]!, { ...TABS[1]!, disabled: true }, TABS[2]!]}
      />,
    );
    const photos = screen.getByRole("tab", { name: "Фото" });
    expect(photos).toHaveProperty("disabled", true);
    screen.getByRole("tab", { name: "Записи" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe(
      "Нотатки",
    );
  });
});

/**
 * `OVE-456`: the strip a family of *pages* uses. Four addresses, so pressing
 * one navigates — which makes these links, and a `tablist` whose tabs navigate
 * is a lie a screen reader cannot recover from.
 */
describe("TabLinks", () => {
  const ITEMS = [
    { key: "feed", label: "Стрічка", href: "/feed", current: false },
    {
      key: "notifications",
      label: "Сповіщення",
      href: "/notifications",
      current: true,
    },
    { key: "bookmarks", label: "Закладки", href: "/bookmarks", current: false },
  ];

  it("is a named navigation landmark of links, never a tab list", () => {
    render(<TabLinks label="Моє" items={ITEMS} />);
    expect(screen.getByRole("navigation", { name: "Моє" })).not.toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Сповіщення" }).getAttribute("href"),
    ).toBe("/notifications");
  });

  it("marks the page the reader is on with aria-current", () => {
    render(<TabLinks label="Моє" items={ITEMS} />);
    expect(
      screen
        .getByRole("link", { name: "Сповіщення" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("link", { name: "Стрічка" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("draws the selected tab the way Tabs draws its own", () => {
    render(
      <>
        <Tabs label="Розділи журналу" tabs={TABS} />
        <TabLinks label="Моє" items={ITEMS} />
      </>,
    );
    const selectedTab = screen.getByRole("tab", { selected: true });
    const currentLink = screen.getByRole("link", { name: "Сповіщення" });
    expect(currentLink.className).toContain("border-action");
    expect(selectedTab.className).toContain("border-action");
  });
});
