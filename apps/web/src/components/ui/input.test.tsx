// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("is a real input and takes what is typed", async () => {
    render(<Input aria-label="Handle" name="handle" />);
    const control = screen.getByRole("textbox", { name: "Handle" });
    expect(control.tagName).toBe("INPUT");
    await userEvent.type(control, "olena");
    expect(control).toHaveProperty("value", "olena");
  });

  it("does not take input when disabled", async () => {
    render(<Input aria-label="Handle" name="handle" disabled />);
    const control = screen.getByRole("textbox", { name: "Handle" });
    expect(control).toHaveProperty("disabled", true);
    await userEvent.type(control, "olena");
    expect(control).toHaveProperty("value", "");
  });

  it("spreads arbitrary attributes onto the real element", () => {
    render(
      <Input
        aria-label="Handle"
        name="handle"
        data-probe="yes"
        autoComplete="username"
        maxLength={30}
      />,
    );
    const control = screen.getByRole("textbox", { name: "Handle" });
    expect(control.getAttribute("data-probe")).toBe("yes");
    expect(control.getAttribute("autocomplete")).toBe("username");
    expect(control.getAttribute("maxlength")).toBe("30");
  });

  it("forwards a ref to the element that takes focus", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input aria-label="Handle" ref={ref} />);
    ref.current?.focus();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Handle" }),
    );
  });
});
