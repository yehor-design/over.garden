"use client";

import { useEffect, useId, useRef, useState } from "react";

import { XIcon } from "@/components/icons/X";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ProgressBar } from "@/components/ui/progress-bar";

/**
 * The frame of a creation stepper (DESIGN.md §5.24, ADR-0035 D1): one question
 * per screen over the whole viewport, a close control and «Крок N з M» at the
 * top, «Назад» and the step's own button at the bottom. Airbnb's listing flow
 * and Typeform's one-question screens, drawn in Threads' type, spacing and
 * controls.
 *
 * - The step is a form: Enter submits it, and the primary button is its
 *   submit. Given a Server Action as `formAction`, the form posts without
 *   JavaScript too, so a stepper's first step can work before hydration.
 * - Focus: the first step opens with its answer focused (the control marked
 *   `data-creation-answer`), so typing can start at once; every later step
 *   change moves focus to the new question, so a screen reader announces
 *   where the gardener now is (OVE-523).
 * - Escape and the close control call `onClose`; asking before discarding
 *   answers is the owner's (the frame cannot know what was typed).
 * - While it is open, everything outside it is `inert`: the site's header,
 *   rails and footer are under it and must not be reachable by Tab.
 * - The frame follows the visual viewport, so on a phone with the keyboard
 *   open the primary button sits above the keyboard, not behind it.
 */
export interface CreationStepperProps {
  /** The flow's name, for the landmark: «Новий простір». */
  label: string;
  step: number;
  total: number;
  /** «Крок 1 з 2», already formatted. */
  progressLabel: string;
  question: string;
  description?: React.ReactNode;
  closeLabel: string;
  onClose: () => void;
  backLabel: string;
  /** Absent on the first step. */
  onBack?: () => void;
  primaryLabel: string;
  primaryPending?: boolean;
  primaryDisabled?: boolean;
  secondary?: { label: string; onClick: () => void; disabled?: boolean };
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /**
   * The no-JavaScript endpoint: the `formAction` `useActionState` derived from
   * a Server Action, never a closure (ADR-0024 D3).
   */
  endpoint?: (formData: FormData) => void | Promise<void>;
  /** Hidden fields and anything the no-JavaScript post needs. */
  formFields?: React.ReactNode;
  /** A message under the question's controls: an error, a notice. */
  status?: React.ReactNode;
  children: React.ReactNode;
}

function CreationStepper({
  label,
  step,
  total,
  progressLabel,
  question,
  description,
  closeLabel,
  onClose,
  backLabel,
  onBack,
  primaryLabel,
  primaryPending = false,
  primaryDisabled = false,
  secondary,
  onSubmit,
  endpoint,
  formFields,
  status,
  children,
}: CreationStepperProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [viewport, setViewport] = useState<{
    height: number;
    top: number;
  } | null>(null);

  // The first step's answer on opening; the question on every change after.
  const focusedStep = useRef<number | null>(null);
  useEffect(() => {
    if (focusedStep.current === step) return;
    const opening = focusedStep.current === null;
    focusedStep.current = step;
    const answer = opening
      ? bodyRef.current?.querySelector<HTMLElement>("[data-creation-answer]")
      : null;
    (answer ?? headingRef.current)?.focus();
  }, [step]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const made: Element[] = [];
    let node: Element | null = root;
    while (node && node !== document.body) {
      const parent: Element | null = node.parentElement;
      for (const sibling of Array.from(parent?.children ?? [])) {
        if (sibling === node || sibling.hasAttribute("inert")) continue;
        if (sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE")
          continue;
        sibling.setAttribute("inert", "");
        made.push(sibling);
      }
      node = parent;
    }
    return () => {
      for (const element of made) element.removeAttribute("inert");
    };
  }, []);

  // Escape leaves from anywhere in the frame — and from the page itself, where
  // focus lands when a control inside unmounts. A dialog the flow opened sits
  // outside the frame and handles its own Escape.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as Node | null;
      const inFrame = target !== null && !!rootRef.current?.contains(target);
      if (!inFrame && target !== document.body) return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const follow = () =>
      setViewport({ height: visual.height, top: visual.offsetTop });
    follow();
    visual.addEventListener("resize", follow);
    visual.addEventListener("scroll", follow);
    return () => {
      visual.removeEventListener("resize", follow);
      visual.removeEventListener("scroll", follow);
    };
  }, []);

  const formId = useId();
  return (
    // The page's one `main`: the stepper is all the page there is while it
    // is open, and a page with no `main` has no landmark to skip to.
    <main
      ref={rootRef}
      aria-label={label}
      data-creation-stepper="true"
      data-creation-step={step}
      className="fixed inset-x-0 top-0 z-overlay flex h-dvh flex-col bg-surface text-text"
      style={
        viewport
          ? {
              height: `${viewport.height}px`,
              transform: `translateY(${viewport.top}px)`,
            }
          : undefined
      }
    >
      <header className="flex shrink-0 flex-col gap-3 border-b border-border px-4 pt-3 pb-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <p
            data-creation-progress="true"
            className="text-body-sm font-medium text-text-muted tabular-nums"
          >
            {progressLabel}
          </p>
          <IconButton
            type="button"
            variant="ghost"
            size="md"
            label={closeLabel}
            data-creation-close="true"
            onClick={onClose}
          >
            <XIcon />
          </IconButton>
        </div>
        <ProgressBar
          label={progressLabel}
          value={step}
          max={total}
          className="h-1"
        />
      </header>

      <form
        id={formId}
        noValidate
        action={endpoint}
        onSubmit={onSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        {formFields}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            ref={bodyRef}
            className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
          >
            <div className="flex flex-col gap-2">
              <h1
                ref={headingRef}
                tabIndex={-1}
                data-creation-question="true"
                className="text-h1 text-balance text-text-heading outline-none"
              >
                {question}
              </h1>
              {description ? (
                <div className="text-body text-text-muted">{description}</div>
              ) : null}
            </div>
            {children}
            {status}
          </div>
        </div>
        <div className="site-shell-safe-bottom shrink-0 border-t border-border bg-surface">
          <footer className="flex items-center gap-2 px-4 py-3 sm:px-6">
            {onBack ? (
              <Button
                type="button"
                variant="ghost"
                data-creation-back="true"
                onClick={onBack}
              >
                {backLabel}
              </Button>
            ) : null}
            <span className="ml-auto flex items-center gap-2">
              {secondary ? (
                <Button
                  type="button"
                  variant="secondary"
                  data-creation-secondary="true"
                  disabled={secondary.disabled}
                  onClick={secondary.onClick}
                >
                  {secondary.label}
                </Button>
              ) : null}
              <Button
                type="submit"
                data-creation-primary="true"
                disabled={primaryDisabled || primaryPending}
                aria-busy={primaryPending || undefined}
              >
                {primaryLabel}
              </Button>
            </span>
          </footer>
        </div>
      </form>
    </main>
  );
}

export { CreationStepper };
