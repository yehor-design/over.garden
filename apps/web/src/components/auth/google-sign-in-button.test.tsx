// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GoogleSignInButton } from "./google-sign-in-button";

describe("GoogleSignInButton", () => {
  it("is a submit button whose name is its permitted wording", () => {
    render(<GoogleSignInButton label="Продовжити через Google" />);
    const button = screen.getByRole("button", {
      name: "Продовжити через Google",
    });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveProperty("type", "submit");
  });

  it("carries the mark, in four colours, hidden from the accessibility tree", () => {
    // Google's identity guidelines require the mark on any button that starts
    // a Google sign-in. What shipped before this was a bordered button with
    // the words alone, which their terms do not permit.
    const { container } = render(
      <GoogleSignInButton label="Продовжити через Google" />,
    );
    const mark = container.querySelector('[data-google-mark="true"]');
    expect(mark).toBeTruthy();
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    const fills = [...(mark?.querySelectorAll("path") ?? [])].map((path) =>
      path.getAttribute("fill"),
    );
    expect(fills).toEqual(["#4285F4", "#34A853", "#FBBC05", "#EA4335"]);
    // The name comes from the text alone: a reader hearing "Google" twice
    // learns nothing the second time.
    expect(
      screen.getByRole("button", { name: "Продовжити через Google" })
        .textContent,
    ).toBe("Продовжити через Google");
  });

  it("keeps the mark above Google's floor and the button above 40 px", () => {
    render(<GoogleSignInButton label="Продовжити через Google" />);
    // Read from the classes, because jsdom computes no layout: `md` is 40 px
    // (DESIGN.md §4.3) and the mark is 18 px. The mark's size is set **on the
    // button**, because `Button`'s own `[&_svg]:size-4` is a descendant rule
    // that outranks a class on the svg itself and silently shrank the mark to
    // 16 px. `tests/auth-screen.spec.ts` measures the rendered box, which is
    // what found it.
    const button = screen.getByRole("button");
    expect(button.className).toContain("min-h-10");
    expect(button.className).toContain("[&_svg]:size-4.5");
    expect(button.className).not.toContain("[&_svg]:size-4 ");
  });

  it("does not translate or abbreviate the provider's name", () => {
    // The label arrives already formatted, so the provider's name comes from
    // one place and is never localised.
    render(<GoogleSignInButton label="Продължаване с Google" />);
    expect(screen.getByRole("button").textContent).toContain("Google");
  });
});
