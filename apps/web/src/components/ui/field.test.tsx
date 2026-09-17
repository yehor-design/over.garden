// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Field } from "./field";
import { Input } from "./input";

describe("Field", () => {
  it("binds a visible label to the control it wraps", () => {
    render(
      <Field label="Електронна пошта">
        <Input name="email" type="email" />
      </Field>,
    );
    const control = screen.getByRole("textbox", { name: "Електронна пошта" });
    expect(control.id).toBe("field-email");
    expect(screen.getByText("Електронна пошта").closest("label")?.htmlFor).toBe(
      "field-email",
    );
  });

  it("reaches the description through aria-describedby", () => {
    render(
      <Field label="Handle" description="Lowercase letters and digits.">
        <Input name="handle" />
      </Field>,
    );
    const control = screen.getByRole("textbox", { name: "Handle" });
    expect(control.getAttribute("aria-describedby")).toBe(
      "field-handle-description",
    );
    expect(
      document.getElementById("field-handle-description")?.textContent,
    ).toBe("Lowercase letters and digits.");
  });

  it("an error both invalidates the control and joins its description", () => {
    render(
      <Field
        label="Handle"
        description="Lowercase."
        error="That name is taken."
      >
        <Input name="handle" />
      </Field>,
    );
    const control = screen.getByRole("textbox", { name: "Handle" });
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toBe(
      "field-handle-description field-handle-error",
    );
    expect(document.getElementById("field-handle-error")?.textContent).toBe(
      "That name is taken.",
    );
  });

  it("keeps a describedby the control already had", () => {
    render(
      <Field label="Handle" description="Lowercase.">
        <Input name="handle" aria-describedby="handle-status" />
      </Field>,
    );
    expect(
      screen
        .getByRole("textbox", { name: "Handle" })
        .getAttribute("aria-describedby"),
    ).toBe("handle-status field-handle-description");
  });

  it("marks the control required and renders the caller's own mark", () => {
    render(
      <Field label="Handle" required mark="обов'язково">
        <Input name="handle" />
      </Field>,
    );
    const control = screen.getByRole("textbox", { name: /Handle/ });
    expect(control).toHaveProperty("required", true);
    expect(screen.getByText("обов'язково")).not.toBeNull();
  });

  it("clicking the label focuses the control", async () => {
    render(
      <Field label="Handle">
        <Input name="handle" />
      </Field>,
    );
    await userEvent.click(screen.getByText("Handle"));
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Handle" }),
    );
  });

  it("refuses to render a control it cannot name", () => {
    // A silent unlabelled control is the defect this component exists to end,
    // so the failure is loud rather than invisible.
    expect(() =>
      render(
        <Field label="Handle">
          <Input />
        </Field>,
      ),
    ).toThrow(/Field needs an id/);
  });
});
