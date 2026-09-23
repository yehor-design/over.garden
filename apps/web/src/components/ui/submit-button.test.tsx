// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubmitButton } from "./submit-button";

/** Every submission a test holds open. */
const held = new Set<() => void>();

/** A promise the test settles, so a form stays pending as long as it needs. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  held.add(resolve);
  return { promise, resolve };
}

afterEach(() => {
  // A form action left pending holds every later transition in this file —
  // React entangles them with it — so each one settles when its test ends,
  // even a test that failed before it settled its own.
  for (const settle of held) settle();
  held.clear();
});

function Harness({
  action,
  onClick,
}: {
  action: () => Promise<void>;
  onClick?: () => void;
}) {
  return (
    <form action={action}>
      <SubmitButton pendingLabel="Зберігаємо…" onClick={onClick}>
        Зберегти
      </SubmitButton>
    </form>
  );
}

describe("SubmitButton", () => {
  it("is a real submit button, named by its label, before anything is pending", () => {
    render(
      <form>
        <SubmitButton pendingLabel="Зберігаємо…">Зберегти</SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Зберегти" });
    // Before the bundle runs it posts like any other submit button.
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    expect(button.hasAttribute("data-pending")).toBe(false);
    expect(screen.queryByRole("button", { name: "Зберігаємо…" })).toBeNull();
  });

  it("refuses a second press while its form is on its way, and keeps the reader's place", async () => {
    const submission = deferred();
    const action = vi.fn(() => submission.promise);
    const onClick = vi.fn();
    render(<Harness action={action} onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Зберегти" });
    await userEvent.click(button);

    // The same button, saying that something is happening.
    const pending = await screen.findByRole("button", { name: "Зберігаємо…" });
    expect(pending).toBe(button);
    expect(pending.getAttribute("aria-disabled")).toBe("true");
    expect(pending.getAttribute("data-pending")).toBe("true");
    // `aria-disabled`, never `disabled`: a disabled button drops focus to the
    // document, and the reader who pressed it would lose their place.
    expect(pending).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(pending);

    // A second press — by pointer or by Enter — posts nothing.
    await userEvent.click(pending);
    await userEvent.keyboard("{Enter}");
    expect(action).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);

    await act(async () => {
      submission.resolve();
      await submission.promise;
    });
    const settled = await screen.findByRole("button", { name: "Зберегти" });
    expect(settled.hasAttribute("aria-disabled")).toBe(false);

    // Settled, it is a submit button again.
    await userEvent.click(settled);
    expect(action).toHaveBeenCalledTimes(2);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("keeps its own label while pending when it has no pending label", async () => {
    const submission = deferred();
    render(
      <form action={() => submission.promise}>
        <SubmitButton>Приєднатися</SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Приєднатися" });
    await userEvent.click(button);

    await waitFor(() => {
      expect(button.getAttribute("aria-disabled")).toBe("true");
    });
    expect(screen.getByRole("button", { name: "Приєднатися" })).toBe(button);

    await act(async () => {
      submission.resolve();
      await submission.promise;
    });
  });
});
