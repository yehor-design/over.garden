// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TOAST_DURATION_MS, Toast, ToastRegion } from "./toast";

describe("Toast", () => {
  it("is a status, never an alert — a routine outcome does not interrupt", () => {
    render(<Toast title="Запис опубліковано" dismissLabel="Закрити" />);
    expect(screen.getByRole("status")).not.toBeNull();
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("lasts five seconds", () => {
    vi.useFakeTimers();
    try {
      const onDismiss = vi.fn();
      render(
        <Toast
          title="Запис опубліковано"
          dismissLabel="Закрити"
          onDismiss={onDismiss}
        />,
      );
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
      expect(onDismiss).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(TOAST_DURATION_MS).toBe(5_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers Undo for a destructive outcome, and closes on request", async () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast
        title="Запис видалено"
        dismissLabel="Закрити"
        onDismiss={onDismiss}
        undo={
          <button type="button" onClick={onUndo}>
            Повернути
          </button>
        }
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Повернути" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("the region is named and lets pointers through between toasts", () => {
    const { container } = render(
      <ToastRegion label="Сповіщення">
        <Toast title="Запис опубліковано" dismissLabel="Закрити" />
      </ToastRegion>,
    );
    const region = container.querySelector('[data-slot="toast-region"]');
    expect(region?.getAttribute("aria-label")).toBe("Сповіщення");
    expect(region?.className).toContain("pointer-events-none");
  });
});
