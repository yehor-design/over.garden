// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "./switch";

describe("Switch", () => {
  it("has the switch role and its label as its name", () => {
    render(<Switch name="notifications" label="Сповіщення" />);
    const control = screen.getByRole("switch", { name: /Сповіщення/ });
    expect(control.tagName).toBe("INPUT");
    expect(control).toHaveProperty("checked", false);
  });

  it("toggles with Space", async () => {
    const onChange = vi.fn();
    render(
      <Switch name="notifications" label="Сповіщення" onChange={onChange} />,
    );
    screen.getByRole("switch", { name: /Сповіщення/ }).focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not act when disabled", async () => {
    const onChange = vi.fn();
    render(
      <Switch
        name="notifications"
        label="Сповіщення"
        description="Листи про нові коментарі."
        disabled
        onChange={onChange}
      />,
    );
    const control = screen.getByRole("switch", { name: /Сповіщення/ });
    expect(control).toHaveProperty("disabled", true);
    expect(screen.getByText("Листи про нові коментарі.")).not.toBeNull();
    await userEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });
});
