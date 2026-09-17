// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Radio, RadioGroup } from "./radio";

describe("RadioGroup", () => {
  it("names the group with its legend and every option with its label", () => {
    render(
      <RadioGroup legend="Видимість місця">
        <Radio
          name="visibility"
          value="hidden"
          label="Приховано"
          defaultChecked
        />
        <Radio name="visibility" value="region" label="Регіон" />
      </RadioGroup>,
    );
    expect(
      screen.getByRole("group", { name: "Видимість місця" }),
    ).not.toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /Приховано/ })).toHaveProperty(
      "checked",
      true,
    );
  });

  it("moves and selects with the arrow keys, the way the platform does", async () => {
    render(
      <RadioGroup legend="Видимість місця">
        <Radio
          name="visibility"
          value="hidden"
          label="Приховано"
          defaultChecked
        />
        <Radio name="visibility" value="region" label="Регіон" />
      </RadioGroup>,
    );
    screen.getByRole("radio", { name: /Приховано/ }).focus();
    await userEvent.keyboard("{ArrowDown}");
    const region = screen.getByRole("radio", { name: /Регіон/ });
    expect(region).toHaveProperty("checked", true);
    expect(document.activeElement).toBe(region);
  });

  it("does not act when disabled", async () => {
    const onChange = vi.fn();
    render(
      <RadioGroup legend="Видимість місця">
        <Radio
          name="visibility"
          value="region"
          label="Регіон"
          disabled
          onChange={onChange}
        />
      </RadioGroup>,
    );
    const radio = screen.getByRole("radio", { name: /Регіон/ });
    expect(radio).toHaveProperty("disabled", true);
    await userEvent.click(radio);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a custom presentation keeps the radio and takes its name from `label`", async () => {
    const onChange = vi.fn();
    render(
      <RadioGroup legend="Аватар">
        <Radio
          presentation="custom"
          name="avatar"
          value="none"
          label="Без аватара"
          onChange={onChange}
        >
          <span aria-hidden="true">🌱</span>
        </Radio>
      </RadioGroup>,
    );
    const radio = screen.getByRole("radio", { name: "Без аватара" });
    expect(radio.tagName).toBe("INPUT");
    await userEvent.click(radio);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
