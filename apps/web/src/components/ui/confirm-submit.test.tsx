// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmSubmit } from "./confirm-submit";

function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  return (
    <form
      id="erase"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <ConfirmSubmit
        formId="erase"
        label="Виконати видалення"
        title="Видалити дані запиту ER-1A2B3C4?"
        description="Це незворотно. Публічні сторінки відповідатимуть 410 сім днів, потім зникнуть."
        confirmLabel="Видалити назавжди"
        cancelLabel="Скасувати"
      />
    </form>
  );
}

/** The same control on a form whose action is still on its way. */
function PendingHarness({ action }: { action: () => Promise<void> }) {
  return (
    <form id="erase" action={action}>
      <ConfirmSubmit
        formId="erase"
        label="Виконати видалення"
        pendingLabel="Видаляємо…"
        title="Видалити дані запиту ER-1A2B3C4?"
        description="Це незворотно. Публічні сторінки відповідатимуть 410 сім днів, потім зникнуть."
        confirmLabel="Видалити назавжди"
        cancelLabel="Скасувати"
      />
    </form>
  );
}

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

describe("ConfirmSubmit", () => {
  it("is a submit control before anything opens", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", {
      name: "Виконати видалення",
    });
    // The shape that makes the no-JavaScript path work: a real submit button
    // inside the form, not a button that becomes one on hydration.
    expect(trigger.getAttribute("type")).toBe("submit");
    expect(trigger.getAttribute("form")).toBe("erase");
    expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
  });

  it("asks before it submits, naming the object and the consequence", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Виконати видалення" }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Видалити дані запиту ER-1A2B3C4?",
    });
    expect(dialog.textContent).toContain("410");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the named form from the dialog, and not from Cancel", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Виконати видалення" }),
    );
    await screen.findByRole("alertdialog");

    await userEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Виконати видалення" }),
    );
    await screen.findByRole("alertdialog");
    const confirm = screen.getByRole("button", { name: "Видалити назавжди" });
    expect(confirm.getAttribute("form")).toBe("erase");
    expect(confirm.className).toContain("bg-danger-fill");
    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits once for one confirmation, however often Confirm is pressed (OVE-500)", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const trigger = screen.getByRole("button", { name: "Виконати видалення" });
    await userEvent.click(trigger);
    await screen.findByRole("alertdialog");
    const confirm = screen.getByRole("button", { name: "Видалити назавжди" });
    expect(confirm.getAttribute("data-confirm-submit-confirm")).toBe("erase");

    // Two presses inside one opening, before the dialog has closed — a double
    // click, or a key held down — are one answer to one question.
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Once the submission has started the question is answered and closes.
    await waitFor(() => {
      expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
    });

    // Asking again is a new question, and its confirmation submits again.
    await userEvent.click(trigger);
    await screen.findByRole("alertdialog");
    await userEvent.click(
      screen.getByRole("button", { name: "Видалити назавжди" }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  /**
   * The dialog closing is a state change inside the form while its action is
   * on its way, and react-dom 19.2 reads the form's status as idle in any
   * component it re-renders then. When the dialog's state lived beside the
   * trigger, the trigger forgot it was pending as the dialog closed: a second
   * press asked again, and a second Confirm posted the same change twice.
   */
  it("says the form is on its way, and asks nothing more, until it settles (OVE-500)", async () => {
    const submission = deferred();
    const action = vi.fn(() => submission.promise);
    render(<PendingHarness action={action} />);
    const trigger = screen.getByRole("button", { name: "Виконати видалення" });
    await userEvent.click(trigger);
    await screen.findByRole("alertdialog");
    await userEvent.click(
      screen.getByRole("button", { name: "Видалити назавжди" }),
    );
    expect(action).toHaveBeenCalledTimes(1);

    // The question closes once the submission has started — and the trigger
    // still says the form is on its way after it has.
    await waitFor(() => {
      expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
    });
    const pending = screen.getByRole("button", { name: "Видаляємо…" });
    expect(pending).toBe(trigger);
    expect(pending.getAttribute("aria-disabled")).toBe("true");
    expect(pending.getAttribute("data-pending")).toBe("true");
    // `aria-disabled`, never `disabled`: the reader keeps their place.
    expect(pending).toHaveProperty("disabled", false);

    // A press while the first submission is on its way asks nothing and
    // posts nothing.
    await userEvent.click(pending);
    expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
    expect(action).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("button", { name: "Видаляємо…" })
        .getAttribute("aria-disabled"),
    ).toBe("true");

    await act(async () => {
      submission.resolve();
      await submission.promise;
    });
    // Settled, it is the same control again, and the answered question does
    // not come back.
    expect(
      await screen.findByRole("button", { name: "Виконати видалення" }),
    ).toBe(trigger);
    expect(trigger.hasAttribute("aria-disabled")).toBe(false);
    expect(trigger.hasAttribute("data-pending")).toBe(false);
    expect(screen.queryAllByRole("alertdialog")).toHaveLength(0);
    expect(action).toHaveBeenCalledTimes(1);

    // And it asks again, as a new question.
    await userEvent.click(trigger);
    expect(
      await screen.findByRole("alertdialog", {
        name: "Видалити дані запиту ER-1A2B3C4?",
      }),
    ).toBeTruthy();
  });
});
