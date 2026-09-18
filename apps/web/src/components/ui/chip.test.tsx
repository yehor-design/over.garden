// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Chip, FilterChip, ToggleChip } from "./chip";

describe("Chip", () => {
  it("names what the remove control removes, not just 'remove'", async () => {
    const onRemove = vi.fn();
    render(
      <Chip
        label="Томати"
        onRemove={onRemove}
        removeLabel="Прибрати фільтр: томати"
      />,
    );
    const remove = screen.getByRole("button", {
      name: "Прибрати фільтр: томати",
    });
    await userEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("is a plain label when nothing can remove it", () => {
    render(<Chip label="Томати" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("FilterChip", () => {
  it("is a real checkbox, so a filter bar submits without JavaScript", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <form>
        <FilterChip
          name="kind"
          value="plant"
          label="Рослини"
          count={12}
          onChange={onChange}
        />
      </form>,
    );
    const control = screen.getByRole("checkbox", { name: /Рослини/ });
    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(control).toHaveProperty("checked", true);
    expect(new FormData(container.querySelector("form")!).get("kind")).toBe(
      "plant",
    );
  });

  it("does not toggle when disabled", async () => {
    const onChange = vi.fn();
    render(
      <FilterChip name="kind" label="Рослини" disabled onChange={onChange} />,
    );
    const control = screen.getByRole("checkbox", { name: /Рослини/ });
    expect(control).toHaveProperty("disabled", true);
    await userEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ToggleChip", () => {
  it("states whether the filter is on, on a control where aria-pressed is valid", () => {
    render(
      <form action="/" method="get">
        <ToggleChip name="kind" value="plant" label="Рослини" pressed={false} />
        <ToggleChip name="kind" value="animal" label="Тварини" pressed />
      </form>,
    );

    expect(
      screen
        .getByRole("button", { name: /Рослини/u })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: /Тварини/u })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("submits the form it sits in, so the filter works before hydration", () => {
    render(
      <form action="/" method="get">
        <ToggleChip name="kind" value="plant" label="Рослини" pressed={false} />
      </form>,
    );

    // A submit button inside a GET form is the browser's own mechanism: no
    // click handler, no bundle, and the filter lands in the URL.
    const chip = screen.getByRole("button", { name: /Рослини/u });
    expect(chip.getAttribute("type")).toBe("submit");
  });

  it("turns a filter off by contributing no value at all", () => {
    // The chip that is already on carries no `name`, so pressing it submits
    // the form without the parameter — which is how "all" is expressed.
    render(
      <form action="/" method="get">
        <ToggleChip label="Останні" pressed />
      </form>,
    );

    expect(
      screen.getByRole("button", { name: "Останні" }).getAttribute("name"),
    ).toBeNull();
  });
});
