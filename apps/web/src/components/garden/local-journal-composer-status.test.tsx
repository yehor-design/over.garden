// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getAtomicJournalCreateCopy } from "@/lib/garden/atomic-journal-create-copy";
import type { LocalJournalComposerState } from "@/lib/garden/use-local-journal-composer";

import { LocalJournalComposerStatus } from "./local-journal-composer-status";

const copy = getAtomicJournalCreateCopy("uk");

function stateOf(status: LocalJournalComposerState["status"]) {
  return { status, errorCode: null } as unknown as LocalJournalComposerState;
}

describe("the composer's status (OVE-478)", () => {
  it("keeps the idle note out of the live region, which is there and silent", () => {
    render(
      <LocalJournalComposerStatus
        state={stateOf("idle")}
        copy={copy}
        onCancelPublishing={vi.fn()}
      />,
    );
    // Heard with Orca: the note in the region was announced whenever a
    // composer appeared, straight after "Запис опубліковано.".
    expect(screen.getByText(copy.localOnly).closest('[role="status"]')).toBe(
      null,
    );
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("speaks when the state changes, in the region that was already there", () => {
    const { rerender } = render(
      <LocalJournalComposerStatus
        state={stateOf("idle")}
        copy={copy}
        onCancelPublishing={vi.fn()}
      />,
    );
    const region = screen.getByRole("status");
    rerender(
      <LocalJournalComposerStatus
        state={stateOf("publishing")}
        copy={copy}
        onCancelPublishing={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe(copy.publishing);
    expect(screen.queryByText(copy.localOnly)).toBeNull();

    rerender(
      <LocalJournalComposerStatus
        state={stateOf("failed")}
        copy={copy}
        onCancelPublishing={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(copy.failed);
  });
});
