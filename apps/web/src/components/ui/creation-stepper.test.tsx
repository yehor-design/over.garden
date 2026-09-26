// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { CreationStepper } from "./creation-stepper";

function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [step, setStep] = useState(1);
  return (
    <div>
      <nav aria-label="Сайт">
        <button type="button">Стрічка</button>
      </nav>
      <div>
        <section data-analytics-consent-banner="true" aria-label="Cookies">
          <button type="button">Дозволити</button>
        </section>
      </div>
      <div>
        <CreationStepper
          label="Новий простір"
          step={step}
          total={2}
          progressLabel={`Крок ${step} з 2`}
          question={
            step === 1 ? "Як називається простір?" : "Додайте фото простору"
          }
          closeLabel="Закрити"
          onClose={onClose}
          backLabel="Назад"
          onBack={step === 2 ? () => setStep(1) : undefined}
          primaryLabel={step === 1 ? "Далі" : "Створити"}
          secondary={
            step === 2 ? { label: "Пропустити", onClick: vi.fn() } : undefined
          }
          onSubmit={(event) => {
            event.preventDefault();
            setStep(2);
          }}
        >
          {step === 1 ? (
            <label>
              Назва простору
              <input name="displayName" data-creation-answer="true" />
            </label>
          ) : (
            <button type="button">Додати фото</button>
          )}
        </CreationStepper>
      </div>
    </div>
  );
}

describe("CreationStepper", () => {
  it("asks one question per screen with its progress in words and a named close", () => {
    render(<Harness />);
    expect(screen.getByRole("main", { name: "Новий простір" })).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Як називається простір?",
      }),
    ).toBeTruthy();
    const progress = screen.getByRole("progressbar", { name: "Крок 1 з 2" });
    expect(progress.getAttribute("aria-valuenow")).toBe("1");
    expect(progress.getAttribute("aria-valuemax")).toBe("2");
    expect(screen.getByRole("button", { name: "Закрити" })).toBeTruthy();
    // The first step has nothing to go back to.
    expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
  });

  it("opens on the answer, moves focus to each new question, submits with Enter and offers Back", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const name = screen.getByRole("textbox", { name: "Назва простору" });
    expect(document.activeElement).toBe(name);
    await user.keyboard("Балкон{Enter}");
    // A step change announces where the gardener now is: its question.
    const question = screen.getByRole("heading", {
      level: 1,
      name: "Додайте фото простору",
    });
    expect(document.activeElement).toBe(question);
    expect(
      screen.getByRole("button", { name: "Створити" }).getAttribute("type"),
    ).toBe("submit");
    expect(screen.getByRole("button", { name: "Пропустити" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", {
        level: 1,
        name: "Як називається простір?",
      }),
    );
  });

  it("closes with Escape and the close control, and makes the page behind it inert", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(
      screen.getByRole("navigation", { hidden: true }).closest("[inert]"),
    ).toBeTruthy();
    // The cookie question stays answerable over the frame (ADR-0032 D7).
    expect(
      screen.getByRole("button", { name: "Дозволити" }).closest("[inert]"),
    ).toBeNull();
    await user.click(screen.getByRole("textbox", { name: "Назва простору" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Закрити" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
