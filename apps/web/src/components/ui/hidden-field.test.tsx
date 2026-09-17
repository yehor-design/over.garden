// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HiddenField } from "./hidden-field";

describe("HiddenField", () => {
  it("carries a form value and no role at all", () => {
    const { container } = render(
      <form>
        <HiddenField name="returnTo" value="/journals" />
      </form>,
    );
    const field = container.querySelector('input[name="returnTo"]');
    expect(field?.getAttribute("type")).toBe("hidden");
    expect(field).toHaveProperty("value", "/journals");
    // A hidden input is data, not a control: it reaches the accessibility
    // tree with no role at all, under any name.
    for (const role of ["textbox", "button", "checkbox", "combobox"] as const) {
      expect(screen.queryAllByRole(role, { name: /./u })).toHaveLength(0);
    }
    expect(new FormData(container.querySelector("form")!).get("returnTo")).toBe(
      "/journals",
    );
  });
});
