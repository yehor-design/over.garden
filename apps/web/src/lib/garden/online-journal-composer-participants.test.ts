import { describe, expect, it, vi } from "vitest";

import {
  registerOnlineJournalComposerParticipant,
  startAllOnlineJournalComposerTransitionParticipants,
} from "./online-journal-composer-participants";

describe("online journal composer transition participants", () => {
  it("freezes, flushes, seals, and resumes the exact in-memory participants", async () => {
    const participant = {
      freeze: vi.fn(),
      flushLatest: vi.fn(async () => undefined),
      resume: vi.fn(),
      abort: vi.fn(),
    };
    const unregister = registerOnlineJournalComposerParticipant(participant);
    try {
      const preparation = startAllOnlineJournalComposerTransitionParticipants();
      await preparation.ready;

      expect(participant.freeze).toHaveBeenCalled();
      expect(participant.flushLatest).toHaveBeenCalledOnce();
      expect(preparation.isDocumentReplacementParticipantSetStable()).toBe(
        true,
      );

      await preparation.resume();
      expect(participant.resume).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });

  it("repeats the flush when a composer mounts during preparation", async () => {
    const second = {
      freeze: vi.fn(),
      flushLatest: vi.fn(async () => undefined),
      resume: vi.fn(),
      abort: vi.fn(),
    };
    let unregisterSecond: () => void = () => undefined;
    const first = {
      freeze: vi.fn(),
      flushLatest: vi.fn(async () => {
        unregisterSecond = registerOnlineJournalComposerParticipant(second);
      }),
      resume: vi.fn(),
      abort: vi.fn(),
    };
    const unregisterFirst = registerOnlineJournalComposerParticipant(first);
    try {
      const preparation = startAllOnlineJournalComposerTransitionParticipants();
      await preparation.ready;

      expect(first.flushLatest.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(second.flushLatest).toHaveBeenCalled();
      expect(preparation.isDocumentReplacementParticipantSetStable()).toBe(
        true,
      );
      await preparation.cancel();
    } finally {
      unregisterSecond();
      unregisterFirst();
    }
  });
});
