// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilterBar, type FilterBarProps } from "./filter-bar";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
// `next/link` with a mark on it, so a test can tell the client router's link
// from a document navigation: in the DOM both are the same `<a href>`.
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a">) => (
    <a data-client-link="true" {...props} />
  ),
}));

const labels: FilterBarProps["labels"] = {
  filters: "Фільтри журналів",
  openFilters: "Фільтри (2)",
  sheetDescription: "Виберіть фільтри та застосуйте їх.",
  apply: "Показати результати",
  close: "Закрити",
  clear: "Очистити фільтри",
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

const TWO_CHIPS: FilterBarProps["chips"] = [
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
  afterEach(() => vi.unstubAllGlobals());

  it("is a GET form with a real action, so it searches without JavaScript", () => {
    const { container } = renderBar();
    const form = container.querySelector('form[data-filter-bar-form="true"]');

    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("action")).toBe("/journals");
    expect(form?.querySelector('button[type="submit"]')).toBeTruthy();
    // The committed filters ride along as hidden fields, so a search never
    // drops them.
    expect(
      form?.querySelector('input[type="hidden"][name="kind"]'),
    ).toHaveProperty("value", "plant");
  });

  it("puts the secondary facets in a native popover panel, labelled, with Close", () => {
    const { container } = renderBar({ clearFiltersHref: "/journals?q=x" });

    const open = screen.getByRole("button", { name: "Фільтри (2)" });
    const panel = container.querySelector('[data-slot="filter-panel"]');
    // Opened by the browser itself, so it works before hydration.
    expect(open.getAttribute("popovertarget")).toBe(panel?.id);
    expect(panel?.getAttribute("popover")).toBe("auto");
    expect(panel?.getAttribute("role")).toBe("dialog");
    // Close is named Close — never Reset — and only hides the panel.
    const close = container.querySelector('[data-filter-bar-close="true"]');
    expect(close?.getAttribute("aria-label")).toBe("Закрити");
    expect(close?.getAttribute("popovertargetaction")).toBe("hide");
    // Clear filters is its own link, separate from Close.
    expect(
      container
        .querySelector('[data-filter-bar-clear="true"]')
        ?.getAttribute("href"),
    ).toBe("/journals?q=x");
  });

  it("keeps the panel's controls in their own form, carrying the query", () => {
    const { container } = renderBar({ carry: { q: "томат" } });

    const panelForm = container.querySelector(
      'form[data-filter-bar-panel-form="true"]',
    ) as HTMLFormElement;
    const topic = screen.getByLabelText("Тема") as HTMLSelectElement;
    expect(topic.form).toBe(panelForm);
    expect(new FormData(panelForm).get("q")).toBe("томат");
    const submit = screen.getByRole("button", {
      name: "Показати результати",
      hidden: true,
    }) as HTMLButtonElement;
    expect(submit.form).toBe(panelForm);
  });

  it("applies the draft only on Show results, and drops the page it was on", async () => {
    renderBar({ hidden: { page: "3" }, carry: { q: "томат" } });

    await userEvent.selectOptions(screen.getByLabelText("Тема"), [
      "winter-care",
    ]);
    // A draft: nothing moves until the reader says so.
    expect(push).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Показати результати", hidden: true }),
    );
    expect(push).toHaveBeenCalledTimes(1);
    const target = new URL(push.mock.calls[0]![0] as string, "https://x.test");
    expect(target.pathname).toBe("/journals");
    expect(target.searchParams.get("q")).toBe("томат");
    expect(target.searchParams.get("kind")).toBe("plant");
    expect(target.searchParams.get("topic")).toBe("winter-care");
    expect(target.searchParams.has("sort")).toBe(false);
    expect(target.searchParams.has("page")).toBe(false);
  });

  it("discards the draft when the panel closes without applying", () => {
    const { container } = renderBar();
    const topic = screen.getByLabelText("Тема") as HTMLSelectElement;
    topic.value = "winter-care";

    const panel = container.querySelector('[data-slot="filter-panel"]')!;
    const event = new Event("toggle") as Event & { newState?: string };
    Object.defineProperty(event, "newState", { value: "closed" });
    panel.dispatchEvent(event);

    expect(topic.value).toBe("");
    expect(push).not.toHaveBeenCalled();
  });

  it("sorts through its own control, on change", async () => {
    renderBar();

    const sort = screen.getByRole("combobox", { name: "Сортування" });
    await userEvent.selectOptions(sort, ["relevance"]);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0]).toContain("sort=relevance");
    expect(push.mock.calls[0]![0]).toContain("kind=plant");
  });

  it("crosses the static query-twin boundary with a document navigation", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    renderBar({ documentNavigation: true });
    await userEvent.selectOptions(screen.getByLabelText("Тема"), [
      "winter-care",
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Показати результати", hidden: true }),
    );
    expect(push).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(
      "/journals?kind=plant&topic=winter-care",
    );
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

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Обрізка/u, hidden: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Показати результати", hidden: true }),
    );

    const target = new URL(push.mock.calls[0]![0] as string, "https://x.test");
    // Repeated, never comma-joined: a comma is a legal character in a slug.
    expect(target.searchParams.getAll("topic")).toEqual([
      "winter-care",
      "pruning",
    ]);
  });

  it("draws the primary modes as links with aria-current", () => {
    renderBar({
      modes: [
        { label: "Усі", href: "/journals", current: false },
        { label: "Рослини", href: "/journals?kind=plant", current: true },
      ],
      labels: { ...labels, modes: "Що показати" },
    });

    const nav = screen.getByRole("navigation", { name: "Що показати" });
    expect(nav).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Рослини" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Усі" }).getAttribute("aria-current"),
    ).toBeNull();
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

    expect(
      screen
        .getByRole("link", { name: "Зняти фільтр: Рослини" })
        .getAttribute("href"),
    ).toBe("/journals?topic=winter-care");
    expect(
      screen.getByRole("link", { name: "Скинути все" }).getAttribute("href"),
    ).toBe("/journals");
  });

  it("removes a filter through the router, which keeps the count's live region", () => {
    renderBar({ chips: TWO_CHIPS, clearAllHref: "/journals" });
    expect(
      screen.getByRole("link", { name: "Зняти фільтр: Рослини" }).dataset
        .clientLink,
    ).toBe("true");
  });

  it("leaves the chips and the clear links to the document when a listing asks", () => {
    // `OVE-496`: the shell links the catalogue's static door from every page,
    // so a client link into one of its query views could change only the URL.
    renderBar({
      documentLinks: true,
      chips: TWO_CHIPS,
      clearAllHref: "/journals",
      clearFiltersHref: "/journals?q=x",
    });
    for (const name of [
      "Зняти фільтр: Рослини",
      "Зняти фільтр: Зимовий догляд",
      "Скинути все",
      "Очистити фільтри",
    ]) {
      const link = screen.getByRole("link", { name, hidden: true });
      expect(link.tagName, name).toBe("A");
      expect(link.dataset.clientLink, name).toBeUndefined();
    }
    expect(
      screen
        .getByRole("link", { name: "Зняти фільтр: Рослини" })
        .getAttribute("href"),
    ).toBe("/journals?topic=winter-care");
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

  it("draws no Filters button when a listing has no secondary facet", () => {
    renderBar({ facets: [] });
    expect(screen.queryByRole("button", { name: /Фільтри/u })).toBeNull();
  });
});
