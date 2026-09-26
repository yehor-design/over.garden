// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { clampCrop, coverGeometry, PhotoCropEditor } from "./photo-crop-editor";

const COPY = {
  frameLabel: "Кадр фото",
  frameHint: "Перетягніть фото в кадрі.",
  rotate: "Повернути",
  reset: "Скинути",
  zoom: "Масштаб",
  cancel: "Скасувати",
  done: "Готово",
  preparing: "Готуємо фото…",
  unreadable: "Це фото не вдалося відкрити.",
};

describe("PhotoCropEditor geometry", () => {
  const natural = { width: 4000, height: 3000 };
  const frame = { width: 320, height: 180 };

  it("covers the frame at zoom 1, and lets the photo move only as far as it overhangs", () => {
    const geometry = coverGeometry(natural, frame, { turns: 0, zoom: 1 });
    expect(geometry.scale).toBeCloseTo(0.08);
    expect(geometry.maxX).toBeCloseTo(0);
    expect(geometry.maxY).toBeCloseTo((3000 * 0.08 - 180) / 2);
    const clamped = clampCrop({ turns: 0, zoom: 1, x: 500, y: -500 }, natural, frame);
    expect(clamped.x).toBeCloseTo(0);
    expect(clamped.y).toBeCloseTo(-geometry.maxY);
  });

  it("turns a quarter at a time and keeps the zoom within bounds", () => {
    const turned = coverGeometry(natural, frame, { turns: 1, zoom: 1 });
    // On its side the photo is 3000 wide and 4000 high.
    expect(turned.scale).toBeCloseTo(320 / 3000);
    const clamped = clampCrop({ turns: 5, zoom: 9, x: 0, y: 0 }, natural, frame);
    expect(clamped.turns).toBe(1);
    expect(clamped.zoom).toBe(4);
  });
});

describe("PhotoCropEditor", () => {
  it("names its frame and every control, and waits for the photo before Готово", () => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    URL.createObjectURL = vi.fn(() => "blob:photo");
    URL.revokeObjectURL = vi.fn();
    const onCancel = vi.fn();
    render(
      <PhotoCropEditor
        file={new Blob(["x"], { type: "image/jpeg" })}
        aspect={16 / 9}
        copy={COPY}
        onDone={vi.fn()}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole("group", { name: "Кадр фото" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Масштаб" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Повернути" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Готово" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    // Escape is the editor's own Cancel, and goes no further.
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    screen.getByRole("group", { name: "Кадр фото" }).dispatchEvent(escape);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(escape.defaultPrevented).toBe(true);
  });
});
