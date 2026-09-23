"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Callout, type CalloutTone } from "@/components/ui/callout";

/**
 * What an answer did, read back from the server after the redirect — and
 * where focus goes, because the control that was pressed left with its card
 * (`OVE-495`, criterion 12). Without this, focus fell to the document and a
 * keyboard reader started again from the top with nothing said.
 */
export function LineageOutcomeNotice({
  outcome,
  tone,
  title,
  children,
}: {
  outcome: string;
  tone: CalloutTone;
  title: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-lineage-outcome={outcome}
      className="outline-none"
    >
      <Callout
        tone={tone}
        title={title}
        // A refusal interrupts; a saved answer is announced politely.
        live={tone === "success" ? "polite" : "assertive"}
      >
        {children}
      </Callout>
    </div>
  );
}
