// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  EngagementCommentState,
  EngagementLikeState,
} from "./engagement-actions";
import { EngagementCommentForm } from "./engagement-controls";

const labels = {
  field: "Коментар",
  action: "Коментар",
  sending: "Надсилаємо…",
  unavailable: "Дію тимчасово не вдалося виконати.",
  rateLimited: "Забагато коментарів.",
  signInRequired: "Увійдіть.",
};

function renderForm(
  submit: (
    previous: EngagementCommentState,
    formData: FormData,
  ) => Promise<EngagementCommentState>,
) {
  return render(
    <EngagementCommentForm
      targetKind="journal_entry"
      targetRef="entry-1"
      clientMutationId="mutation-1"
      replyTarget="Відповідь для Олени"
      labels={labels}
      submit={submit}
    />,
  );
}

describe("the comment form (OVE-493)", () => {
  it("keeps every word when the server refuses, and says why", async () => {
    const refusal: EngagementCommentState = {
      submitted: false,
      failure: "unavailable",
    };
    const submit =
      vi.fn<
        (
          previous: EngagementCommentState,
          formData: FormData,
        ) => Promise<EngagementCommentState>
      >();
    submit.mockResolvedValue(refusal);
    renderForm(submit);
    const field = screen.getByRole("textbox", { name: "Коментар" });
    await userEvent.type(field, "Листя пожовкло знизу");
    await userEvent.click(screen.getByRole("button", { name: "Коментар" }));

    expect(await screen.findByText(labels.unavailable)).toBeTruthy();
    expect((field as HTMLTextAreaElement).value).toBe("Листя пожовкло знизу");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[1].get("body")).toBe("Листя пожовкло знизу");
  });

  it("empties itself only when the server says the comment landed", async () => {
    const submit = vi.fn(async () => ({ submitted: true, failure: null }));
    renderForm(submit);
    const field = screen.getByRole("textbox", { name: "Коментар" });
    await userEvent.type(field, "Дякую за пораду");
    await userEvent.click(screen.getByRole("button", { name: "Коментар" }));

    await vi.waitFor(() =>
      expect((field as HTMLTextAreaElement).value).toBe(""),
    );
    expect(screen.queryByText(labels.unavailable)).toBeNull();
    // The next comment is typed into the same field, and stays.
    await userEvent.type(field, "І ще одне");
    expect((field as HTMLTextAreaElement).value).toBe("І ще одне");
  });

  it("sends one request for a double press, and says it is sending", async () => {
    let answer: (state: EngagementCommentState) => void = () => undefined;
    const submit = vi.fn(
      () =>
        new Promise<EngagementCommentState>((resolve) => {
          answer = resolve;
        }),
    );
    renderForm(submit);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Коментар" }),
      "Раз",
    );
    const button = screen.getByRole("button", { name: "Коментар" });
    await userEvent.click(button);
    await screen.findByRole("button", { name: "Надсилаємо…" });
    await userEvent.click(screen.getByRole("button", { name: "Надсилаємо…" }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("button", { name: "Надсилаємо…" })
        .getAttribute("aria-busy"),
    ).toBe("true");

    await act(async () => answer({ submitted: true, failure: null }));
    expect(
      await screen.findByRole("button", { name: "Коментар" }),
    ).toBeTruthy();
  });

  it("says whom a reply answers before it is written", () => {
    renderForm(vi.fn());
    expect(screen.getByText("Відповідь для Олени")).toBeTruthy();
  });

  // OVE-493, criterion 4: a request that never reached the server is answered
  // in place — the words stay, the reason is said — instead of the locale's
  // error page replacing the whole entry.
  it("keeps the words and says so when the request never reaches the server", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const submit =
      vi.fn<
        (
          previous: EngagementCommentState,
          formData: FormData,
        ) => Promise<EngagementCommentState>
      >();
    submit.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderForm(submit);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Коментар" }),
      "Без зв'язку",
    );
    await userEvent.click(screen.getByRole("button", { name: "Коментар" }));

    expect(await screen.findByText(labels.unavailable)).toBeTruthy();
    expect(
      (screen.getByRole("textbox", { name: "Коментар" }) as HTMLTextAreaElement)
        .value,
    ).toBe("Без зв'язку");
    errors.mockRestore();
  });
});

describe("the like control (OVE-493)", () => {
  it("comes back showing what the server last said when a request is lost", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { EngagementLikeControl } = await import("./engagement-controls");
    const toggle =
      vi.fn<
        (
          previous: EngagementLikeState,
          formData: FormData,
        ) => Promise<EngagementLikeState>
      >();
    toggle.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(
      <EngagementLikeControl
        targetKind="journal_entry"
        targetRef="entry-1"
        initialLiked={false}
        initialCount={4}
        locale="uk"
        labels={{
          like: "Подобається",
          liked: "Вподобано",
          unavailable: labels.unavailable,
          rateLimited: labels.rateLimited,
        }}
        toggle={toggle}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Подобається/u }));

    expect(await screen.findByText(labels.unavailable)).toBeTruthy();
    const button = screen.getByRole("button", { name: /Подобається/u });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toContain("4");
    errors.mockRestore();
  });
});
