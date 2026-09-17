// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RadioCard } from "./radio-card";

describe("RadioCard", () => {
  it("is a radio whose option carries its own explanation", () => {
    render(
      <RadioCard
        name="visibility"
        value="region"
        title="Регіон"
        description="Показуємо лише область, ніколи точку."
      />,
    );
    const radio = screen.getByRole("radio", { name: /Регіон/ });
    expect(radio.tagName).toBe("INPUT");
    expect(
      screen.getByText("Показуємо лише область, ніколи точку."),
    ).not.toBeNull();
  });

  it("selects from the keyboard and from the whole card", async () => {
    const onChange = vi.fn();
    render(
      <>
        <RadioCard
          name="visibility"
          value="hidden"
          title="Приховано"
          onChange={onChange}
        />
        <RadioCard
          name="visibility"
          value="region"
          title="Регіон"
          onChange={onChange}
        />
      </>,
    );
    screen.getByRole("radio", { name: /Приховано/ }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Регіон/ })).toHaveProperty(
      "checked",
      true,
    );
    await userEvent.click(screen.getByText("Приховано"));
    expect(screen.getByRole("radio", { name: /Приховано/ })).toHaveProperty(
      "checked",
      true,
    );
  });

  it("does not act when disabled", async () => {
    const onChange = vi.fn();
    render(
      <RadioCard
        name="visibility"
        value="region"
        title="Регіон"
        disabled
        onChange={onChange}
      />,
    );
    const radio = screen.getByRole("radio", { name: /Регіон/ });
    expect(radio).toHaveProperty("disabled", true);
    await userEvent.click(radio);
    expect(onChange).not.toHaveBeenCalled();
  });
});
