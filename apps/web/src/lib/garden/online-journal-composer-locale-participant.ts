"use client";

import type { InterfaceLocaleChangeSafeFlushParticipant } from "@/lib/interface-locale-change-coordinator";
import { startAllOnlineJournalComposerTransitionParticipants } from "@/lib/garden/online-journal-composer-participants";

export function createOnlineJournalComposerLocaleChangeParticipant(): InterfaceLocaleChangeSafeFlushParticipant {
  return {
    id: "online-journal-composers",
    kind: "safe-flush",
    prepare() {
      const preparation = startAllOnlineJournalComposerTransitionParticipants();
      return {
        ready: preparation.ready,
        flushLatest: preparation.flushLatest,
        sealForDocumentReplacement: preparation.sealForDocumentReplacement,
        isCommitGateReady:
          preparation.isDocumentReplacementParticipantSetStable,
        resume: preparation.resume,
        cancel: preparation.cancel,
      };
    },
  };
}
