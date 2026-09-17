// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("is a native checkbox named by its visible label", () => {
    render(<Checkbox name="accepted" label="Я погоджуюсь" />);
    const control = screen.getByRole("checkbox", { name: /Я погоджуюсь/ });
    expect(control.tagName).toBe("INPUT");
    expect(control).toHaveProperty("checked", false);
  });

  it("toggles with Space and with a click on the label", async () => {
    const onChange = vi.fn();
    render(
      <Checkbox name="accepted" label="Я погоджуюсь" onChange={onChange} />,
    );
    const control = screen.getByRole("checkbox", { name: /Я погоджуюсь/ });
    control.focus();
    await userEvent.keyboard(" ");
    await userEvent.click(screen.getByText("Я погоджуюсь"));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("reaches its description and does not act when disabled", async () => {
    const onChange = vi.fn();
    render(
      <Checkbox
        name="accepted"
        label="Я погоджуюсь"
        description="Запис стане публічним."
        disabled
        onChange={onChange}
      />,
    );
    const control = screen.getByRole("checkbox", { name: /Я погоджуюсь/ });
    expect(control).toHaveProperty("disabled", true);
    expect(screen.getByText("Запис стане публічним.")).not.toBeNull();
    await userEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });
});
