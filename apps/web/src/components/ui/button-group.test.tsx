// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { ButtonGroup } from "./button-group";

describe("ButtonGroup", () => {
  it("is a named group around its actions", () => {
    render(
      <ButtonGroup label="Entry actions">
        <Button>Publish entry</Button>
        <Button variant="secondary">Discard</Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole("group", { name: "Entry actions" });
    expect(group).not.toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("keeps its members in DOM order under Tab", async () => {
    render(
      <ButtonGroup label="Entry actions">
        <Button>Publish entry</Button>
        <Button variant="secondary">Discard</Button>
      </ButtonGroup>,
    );
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Publish entry" }),
    );
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Discard" }),
    );
  });
});
