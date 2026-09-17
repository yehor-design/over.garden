// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

function Harness() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost">Що це означає</Button>} />
      <PopoverContent>
        <PopoverTitle>EPPO</PopoverTitle>
        <p>Європейська організація захисту рослин.</p>
      </PopoverContent>
    </Popover>
  );
}

describe("Popover", () => {
  it("opens from its trigger and is a real dialog while it is open", async () => {
    render(<Harness />);
    await userEvent.click(
      screen.getByRole("button", { name: "Що це означає" }),
    );
    expect(await screen.findByRole("dialog", { name: "EPPO" })).not.toBeNull();
  });

  it("Esc closes it and focus returns to the trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Що це означає" });
    await userEvent.click(trigger);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryAllByRole("dialog")).toHaveLength(0);
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("floats, so it carries the popover elevation and a card does not", async () => {
    const { container } = render(<Harness />);
    await userEvent.click(
      screen.getByRole("button", { name: "Що це означає" }),
    );
    await screen.findByRole("dialog");
    const popup = document.querySelector('[data-slot="popover-content"]');
    expect(popup?.className).toContain("shadow-popover");
    expect(container.className).not.toContain("shadow");
  });
});
