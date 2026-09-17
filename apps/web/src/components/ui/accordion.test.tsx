// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Accordion, AccordionItem } from "./accordion";

describe("Accordion", () => {
  it("is a disclosure the platform already knows how to operate", () => {
    render(
      <Accordion>
        <AccordionItem title="Коли поливати">
          <p>Коли верхній шар підсох.</p>
        </AccordionItem>
      </Accordion>,
    );
    // `<details>` is a `group`. A browser takes the group's name from its
    // `<summary>`; testing-library does not compute that, so the name is
    // asserted through the summary itself.
    const item = screen.getByRole("group");
    expect(item.tagName).toBe("DETAILS");
    expect(item).toHaveProperty("open", false);
    expect(screen.getByText("Коли поливати").closest("summary")?.tagName).toBe(
      "SUMMARY",
    );
  });

  it("puts the trigger in the tab order and never removes its focus ring", async () => {
    render(
      <Accordion>
        <AccordionItem title="Коли поливати">
          <p>Коли верхній шар підсох.</p>
        </AccordionItem>
      </Accordion>,
    );
    const trigger = screen.getByText("Коли поливати").closest("summary")!;
    await userEvent.tab();
    expect(document.activeElement).toBe(trigger);
    // `outline-none` without an equal replacement is the defect (DESIGN.md §8).
    expect(trigger.className).toContain("focus-visible:outline-2");

    // jsdom does not implement `<summary>` activation, so the open/close
    // behaviour itself is the platform's and is exercised in Chromium by
    // `tests/screen-states.spec.ts`. What is asserted here is that this is a
    // real `<details>` at all — which is the whole reason it works there.
    expect(trigger.closest("details")?.tagName).toBe("DETAILS");
  });

  it("starts open when the page says so", () => {
    render(
      <Accordion>
        <AccordionItem title="Коли поливати" open>
          <p>Коли верхній шар підсох.</p>
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.getByText("Коли поливати").closest("details")).toHaveProperty(
      "open",
      true,
    );
  });
});
