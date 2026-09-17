// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Fieldset } from "./fieldset";
import { Field } from "./field";
import { Input } from "./input";

describe("Fieldset", () => {
  it("names the group and reaches every control inside it", () => {
    render(
      <Fieldset legend="Місце" description="Точна координата не публікується.">
        <Field label="Область">
          <Input name="region" />
        </Field>
      </Fieldset>,
    );
    expect(screen.getByRole("group", { name: "Місце" })).not.toBeNull();
    expect(
      screen.getByText("Точна координата не публікується."),
    ).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Область" })).not.toBeNull();
  });

  it("disables every control inside it at once", () => {
    render(
      <Fieldset legend="Місце" disabled>
        <Field label="Область">
          <Input name="region" />
        </Field>
      </Fieldset>,
    );
    // A browser disables every descendant control through the fieldset's own
    // `disabled`; jsdom does not reflect that onto the child's IDL property, so
    // the assertion is about the boundary that carries it. `tests/accessibility`
    // exercises the real behaviour in Chromium.
    const control = screen.getByRole("textbox", { name: "Область" });
    expect(control.closest("fieldset")).toHaveProperty("disabled", true);
  });
});
