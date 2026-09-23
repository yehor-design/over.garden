// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActionOutcomeNotice } from "./action-outcome-notice";

describe("ActionOutcomeNotice", () => {
  it("announces a saved outcome politely and takes focus", () => {
    render(
      <ActionOutcomeNotice
        outcome="received"
        about="request-1:submitted"
        tone="success"
        title="Запит отримано"
      >
        Номер запиту — ER-1234.
      </ActionOutcomeNotice>,
    );

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Запит отримано");
    expect(status.textContent).toContain("ER-1234");
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    // The control that was pressed left with what it acted on: focus comes
    // here instead of falling to the document.
    expect(document.activeElement?.getAttribute("data-action-outcome")).toBe(
      "received",
    );
  });

  it("interrupts when nothing was saved", () => {
    render(
      <ActionOutcomeNotice
        outcome="stale"
        about="request-1:handled"
        tone="warning"
        title="Не збережено"
      >
        Цю заявку вже вирішено.
      </ActionOutcomeNotice>,
    );

    expect(screen.getByRole("alert").textContent).toContain("Не збережено");
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("takes focus again when a new outcome arrives in the same place", () => {
    // `OVE-505`: React keeps one notice across outcomes that share a place on
    // the page. "Not sent" became "received" in place, and focus stayed on
    // the document the pressed button had left.
    const outside = document.createElement("button");
    document.body.append(outside);
    const { rerender } = render(
      <ActionOutcomeNotice
        outcome="acknowledgement-required"
        about="not-sent"
        tone="warning"
        title="Запит не надіслано"
      />,
    );
    const notice = document.querySelector("[data-action-outcome]");
    outside.focus();

    rerender(
      <ActionOutcomeNotice
        outcome="received"
        about="request-1:submitted"
        tone="success"
        title="Запит отримано"
      />,
    );
    // The same element, a new outcome — and focus with it.
    expect(document.querySelector("[data-action-outcome]")).toBe(notice);
    expect(document.activeElement).toBe(notice);

    // A second saved action on the same record is a second outcome too.
    outside.focus();
    rerender(
      <ActionOutcomeNotice
        outcome="received"
        about="request-1:reviewing"
        tone="success"
        title="Запит отримано"
      />,
    );
    expect(document.activeElement).toBe(notice);

    // The same outcome rendered again takes nothing from the reader.
    outside.focus();
    rerender(
      <ActionOutcomeNotice
        outcome="received"
        about="request-1:reviewing"
        tone="success"
        title="Запит отримано"
      />,
    );
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
