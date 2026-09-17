// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Spinner } from "./spinner";

describe("Spinner", () => {
  it("says nothing of its own: whatever is busy owns the announcement", () => {
    render(
      <button type="button" aria-busy="true">
        Publish entry
        <Spinner />
      </button>,
    );
    const button = screen.getByRole("button", { name: "Publish entry" });
    const spinner = button.querySelector('[data-slot="spinner"]');
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });
});
