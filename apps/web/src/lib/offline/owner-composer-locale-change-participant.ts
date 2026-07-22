"use client";

import type { InterfaceLocaleChangeSafeFlushParticipant } from "../interface-locale-change-coordinator";
import { prepareAllOwnerComposerTransitionParticipants } from "./owner-composer-participants";

/**
 * Adapt the OVE-204 owner-composer fence to an interface-locale transition.
 * The adapter forwards no draft payload to the coordinator: the existing
 * owner-scoped persistence controller owns the exact latest snapshot.
 */
export function createOwnerComposerLocaleChangeParticipant(): InterfaceLocaleChangeSafeFlushParticipant {
  return {
    id: "owner-composer-drafts",
    kind: "safe-flush",
    async prepare() {
      const preparation = await prepareAllOwnerComposerTransitionParticipants();
      return {
        flushLatest: () => preparation.flushLatest(),
        sealForDocumentReplacement: () =>
          preparation.sealForDocumentReplacement(),
        isCommitGateReady: () =>
          preparation.isDocumentReplacementParticipantSetStable(),
        resume: () => preparation.resume(),
      };
    },
  };
}
