// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./command-palette";

/**
 * The dialog's code arrives on the first press (`OVE-468`). These hold that
 * download open and press before it lands — the case a fast laptop never
 * shows and a phone always does.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

/** A palette whose dialog arrives when the test says so — or never. */
function renderPaletteWithHeldDialog() {
  let arrive!: () => void;
  let fail!: () => void;
  const download = new Promise<void>((resolve, reject) => {
    arrive = resolve;
    fail = () => reject(new Error("the chunk did not arrive"));
  });
  let arrived: Promise<unknown> = download;
  const loadDialog = () => {
    const loaded = download
      .then(() => import("./command-palette-dialog"))
      .then((module) => module.CommandPaletteDialog);
    arrived = loaded.catch(() => undefined);
    return loaded;
  };
  render(
    <>
      <CommandPalette
        locale="uk"
        actions={[]}
        search={vi.fn().mockResolvedValue([])}
        loadDialog={loadDialog}
      />
      <input aria-label="elsewhere" />
    </>,
  );
  return {
    arrive: () => arrive(),
    fail: () => fail(),
    /** Settles once the latest download has arrived or failed. */
    settled: () => arrived,
  };
}

describe("the palette before its dialog has arrived", () => {
  it("keeps ⌘K and the query typed after it, and puts the caret after the query", async () => {
    const download = renderPaletteWithHeldDialog();
    const user = userEvent.setup();

    await user.keyboard("{Meta>}k{/Meta}");
    await user.keyboard("том");
    expect(document.querySelector('[data-command-palette="true"]')).toBeNull();

    download.arrive();
    const field = await screen.findByRole("combobox");
    expect(field).toHaveProperty("value", "том");
    await waitFor(() => expect(document.activeElement).toBe(field));
    await user.keyboard("ат");
    expect(field).toHaveProperty("value", "томат");
  });

  it("reads `/` pressed again while it waits as the shortcut, not as the query", async () => {
    const download = renderPaletteWithHeldDialog();
    const user = userEvent.setup();

    await user.keyboard("/");
    await user.keyboard("/");
    await user.keyboard("кава");
    download.arrive();
    const field = await screen.findByRole("combobox");
    expect(field).toHaveProperty("value", "кава");
  });

  it("keeps a press on the trigger, and Escape takes the request back", async () => {
    const download = renderPaletteWithHeldDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Пошук" }));
    await user.keyboard("{Escape}");
    download.arrive();
    // Arrived, and drawn — closed, because the request was taken back. Given
    // the time an opening popup takes to reach the document, it never does.
    await act(async () => {
      await download.settled();
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(document.querySelector('[data-command-palette="true"]')).toBeNull();

    // Asked for again, it opens at once: the code is here now.
    await user.click(screen.getByRole("button", { name: "Пошук" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
  });

  it("gives the keyboard back when the dialog's code cannot be fetched", async () => {
    const download = renderPaletteWithHeldDialog();
    const user = userEvent.setup();

    await user.keyboard("{Meta>}k{/Meta}");
    download.fail();
    await act(async () => {
      await download.settled();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.querySelector('[data-command-palette="true"]')).toBeNull();

    // Keys were being kept for a palette that never came; now they are not.
    const elsewhere = screen.getByRole("textbox", { name: "elsewhere" });
    await user.click(elsewhere);
    await user.keyboard("кава");
    expect(elsewhere).toHaveProperty("value", "кава");
  });
});
