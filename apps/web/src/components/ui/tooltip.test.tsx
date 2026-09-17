// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { IconButton } from "./icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

describe("Tooltip", () => {
  it("repeats what the icon-only control already says", async () => {
    // DESIGN.md §2.8: an icon-only control always has a tooltip **and** an
    // `aria-label` saying the same thing — the tooltip is for a sighted
    // reader, the label for everyone else, and neither replaces the other.
    render(
      <Tooltip>
        <TooltipTrigger
          render={
            <IconButton label="Закрити меню">
              <svg aria-hidden="true" />
            </IconButton>
          }
        />
        <TooltipContent>Закрити меню</TooltipContent>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button", { name: "Закрити меню" });
    await userEvent.hover(trigger);
    expect(trigger.getAttribute("aria-label")).toBe("Закрити меню");
  });

  it("is reachable by keyboard, because a pointer is not the only way in", async () => {
    render(
      <Tooltip>
        <TooltipTrigger
          render={
            <IconButton label="Закрити меню">
              <svg aria-hidden="true" />
            </IconButton>
          }
        />
        <TooltipContent>Закрити меню</TooltipContent>
      </Tooltip>,
    );
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Закрити меню" }),
    );
  });
});
