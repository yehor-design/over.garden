// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("is a real button with its label as its accessible name", () => {
    render(<Button>Publish entry</Button>);
    const button = screen.getByRole("button", { name: "Publish entry" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveProperty("type", "button");
  });

  it("is operated by Enter and by Space", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Publish entry</Button>);
    screen.getByRole("button", { name: "Publish entry" }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does not act or take focus when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Publish entry
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Publish entry" });
    expect(button).toHaveProperty("disabled", true);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its label, its width and its focus while loading", async () => {
    const { rerender } = render(<Button>Publish entry</Button>);
    const button = screen.getByRole("button", { name: "Publish entry" });
    button.focus();
    rerender(<Button loading>Publish entry</Button>);

    // The name survives: `opacity-0`, never `visibility: hidden`, which would
    // take the button out of the accessibility tree exactly when it is busy.
    expect(screen.getByRole("button", { name: "Publish entry" })).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(button);
    expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull();
  });

  it("submits a form when asked to, and never by accident", () => {
    const { rerender } = render(<Button>Publish entry</Button>);
    expect(screen.getByRole("button")).toHaveProperty("type", "button");
    rerender(<Button type="submit">Publish entry</Button>);
    expect(screen.getByRole("button")).toHaveProperty("type", "submit");
  });

  it("keeps its fill colour and its type step, which `cn` once merged away", () => {
    // `tailwind-merge` put a named size and a named colour in the same group,
    // so `text-body-sm` deleted `text-text-on-fill` and every filled button drew
    // body ink on a green fill. Found by an axe scan of the real stylesheet.
    render(<Button variant="primary">Publish entry</Button>);
    const className = screen.getByRole("button").className;
    expect(className).toContain("text-text-on-fill");
    expect(className).toContain("bg-action");
    expect(className).toContain("text-body-sm");
  });

  it("carries each of the five variants and three sizes", () => {
    for (const variant of [
      "primary",
      "secondary",
      "subtle",
      "ghost",
      "danger",
    ] as const) {
      const { unmount } = render(<Button variant={variant}>Save</Button>);
      expect(screen.getByRole("button", { name: "Save" })).not.toBeNull();
      unmount();
    }
    for (const size of ["sm", "md", "lg"] as const) {
      const { unmount } = render(<Button size={size}>Save</Button>);
      expect(screen.getByRole("button", { name: "Save" })).not.toBeNull();
      unmount();
    }
  });
});
