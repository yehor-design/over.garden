// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

import { CommandPaletteDialog } from "./command-palette-dialog";

/**
 * The dialog on its own, as `command-palette.tsx` mounts it once its code has
 * arrived (`OVE-468`). The palette's behaviour end to end — shortcuts, groups,
 * the live region, recents — is `command-palette.test.tsx`; what arrives
 * before the code does is `command-palette-on-demand.test.tsx`.
 */
function renderDialog(
  props: Partial<React.ComponentProps<typeof CommandPaletteDialog>> = {},
) {
  const onOpenChange = vi.fn();
  render(
    <CommandPaletteDialog
      open
      onOpenChange={onOpenChange}
      locale="uk"
      actions={[]}
      search={vi.fn().mockResolvedValue([])}
      initialQuery=""
      {...props}
    />,
  );
  return { onOpenChange };
}

describe("CommandPaletteDialog", () => {
  it("is a dialog named by its title, with a combobox named the same", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog", {
      name: "Пошук в OverGarden",
    });
    expect(dialog).toBeTruthy();
    const field = screen.getByRole("combobox", { name: "Пошук в OverGarden" });
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(screen.getByRole("button", { name: "Закрити пошук" }).tagName).toBe(
      "BUTTON",
    );
  });

  it("starts from what was typed before it arrived, and searches for it", async () => {
    const search = vi.fn().mockResolvedValue([]);
    renderDialog({ initialQuery: "томат", search });
    const field = await screen.findByRole("combobox", {
      name: "Пошук в OverGarden",
    });
    expect(field).toHaveProperty("value", "томат");
    await waitFor(() => expect(search).toHaveBeenCalledWith("томат", "uk"));
  });

  it("asks to close on Escape, and draws nothing when closed", async () => {
    const { onOpenChange } = renderDialog();
    await screen.findByRole("dialog", { name: "Пошук в OverGarden" });
    await userEvent.setup().keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it("renders no dialog while it is closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
