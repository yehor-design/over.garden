"use client";

import type { InterfaceLocaleChangeSafeFlushParticipant } from "../interface-locale-change-coordinator";
import { startAllOwnerComposerTransitionParticipants } from "./owner-composer-participants";

function isVisualFixtureBrowserRequest(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  for (const key of params.keys()) {
    if (key.startsWith("visual")) return true;
  }
  return false;
}

/**
 * Adapt the OVE-204 owner-composer fence to an interface-locale transition.
 * The adapter forwards no draft payload to the coordinator: the existing
 * owner-scoped persistence controller owns the exact latest snapshot.
 */
export function createOwnerComposerLocaleChangeParticipant(): InterfaceLocaleChangeSafeFlushParticipant {
  return {
    id: "owner-composer-drafts",
    kind: "safe-flush",
    prepare() {
      // Visual-fixture routes must not open the real IndexedDB composer lane —
      // Dexie preparation can wedge Playwright Chromium before document reload.
      if (isVisualFixtureBrowserRequest()) {
        return {
          ready: Promise.resolve(),
          flushLatest: async () => undefined,
          sealForDocumentReplacement: async () => undefined,
          isCommitGateReady: () => true,
          resume: async () => undefined,
          cancel: async () => undefined,
        };
      }

      const preparation = startAllOwnerComposerTransitionParticipants();
      return {
        ready: preparation.ready,
        flushLatest: () => preparation.flushLatest(),
        sealForDocumentReplacement: () =>
          preparation.sealForDocumentReplacement(),
        isCommitGateReady: () =>
          preparation.isDocumentReplacementParticipantSetStable(),
        resume: () => preparation.resume(),
        cancel: () => preparation.cancel(),
      };
    },
  };
}
