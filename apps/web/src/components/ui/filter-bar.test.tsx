// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilterBar, type FilterBarProps } from "./filter-bar";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const labels: FilterBarProps["labels"] = {
  filters: "Фільтри журналів",
  openFilters: "Фільтри (2)",
  sheetDescription: "Виберіть фільтри та застосуйте їх.",
  apply: "Застосувати",
  clear: "Скинути",
  clearAll: "Скинути все",
  activeFilters: "Активні фільтри",
  sort: "Сортування",
};

const facets: FilterBarProps["facets"] = [
  {
    key: "kind",
    label: "Живий об'єкт",
    anyLabel: "Усі об'єкти",
    value: ["plant"],
    options: [
      { value: "plant", label: "Рослини", count: 9 },
      { value: "animal", label: "Тварини", count: 2 },
    ],
  },
  {
    key: "topic",
    label: "Тема",
    anyLabel: "Усі теми",
    value: [],
    options: [{ value: "winter-care", label: "Зимовий догляд", count: 4 }],
  },
];

function renderBar(overrides: Partial<FilterBarProps> = {}) {
  return render(
    <FilterBar
      action="/journals"
      search={<button type="submit">Знайти</button>}
      facets={facets}
      sort={{
        key: "sort",
        value: "recent",
        defaultValue: "recent",
        options: [
          { value: "recent", label: "Найновіші" },
          { value: "relevance", label: "За релевантністю" },
        ],
      }}
      labels={labels}
      {...overrides}
    />,
  );
}

describe("FilterBar", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("is a GET form with a real action, so it filters without JavaScript", () => {
    const { container } = renderBar();
    const form = container.querySelector("form");

    // Criterion 7. The form is the mechanism; on-change is layered over it.
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("action")).toBe("/journals");
    // The submit the no-script path needs is the caller's own, inside the
    // form — here the search button — so there is no `<noscript>` block and
    // no control that appears and vanishes on hydration.
    expect(form?.querySelector('button[type="submit"]')).toBeTruthy();
  });

  it("names every facet and states what is selected", () => {
    renderBar();

    const kind = screen.getByLabelText("Живий об'єкт");
    expect(kind).toHaveProperty("value", "plant");
    const topic = screen.getByLabelText("Тема");
    // Unset means the "any" option, which is the empty value — so the
    // parameter is simply absent from the next URL.
    expect(topic).toHaveProperty("value", "");
  });

  it("applies on change, and drops the page it was on", async () => {
    renderBar({ hidden: { q: "томат", page: "3" } });

    await userEvent.selectOptions(screen.getByLabelText("Тема"), [
      "winter-care",
    ]);

    // Criterion 1 and criterion 5: no submit press, and the whole view is in
    // the URL — one parameter per facet, named for the facet.
    expect(push).toHaveBeenCalledTimes(1);
    const target = new URL(push.mock.calls[0]![0] as string, "https://x.test");
    expect(target.pathname).toBe("/journals");
    expect(target.searchParams.get("q")).toBe("томат");
    expect(target.searchParams.get("kind")).toBe("plant");
    expect(target.searchParams.get("topic")).toBe("winter-care");
    // The default sort is left out, because absent means unset: a default
    // written into the URL gives one view two addresses.
    expect(target.searchParams.has("sort")).toBe(false);
    // A new filter starts at the first page, which is the only one that
    // certainly exists.
    expect(target.searchParams.has("page")).toBe(false);
  });

  it("sorts through its own control, which is never inside the filters", async () => {
    renderBar();

    const sort = screen.getByRole("combobox", { name: "Сортування" });
    await userEvent.selectOptions(sort, ["relevance"]);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0]).toContain("sort=relevance");
  });

  it("repeats a parameter for a multi-select facet", async () => {
    renderBar({
      facets: [
        {
          key: "topic",
          label: "Тема",
          multiple: true,
          value: ["winter-care"],
          options: [
            { value: "winter-care", label: "Зимовий догляд" },
            { value: "pruning", label: "Обрізка" },
          ],
        },
      ],
      sort: undefined,
    });

    await userEvent.click(screen.getByRole("checkbox", { name: /Обрізка/u }));

    const target = new URL(push.mock.calls[0]![0] as string, "https://x.test");
    // Repeated, never comma-joined: a comma is a legal character in a slug.
    expect(target.searchParams.getAll("topic")).toEqual([
      "winter-care",
      "pruning",
    ]);
  });

  it("renders the active filters as chips whose removal is a real link", () => {
    renderBar({
      chips: [
        {
          key: "kind",
          label: "Рослини",
          removeHref: "/journals?topic=winter-care",
          removeLabel: "Зняти фільтр: Рослини",
        },
        {
          key: "topic",
          label: "Зимовий догляд",
          removeHref: "/journals?kind=plant",
          removeLabel: "Зняти фільтр: Зимовий догляд",
        },
      ],
      clearAllHref: "/journals",
    });

    // Criterion 2. A link rather than a button, so a chip works unhydrated and
    // a reader can open the narrowed view in a new tab.
    expect(
      screen
        .getByRole("link", { name: "Зняти фільтр: Рослини" })
        .getAttribute("href"),
    ).toBe("/journals?topic=winter-care");
    expect(
      screen.getByRole("link", { name: "Скинути все" }).getAttribute("href"),
    ).toBe("/journals");
  });

  it("offers Clear all only once more than one filter is set", () => {
    renderBar({
      chips: [
        {
          key: "kind",
          label: "Рослини",
          removeHref: "/journals",
          removeLabel: "Зняти фільтр: Рослини",
        },
      ],
      clearAllHref: "/journals",
    });

    expect(screen.queryByRole("link", { name: "Скинути все" })).toBeNull();
  });

  it("collapses into one button below lg, and that sheet is the one place Apply survives", async () => {
    renderBar({ chips: [] });

    const open = screen.getByRole("button", { name: /Фільтри \(2\)/u });
    await userEvent.click(open);

    // Criterion 6: a sheet hides the results, so it needs Apply and Clear.
    expect(screen.getByRole("button", { name: "Застосувати" })).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: "Фільтри журналів" }),
    ).toBeTruthy();
  });
});
