// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => "/",
}));

import {
  CommandPalette,
  CommandPaletteProvider,
  CommandPaletteTrigger,
  isEditableTarget,
  type CommandPaletteResult,
} from "./command-palette";

const ACTIONS: CommandPaletteResult[] = [
  {
    key: "actions",
    id: "actions:journals",
    label: "Журнали",
    detail: null,
    href: "/journals",
    language: null,
  },
  {
    key: "actions",
    id: "actions:new-entry",
    label: "Новий запис",
    detail: null,
    href: "/garden#first-entry-composer",
    language: null,
  },
];

const RESULTS = [
  {
    key: "journals" as const,
    results: [
      {
        key: "journals" as const,
        id: "journals:1",
        label: "Полив без календарної пастки",
        detail: "@yehor",
        href: "/@yehor/poliv",
        language: null,
      },
      {
        key: "journals" as const,
        id: "journals:2",
        label: "Домати след смяна на режима",
        detail: "@ivan",
        href: "/@ivan/domati",
        language: "bg" as const,
      },
    ],
  },
  {
    key: "organisms" as const,
    results: [
      {
        key: "organisms" as const,
        id: "organisms:1",
        label: "Solanum lycopersicum",
        detail: "Solanaceae",
        href: "/species/solanum-lycopersicum",
        language: null,
      },
    ],
  },
];

function renderPalette(
  search = vi.fn().mockResolvedValue(RESULTS),
  props: Partial<React.ComponentProps<typeof CommandPalette>> = {},
) {
  const rendered = render(
    <CommandPalette locale="uk" actions={ACTIONS} search={search} {...props} />,
  );
  return { ...rendered, search };
}

/** Renders, then opens by the trigger, and hands back the keyboard. */
async function openPalette(search = vi.fn().mockResolvedValue(RESULTS)) {
  const user = userEvent.setup();
  renderPalette(search);
  await user.click(screen.getByRole("button", { name: "Пошук" }));
  return { user, search };
}

describe("search fallback", () => {
  it("serves a real localized search link without a palette provider", () => {
    render(<CommandPaletteTrigger label="Пошук" fallbackHref="/bg/journals" />);
    expect(
      screen.getByRole("link", { name: "Пошук" }).getAttribute("href"),
    ).toBe("/bg/journals");
  });

  it("enhances the same link into a keyboard-reachable dialog", async () => {
    render(
      <CommandPaletteProvider
        locale="uk"
        actions={ACTIONS}
        search={vi.fn().mockResolvedValue([])}
      >
        <CommandPaletteTrigger label="Пошук" fallbackHref="/journals" />
      </CommandPaletteProvider>,
    );
    const user = userEvent.setup();
    const link = screen.getByRole("link", { name: "Пошук" });
    link.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(link));
  });
});

describe("CommandPalette", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    // A test that swapped the clock and then failed used to leave it swapped,
    // and every test after it timed out for a reason that was not its own.
    vi.useRealTimers();
  });

  it("is a labelled button that opens a dialog with a combobox", async () => {
    renderPalette();
    const trigger = screen.getByRole("button", { name: "Пошук" });
    expect(trigger.tagName).toBe("BUTTON");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Пошук" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox")).toHaveProperty(
      "tagName",
      "INPUT",
    );
    expect(
      within(dialog).getByRole("combobox").getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("opens on ⌘K and on Ctrl+K", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("opens on / when focus is outside a text field", async () => {
    const user = userEvent.setup();
    renderPalette();
    document.body.focus();
    await user.keyboard("/");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("leaves / alone inside an input, a textarea and a contenteditable", async () => {
    const user = userEvent.setup();
    const { container } = renderPalette();
    for (const html of [
      '<input data-probe="input" />',
      '<textarea data-probe="textarea"></textarea>',
      '<div contenteditable="true" tabindex="0" data-probe="editor"></div>',
    ]) {
      const host = document.createElement("div");
      host.innerHTML = html;
      container.append(host);
      const field = host.firstElementChild as HTMLElement;
      field.focus();
      await user.keyboard("/");
      expect(
        screen.queryByRole("dialog"),
        `${field.dataset.probe} lost the keystroke`,
      ).toBeNull();
      host.remove();
    }
  });

  it("knows the composer's contenteditable is a text field", () => {
    // The rule that matters: the composer is a `contenteditable`, not an
    // `<input>`, so a check for the first two would make the editor swallow
    // every `/` a gardener typed.
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const inner = document.createElement("span");
    editor.append(inner);
    document.body.append(editor);
    expect(isEditableTarget(editor)).toBe(true);
    expect(isEditableTarget(inner)).toBe(true);
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("span"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    editor.remove();
  });

  it("groups results in the order DESIGN.md §5.2 names, and labels each group", async () => {
    const { user } = await openPalette();
    await user.keyboard("томат");

    const listbox = await screen.findByRole("listbox");
    await waitFor(() =>
      expect(within(listbox).getAllByRole("option")).toHaveLength(3),
    );
    const groups = within(listbox).getAllByRole("group");
    expect(
      groups.map((group) => group.getAttribute("aria-labelledby")),
    ).toHaveLength(2);
    expect(listbox.textContent).toContain("Журнали");
    expect(listbox.textContent).toContain("Організми");
    // Journals before organisms, always.
    expect(listbox.textContent!.indexOf("Журнали")).toBeLessThan(
      listbox.textContent!.indexOf("Організми"),
    );
  });

  it("moves the active option with the arrows, across group boundaries", async () => {
    const { user } = await openPalette();
    await user.keyboard("томат");
    const field = screen.getByRole("combobox");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));

    const activeLabel = () => {
      const id = field.getAttribute("aria-activedescendant");
      return id ? document.getElementById(id)?.textContent : null;
    };
    expect(activeLabel()).toContain("Полив");
    await user.keyboard("{ArrowDown}");
    expect(activeLabel()).toContain("Домати");
    // The third option is in the next group: Down crosses the boundary.
    await user.keyboard("{ArrowDown}");
    expect(activeLabel()).toContain("Solanum");
    await user.keyboard("{ArrowUp}");
    expect(activeLabel()).toContain("Домати");
    // Focus never left the field: the arrows move a pointer, not focus.
    expect(document.activeElement).toBe(field);
  });

  it("opens the active option on Enter", async () => {
    const { user } = await openPalette();
    await user.keyboard("томат");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(mocks.push).toHaveBeenCalledWith("/@ivan/domati");
  });

  it("marks a result whose words are not the reader's language", async () => {
    const { user } = await openPalette();
    await user.keyboard("томат");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    const bulgarian = screen.getByRole("option", {
      name: /Домати/,
    });
    expect(bulgarian.querySelector('[lang="bg"]')).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /Полив/ }).querySelector("[lang]"),
    ).toBeNull();
  });

  it("announces the count once per settled query, not once per keystroke", async () => {
    const { user, search } = await openPalette();
    const live = document.querySelector('[data-command-palette-live="true"]');
    expect(live?.getAttribute("aria-live")).toBe("polite");
    // Empty before there is anything to say. A live region that announces a
    // number on every keystroke is worse than none at all, which is why the
    // region reads from the settled query and not from the field.
    expect(live?.textContent).toBe("");

    await user.keyboard("томат");
    await waitFor(() => expect(live?.textContent).toContain("3"));
    // Five keystrokes, one read.
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("томат", "uk");
  });

  it("shows the no-results state rather than an empty box", async () => {
    const { user } = await openPalette(vi.fn().mockResolvedValue([]));
    await user.keyboard("щось");
    await waitFor(() =>
      expect(
        document.querySelector('[data-screen-state="empty-no-results"]'),
      ).toBeTruthy(),
    );
    expect(document.body.textContent).toContain("Нічого не знайдено");
  });

  it("states the shortcuts in its footer", async () => {
    await openPalette();
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Enter");
    expect(dialog.textContent).toContain("Esc");
    expect(dialog.textContent).toContain("↑ ↓");
  });

  it("offers recent searches when the field is empty, and clears them", async () => {
    window.localStorage.setItem(
      "overgarden-palette-recent",
      JSON.stringify(["томат", "бджоли"]),
    );
    const { user } = await openPalette();
    const recent = await waitFor(() => {
      const found = document.querySelector(
        '[data-command-palette-recent="true"]',
      );
      if (!found) throw new Error("no recents");
      return found as HTMLElement;
    });
    expect(recent.textContent).toContain("томат");
    await user.click(
      within(recent).getByRole("button", { name: "Очистити нещодавні" }),
    );
    expect(window.localStorage.getItem("overgarden-palette-recent")).toBeNull();
  });

  it("survives a read that fails, and says the full pages still work", async () => {
    const { user } = await openPalette(
      vi.fn().mockRejectedValue(new Error("503")),
    );
    await user.keyboard("томат");
    await waitFor(() =>
      expect(document.body.textContent).toContain("Пошук зараз недоступний"),
    );
  });

  it("returns focus to the trigger when it closes", async () => {
    const { user } = await openPalette();
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Waited for, not asserted a frame later: the restore runs on the next
    // animation frame — after `base-ui` has finished its own focus handling for
    // the close — and a machine slower than this one needs more than one tick.
    // Asserted immediately, this passed locally and failed in CI.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Пошук" }),
      ),
    );
  });
});
