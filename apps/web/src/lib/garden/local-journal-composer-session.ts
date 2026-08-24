"use client";

export interface LocalJournalComposerPreparationHandle {
  isActive(): boolean;
  bindSessionFence(scope: LocalJournalSessionFence): void;
  flushLatest(): Promise<void>;
  resume(): Promise<void>;
}

export interface LocalJournalSessionFence {
  operationId: string;
  sessionGeneration: string;
  waitForParticipantDrain(): Promise<void>;
  renewPreparationLease(): Promise<void>;
  resume(): Promise<void>;
  finalizeForSignedOut(): Promise<void>;
  finalizeForSessionChange(): Promise<void>;
  finalizeForHardReload(): Promise<void>;
}

const complete = async () => undefined;

export async function prepareLocalJournalComposerSession(
  ownerUserId?: string,
): Promise<LocalJournalComposerPreparationHandle> {
  void ownerUserId;
  let active = true;
  return {
    isActive: () => active,
    bindSessionFence: () => undefined,
    flushLatest: complete,
    resume: async () => {
      active = false;
    },
  };
}

export function createLocalJournalSessionFence(input: {
  operationId: string;
  sessionGeneration: string;
}): LocalJournalSessionFence {
  return {
    operationId: input.operationId,
    sessionGeneration: input.sessionGeneration,
    waitForParticipantDrain: complete,
    renewPreparationLease: complete,
    resume: complete,
    finalizeForSignedOut: complete,
    finalizeForSessionChange: complete,
    finalizeForHardReload: complete,
  };
}

export function pauseLocalJournalComposerActivity(
  ownerUserId: string,
  input: { operationId: string; sessionGeneration: string },
) {
  void ownerUserId;
  return createLocalJournalSessionFence(input);
}

export function abortLocalJournalComposerSession(...context: unknown[]) {
  void context;
}

export function sealLocalJournalComposerForExit() {}

export async function finalizeLocalJournalComposerForSignedOut(
  ...context: unknown[]
) {
  void context;
}

export async function finalizeLocalJournalComposerForSessionChange(
  ...context: unknown[]
) {
  void context;
}

export async function admitLocalJournalComposerSession(
  ...context: unknown[]
): Promise<"ready" | "blocked" | "document_session_changed"> {
  void context;
  return "ready";
}
