// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Field } from "./field";
import { SearchInput } from "./search-input";

describe("SearchInput", () => {
  it("is a searchbox inside a plain GET form, with no JavaScript in the way", () => {
    const { container } = render(
      <form method="get" action="/journals">
        <Field label="Пошук">
          <SearchInput name="q" />
        </Field>
      </form>,
    );
    const control = screen.getByRole("searchbox", { name: "Пошук" });
    expect(control.tagName).toBe("INPUT");
    expect(control.getAttribute("type")).toBe("search");
    expect(container.querySelector("form")?.getAttribute("method")).toBe("get");
  });

  it("takes what is typed and submits it as its field", async () => {
    const { container } = render(
      <form method="get" action="/journals">
        <Field label="Пошук">
          <SearchInput name="q" />
        </Field>
      </form>,
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Пошук" }),
      "томат",
    );
    expect(new FormData(container.querySelector("form")!).get("q")).toBe(
      "томат",
    );
  });

  it("does not take input when disabled", async () => {
    render(<SearchInput aria-label="Пошук" name="q" disabled />);
    const control = screen.getByRole("searchbox", { name: "Пошук" });
    expect(control).toHaveProperty("disabled", true);
    await userEvent.type(control, "томат");
    expect(control).toHaveProperty("value", "");
  });
});
