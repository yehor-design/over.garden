// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { FileDrop } from "./file-drop";

const photo = () => new File(["x"], "tomato.webp", { type: "image/webp" });

describe("FileDrop", () => {
  it("as a trigger, the input is the ref the caller opens and its name is `label`", () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(
      <FileDrop ref={ref} label="Додати фото" accept="image/webp" />,
    );
    const input = container.querySelector('input[type="file"]');
    expect(input).toBe(ref.current);
    expect(input?.getAttribute("aria-label")).toBe("Додати фото");
    expect(input?.getAttribute("accept")).toBe("image/webp");
  });

  it("hands the caller the files the browser produced, unchanged", async () => {
    const onSelectFiles = vi.fn();
    const onChange = vi.fn();
    const { container } = render(
      <FileDrop
        label="Додати фото"
        onSelectFiles={onSelectFiles}
        onChange={onChange}
      />,
    );
    const file = photo();
    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      file,
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSelectFiles).toHaveBeenCalledWith([file]);
  });

  it("as a zone, the control is a real file input in the tab order", async () => {
    render(<FileDrop presentation="zone" label="Додати фото" hint="WebP" />);
    // A file input has no ARIA role of its own, so the control is found by its
    // label, and the absence of a role is asserted rather than assumed: a zone
    // that quietly became a button would be a different control.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    const input = screen.getByLabelText("Додати фото");
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBe("file");
    expect(screen.getByText("WebP")).not.toBeNull();
    await userEvent.tab();
    expect(document.activeElement).toBe(input);
  });

  it("does not accept a file when disabled", async () => {
    const onSelectFiles = vi.fn();
    render(
      <FileDrop
        presentation="zone"
        label="Додати фото"
        disabled
        onSelectFiles={onSelectFiles}
      />,
    );
    const input = screen.getByLabelText("Додати фото");
    expect(input).toHaveProperty("disabled", true);
    await userEvent.upload(input as HTMLInputElement, photo());
    expect(onSelectFiles).not.toHaveBeenCalled();
  });
});
