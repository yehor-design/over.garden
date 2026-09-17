// @vitest-environment jsdom
import { render } from "@testing-library/react";
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
    // A hidden input is data, not a control: it has no accessible role.
    expect(container.querySelectorAll("[role]")).toHaveLength(0);
    expect(new FormData(container.querySelector("form")!).get("returnTo")).toBe(
      "/journals",
    );
  });
});
