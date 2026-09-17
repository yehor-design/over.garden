// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("is a real textarea and takes what is typed", async () => {
    render(<Textarea aria-label="Comment" name="body" />);
    const control = screen.getByRole("textbox", { name: "Comment" });
    expect(control.tagName).toBe("TEXTAREA");
    await userEvent.type(control, "Перші сходи");
    expect(control).toHaveProperty("value", "Перші сходи");
  });

  it("does not take input when disabled", async () => {
    render(<Textarea aria-label="Comment" name="body" disabled />);
    const control = screen.getByRole("textbox", { name: "Comment" });
    expect(control).toHaveProperty("disabled", true);
    await userEvent.type(control, "нічого");
    expect(control).toHaveProperty("value", "");
  });
});
