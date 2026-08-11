"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import type { FirstPlantEntryResponse } from "@/lib/garden/entry-contracts";
import {
  FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS,
  createForegroundAutosyncCoordinator,
  ForegroundAutosyncIneligibleError,
  withForegroundAutosyncLease,
  installForegroundAutosyncEventTriggers,
  type ForegroundAutosyncCoordinator,
} from "@/lib/offline/foreground-autosync";
import { syncClaimedOfflineJournalEntryMutation } from "@/lib/offline/journal-entry-sync";
import {
  claimOfflineMutationForAutomaticSync,
  claimOfflineMutationForManualSync,
  getOfflineMutationManualSyncCandidate,
  listOfflineMutationsEligibleForAutomaticSync,
  markOfflineMutationsForManualRecovery,
  recoverExpiredOfflineMutationSyncClaims,
} from "@/lib/offline/queue";
import { readActiveOwnerUserId } from "@/lib/offline/owner-vault";
import {
  confirmDocumentMutationOwnerContinuity,
  useOptionalDocumentMutationGeneration,
} from "./document-mutation-recovery";

interface ForegroundAutosyncContextValue {
  runManualMutation(mutationId: string): Promise<FirstPlantEntryResponse>;
}

const ForegroundAutosyncContext =
  createContext<ForegroundAutosyncContextValue | null>(null);

export function ForegroundAutosyncProvider({
  children,
  documentMutationGeneration,
  enabled,
}: {
  children: React.ReactNode;
  documentMutationGeneration: string | null;
  enabled: boolean;
}) {
  const documentMutation = useOptionalDocumentMutationGeneration();
  const coordinatorRef =
    useRef<ForegroundAutosyncCoordinator<FirstPlantEntryResponse> | null>(null);
  const identityRef = useRef({
    documentMutationGeneration,
    enabled,
  });
  const handleTransportResult = documentMutation?.handleTransportResult;
  const admissionHandlerRef = useRef(handleTransportResult);

  useLayoutEffect(() => {
    identityRef.current = {
      documentMutationGeneration,
      enabled,
    };
    admissionHandlerRef.current = handleTransportResult;
  }, [documentMutationGeneration, enabled, handleTransportResult]);

  useEffect(() => {
    const ownerUserId = readActiveOwnerUserId();
    if (!enabled || !ownerUserId || !documentMutationGeneration) {
      coordinatorRef.current = null;
      return;
    }

    const isCurrent = () => {
      const current = identityRef.current;
      return (
        current.enabled &&
        readActiveOwnerUserId() === ownerUserId &&
        current.documentMutationGeneration === documentMutationGeneration
      );
    };
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId,
      documentMutationGeneration,
      isCurrent,
      dependencies: {
        recoverExpiredClaims: recoverExpiredOfflineMutationSyncClaims,
        listAutomaticCandidates: listOfflineMutationsEligibleForAutomaticSync,
        getManualCandidate: getOfflineMutationManualSyncCandidate,
        admit: ({
          documentMutationGeneration: transport,
          deadlineMs,
          signal,
        }) =>
          deadlineMs === FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS
            ? confirmDocumentMutationOwnerContinuity(transport, signal)
            : Promise.resolve("MUTATION_ADMISSION_UNAVAILABLE"),
        markAdmissionFailure: markOfflineMutationsForManualRecovery,
        claimAutomatic: claimOfflineMutationForAutomaticSync,
        claimManual: claimOfflineMutationForManualSync,
        syncClaimed: (mutation, input) =>
          syncClaimedOfflineJournalEntryMutation(mutation, input),
        withLease: withForegroundAutosyncLease,
        monotonicNow: () => performance.now(),
      },
      onAdmissionResult: (result) => admissionHandlerRef.current?.(result),
    });
    coordinatorRef.current = coordinator;

    const removeEventTriggers =
      installForegroundAutosyncEventTriggers(coordinator);

    return () => {
      removeEventTriggers();
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null;
      }
    };
  }, [documentMutationGeneration, enabled]);

  const runManualMutation = useCallback(async (mutationId: string) => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) throw new ForegroundAutosyncIneligibleError();
    return coordinator.runManual(mutationId);
  }, []);

  const value = useMemo<ForegroundAutosyncContextValue>(
    () => ({ runManualMutation }),
    [runManualMutation],
  );

  return (
    <ForegroundAutosyncContext.Provider value={value}>
      {children}
    </ForegroundAutosyncContext.Provider>
  );
}

export function useOptionalForegroundAutosync() {
  return useContext(ForegroundAutosyncContext);
}
