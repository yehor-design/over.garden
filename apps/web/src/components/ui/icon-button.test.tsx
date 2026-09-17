// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { IconButton } from "./icon-button";

function Glyph() {
  return <svg data-testid="glyph" aria-hidden="true" />;
}

describe("IconButton", () => {
  it("takes its accessible name from `label`, never from the icon", () => {
    render(
      <IconButton label="Close menu">
        <Glyph />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Close menu" });
    expect(button.tagName).toBe("BUTTON");
    expect(screen.getByTestId("glyph").closest("[aria-hidden]")).not.toBeNull();
  });

  it("is operated by Enter and by Space", async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Close menu" onClick={onClick}>
        <Glyph />
      </IconButton>,
    );
    screen.getByRole("button", { name: "Close menu" }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does not act when disabled", async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Close menu" disabled onClick={onClick}>
        <Glyph />
      </IconButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("marks itself busy while loading and keeps its name", () => {
    render(
      <IconButton label="Close menu" loading>
        <Glyph />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Close menu" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull();
  });
});
