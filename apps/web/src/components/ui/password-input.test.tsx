// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("is a password field with a named show control", () => {
    render(
      <PasswordInput
        name="password"
        showLabel="Показати пароль"
        hideLabel="Сховати пароль"
      />,
    );
    const field = screen.getByLabelText("Показати пароль");
    expect(field.tagName).toBe("BUTTON");
    expect(
      document.querySelector<HTMLInputElement>('input[name="password"]')?.type,
    ).toBe("password");
  });

  it("renames the control when it changes what it does", async () => {
    // The point of the criterion: a control whose name never changes leaves a
    // screen-reader user pressing a button whose effect they cannot hear.
    render(
      <PasswordInput
        name="password"
        showLabel="Показати пароль"
        hideLabel="Сховати пароль"
      />,
    );
    const input = document.querySelector<HTMLInputElement>(
      'input[name="password"]',
    )!;

    await userEvent.click(screen.getByRole("button", { name: "Показати пароль" }));
    expect(input.type).toBe("text");
    expect(
      screen.getByRole("button", { name: "Сховати пароль" }),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Сховати пароль" }));
    expect(input.type).toBe("password");
  });

  it("points the control at the field it governs", () => {
    render(
      <PasswordInput
        name="password"
        showLabel="Показати пароль"
        hideLabel="Сховати пароль"
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Показати пароль" })
        .getAttribute("aria-controls"),
    ).toBe("field-password");
  });

  it("keeps the autocomplete and the constraints it was given", () => {
    render(
      <PasswordInput
        name="password"
        autoComplete="current-password"
        minLength={8}
        required
        showLabel="Показати пароль"
        hideLabel="Сховати пароль"
      />,
    );
    const input = document.querySelector<HTMLInputElement>(
      'input[name="password"]',
    )!;
    expect(input.autocomplete).toBe("current-password");
    expect(input.minLength).toBe(8);
    expect(input.required).toBe(true);
  });
});
