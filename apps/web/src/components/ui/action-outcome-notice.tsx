"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Callout, type CalloutTone } from "@/components/ui/callout";

/**
 * What an action did, read back from the server after its redirect — and
 * where focus goes, because the control that was pressed is usually gone
 * with the thing it acted on (`OVE-505`; the lineage inboxes, `OVE-495`).
 *
 * A saved outcome is announced politely; one that was not saved interrupts,
 * the way a form-level error does (DESIGN.md §5.3). The words are the page's
 * reading of the record, never the button's intention.
 *
 * Focus comes here when the notice appears **and whenever what it reports
 * changes** (`about`). React keeps one notice across outcomes that share a
 * place on the page: a member's "not sent" became "received" in place, and an
 * owner's second "saved" for the same request is the same element as the
 * first — so a notice that took focus only when it mounted left the second
 * reader at the top of the document, the button they had pressed gone.
 */
export function ActionOutcomeNotice({
  outcome,
  about,
  tone,
  title,
  children,
}: {
  /** A machine-readable name for the outcome (`data-action-outcome`). */
  outcome: string;
  /**
   * The record the outcome reports and the state it is in now — for example
   * its id and status. A new value is a new outcome, and takes focus again.
   */
  about: string;
  tone: CalloutTone;
  title: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [outcome, about]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-action-outcome={outcome}
      className="outline-none"
    >
      <Callout
        tone={tone}
        title={title}
        live={tone === "success" || tone === "info" ? "polite" : "assertive"}
      >
        {children}
      </Callout>
    </div>
  );
}
