"use client";

interface OnlineJournalComposerParticipant {
  freeze(token: symbol): void;
  flushLatest(token: symbol): Promise<void>;
  resume(token: symbol): void;
  abort(): void;
}

export interface OnlineJournalComposerPreparationHandle {
  isActive(): boolean;
  bindSessionFence(scope: OnlineJournalSessionFence): void;
  flushLatest(): Promise<void>;
  resume(): Promise<void>;
}

export interface AllOnlineJournalComposerPreparationHandle {
  ready: Promise<void>;
  flushLatest(): Promise<void>;
  sealForDocumentReplacement(): Promise<void>;
  isDocumentReplacementParticipantSetStable(): boolean;
  resume(): Promise<void>;
  cancel(): Promise<void>;
}

export interface OnlineJournalSessionFence {
  operationId: string;
  sessionGeneration: string;
  waitForParticipantDrain(): Promise<void>;
  renewPreparationLease(): Promise<void>;
  resume(): Promise<void>;
  finalizeForSignedOut(): Promise<void>;
  finalizeForSessionChange(): Promise<void>;
  finalizeForHardReload(): Promise<void>;
}

const participants = new Set<OnlineJournalComposerParticipant>();
let participantRevision = 0;

export function registerOnlineJournalComposerParticipant(
  participant: OnlineJournalComposerParticipant,
) {
  const alreadyRegistered = participants.has(participant);
  participants.add(participant);
  if (!alreadyRegistered) participantRevision += 1;
  return () => {
    if (participants.delete(participant)) participantRevision += 1;
  };
}

export async function prepareOnlineJournalComposerParticipants(
  ownerUserId?: string,
): Promise<OnlineJournalComposerPreparationHandle> {
  void ownerUserId;
  const preparation = startPreparation();
  await preparation.ready;
  return {
    isActive: preparation.isActive,
    bindSessionFence: () => undefined,
    flushLatest: preparation.flushLatest,
    resume: preparation.resume,
  };
}

export function startAllOnlineJournalComposerTransitionParticipants(): AllOnlineJournalComposerPreparationHandle {
  const preparation = startPreparation();
  return {
    ready: preparation.ready,
    flushLatest: preparation.flushLatest,
    sealForDocumentReplacement: preparation.seal,
    isDocumentReplacementParticipantSetStable: preparation.isStable,
    resume: preparation.resume,
    cancel: preparation.resume,
  };
}

export function createOnlineJournalSessionFence(input: {
  operationId: string;
  sessionGeneration: string;
}): OnlineJournalSessionFence {
  const release = async () => undefined;
  return {
    operationId: input.operationId,
    sessionGeneration: input.sessionGeneration,
    waitForParticipantDrain: async () => undefined,
    renewPreparationLease: async () => undefined,
    resume: release,
    finalizeForSignedOut: release,
    finalizeForSessionChange: release,
    finalizeForHardReload: release,
  };
}

export function pauseOnlineJournalComposerActivity(
  ownerUserId: string,
  input: { operationId: string; sessionGeneration: string },
) {
  void ownerUserId;
  return createOnlineJournalSessionFence(input);
}

export function abortOnlineJournalComposerParticipants(...context: unknown[]) {
  void context;
  for (const participant of [...participants]) participant.abort();
}

export function sealOnlineJournalComposerParticipantsForExit() {
  const token = Symbol("online-journal-exit");
  for (const participant of [...participants]) {
    participant.freeze(token);
    participant.abort();
  }
}

export async function finalizeOnlineJournalComposerParticipantsForExit(
  ...context: unknown[]
) {
  void context;
  sealOnlineJournalComposerParticipantsForExit();
}

export async function finalizeOnlineJournalComposerParticipantsForSignedOut(
  ...context: unknown[]
) {
  return finalizeOnlineJournalComposerParticipantsForExit(...context);
}

export async function finalizeOnlineJournalComposerParticipantsForSessionChange(
  ...context: unknown[]
) {
  return finalizeOnlineJournalComposerParticipantsForExit(...context);
}

export async function admitOnlineJournalComposerSession(
  ...context: unknown[]
): Promise<"ready" | "blocked" | "document_session_changed"> {
  void context;
  return "ready" as const;
}

function startPreparation() {
  const token = Symbol("online-journal-preparation");
  let active = true;
  let sealed = false;
  let capturedRevision = participantRevision;

  const freezeCurrent = () => {
    for (const participant of [...participants]) participant.freeze(token);
  };
  freezeCurrent();

  const flushLatest = async () => {
    if (!active) return;
    while (true) {
      const revisionBefore = participantRevision;
      const current = [...participants];
      for (const participant of current) participant.freeze(token);
      const results = await Promise.allSettled(
        current.map((participant) => participant.flushLatest(token)),
      );
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failure) throw failure.reason;
      capturedRevision = participantRevision;
      if (revisionBefore === participantRevision) return;
    }
  };

  const resume = async () => {
    if (!active || sealed) return;
    for (const participant of [...participants]) participant.resume(token);
    active = false;
  };

  const ready = flushLatest().catch(async (error) => {
    for (const participant of [...participants]) participant.resume(token);
    active = false;
    throw error;
  });

  return {
    ready,
    flushLatest,
    resume,
    seal: async () => {
      if (!active) return;
      await flushLatest();
      sealed = true;
    },
    isActive: () => active,
    isStable: () => capturedRevision === participantRevision,
  };
}
