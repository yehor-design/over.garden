"use client";

/**
 * Static, developer-owned identifier. Never put form values, private notes, or
 * other user content in a participant id.
 */
interface InterfaceLocaleChangeParticipantBase {
  id: string;
}

export interface InterfaceLocaleChangeCleanParticipant extends InterfaceLocaleChangeParticipantBase {
  kind: "clean";
}

export interface InterfaceLocaleChangePreparedParticipant {
  /**
   * Release the participant's transition fence. A rejection must leave the
   * participant retryable; the coordinator swallows the cause and reports a
   * bounded `retry-required` result.
   */
  resume(): Promise<void>;
  /**
   * Re-flush state that advanced while the destination request was pending.
   * Participants without mutable durable state may omit this callback.
   */
  flushLatest?(): Promise<void>;
  /** Final flush plus an atomic no-advance seal before the destination call. */
  sealForDocumentReplacement?(): Promise<void>;
  /**
   * Payload-free synchronous check for participant sets hidden behind one
   * adapter registration. False blocks destination I/O under the adapter's
   * static id.
   */
  isCommitGateReady?(): boolean;
}

export interface InterfaceLocaleChangeSafeFlushParticipant extends InterfaceLocaleChangeParticipantBase {
  kind: "safe-flush";
  /**
   * Freeze the surface and durably flush its latest complete generation.
   * Implementations must release any partial fence before rejecting.
   * The coordinator must not impose a generic Promise timeout here: until this
   * resolves with `resume`, it cannot cancel an acquired fence without risking
   * an orphaned frozen surface.
   */
  prepare(): Promise<InterfaceLocaleChangePreparedParticipant>;
}

export interface InterfaceLocaleChangeDirtyParticipant extends InterfaceLocaleChangeParticipantBase {
  kind: "dirty-confirmation";
  /** Clear local state only after the caller records an explicit discard. */
  discard(): void | Promise<void>;
}

export interface InterfaceLocaleChangeInFlightParticipant extends InterfaceLocaleChangeParticipantBase {
  kind: "in-flight";
}

export type InterfaceLocaleChangeParticipant =
  | InterfaceLocaleChangeCleanParticipant
  | InterfaceLocaleChangeSafeFlushParticipant
  | InterfaceLocaleChangeDirtyParticipant
  | InterfaceLocaleChangeInFlightParticipant;

export interface InterfaceLocaleChangeCoordinatorState {
  phase: "idle" | "preparing";
  hasInFlightMutation: boolean;
  requiresDirtyConfirmation: boolean;
  /** Static participant identifiers only; never user-authored content. */
  inFlightParticipantIds: readonly string[];
  dirtyParticipantIds: readonly string[];
}

export type InterfaceLocaleChangeResumeResult = "resumed" | "retry-required";

export interface InterfaceLocaleChangeRecoveryHandle {
  isActive(): boolean;
  participantIds(): readonly string[];
  resume(): Promise<InterfaceLocaleChangeResumeResult>;
}

export interface PreparedInterfaceLocaleChange extends InterfaceLocaleChangeRecoveryHandle {
  /** Durably flush every prepared surface at the final pre-navigation fence. */
  flushLatest(): Promise<void>;
  /** Flush and prevent any newer surface generation before destination I/O. */
  sealForDocumentReplacement(): Promise<void>;
  /** Synchronous final registry/epoch check immediately around destination I/O. */
  revalidateCommitGate(): InterfaceLocaleChangeCommitGateResult;
  /**
   * Finalize only after the caller has committed a full-document replacement.
   * This deliberately performs no navigation, persistence, submission, retry,
   * translation, or product mutation and leaves prepared surfaces frozen.
   */
  keepFrozenForDocumentReplacement(): void;
}

export type InterfaceLocaleChangeCommitGateResult =
  | { status: "ready" }
  | { status: "confirmation-required"; participantIds: readonly string[] }
  | {
      status: "blocked";
      reason: "mutation-in-flight" | "participant-set-changed";
      participantIds: readonly string[];
    };

interface InterfaceLocaleChangeStoppedResult {
  /** Non-null only when automatic unfreezing failed and can be retried. */
  recovery: InterfaceLocaleChangeRecoveryHandle | null;
}

export interface InterfaceLocaleChangeBlockedResult extends InterfaceLocaleChangeStoppedResult {
  status: "blocked";
  reason: "mutation-in-flight" | "transition-in-progress";
  participantIds: readonly string[];
}

export interface InterfaceLocaleChangeConfirmationRequiredResult extends InterfaceLocaleChangeStoppedResult {
  status: "confirmation-required";
  participantIds: readonly string[];
}

export interface InterfaceLocaleChangeFailedResult extends InterfaceLocaleChangeStoppedResult {
  status: "failed";
  reason: "safe-flush-failed" | "dirty-discard-failed";
  participantIds: readonly string[];
}

export interface InterfaceLocaleChangePreparedResult {
  status: "prepared";
  preparation: PreparedInterfaceLocaleChange;
}

export type InterfaceLocaleChangePreparationResult =
  | InterfaceLocaleChangeBlockedResult
  | InterfaceLocaleChangeConfirmationRequiredResult
  | InterfaceLocaleChangeFailedResult
  | InterfaceLocaleChangePreparedResult;

export interface PrepareInterfaceLocaleChangeOptions {
  /** Set only after the localized discard/cancel confirmation chose discard. */
  discardConfirmed?: boolean;
}

export interface InterfaceLocaleChangeCoordinator {
  /**
   * Registers behavior callbacks only. The coordinator copies the supported
   * fields and never receives or retains a raw form snapshot or mutation input.
   */
  register(participant: InterfaceLocaleChangeParticipant): () => void;
  readState(): InterfaceLocaleChangeCoordinatorState;
  subscribe(
    listener: (state: InterfaceLocaleChangeCoordinatorState) => void,
  ): () => void;
  prepare(
    options?: PrepareInterfaceLocaleChangeOptions,
  ): Promise<InterfaceLocaleChangePreparationResult>;
}

type InternalParticipant =
  | InterfaceLocaleChangeCleanParticipant
  | InterfaceLocaleChangeSafeFlushParticipant
  | InterfaceLocaleChangeDirtyParticipant
  | InterfaceLocaleChangeInFlightParticipant;

type InternalParticipantKind = InternalParticipant["kind"];
type InternalParticipantOfKind<TKind extends InternalParticipantKind> = Extract<
  InternalParticipant,
  { kind: TKind }
>;

type InterfaceLocaleChangeStoppedPreparationResult =
  | InterfaceLocaleChangeBlockedResult
  | InterfaceLocaleChangeConfirmationRequiredResult
  | InterfaceLocaleChangeFailedResult;

type InterfaceLocaleChangeStoppedPreparationInput =
  | Omit<InterfaceLocaleChangeBlockedResult, "recovery">
  | Omit<InterfaceLocaleChangeConfirmationRequiredResult, "recovery">
  | Omit<InterfaceLocaleChangeFailedResult, "recovery">;

interface PreparedParticipantRecord {
  id: string;
  resume(): Promise<void>;
  flushLatest?(): Promise<void>;
  sealForDocumentReplacement?(): Promise<void>;
  isCommitGateReady?(): boolean;
}

const PARTICIPANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function createInterfaceLocaleChangeCoordinator(): InterfaceLocaleChangeCoordinator {
  const participants = new Map<symbol, InternalParticipant>();
  const listeners = new Set<
    (state: InterfaceLocaleChangeCoordinatorState) => void
  >();
  let activeTransition: symbol | null = null;
  let pendingDirtyConfirmation: {
    revision: number;
    registrationTokens: Set<symbol>;
  } | null = null;
  let dirtyRevision = 0;

  const participantEntries = <TKind extends InternalParticipantKind>(
    kind: TKind,
  ): Array<[symbol, InternalParticipantOfKind<TKind>]> => {
    const matching: Array<[symbol, InternalParticipantOfKind<TKind>]> = [];
    for (const [token, participant] of participants) {
      if (participant.kind !== kind) continue;
      matching.push([token, participant as InternalParticipantOfKind<TKind>]);
    }
    return matching;
  };

  const participantIds = (kind: InternalParticipantKind) =>
    uniqueSortedIds(
      participantEntries(kind).map(([, participant]) => participant.id),
    );

  const readState = (): InterfaceLocaleChangeCoordinatorState => ({
    phase: activeTransition === null ? "idle" : "preparing",
    hasInFlightMutation: participantEntries("in-flight").length > 0,
    requiresDirtyConfirmation:
      participantEntries("dirty-confirmation").length > 0,
    inFlightParticipantIds: participantIds("in-flight"),
    dirtyParticipantIds: participantIds("dirty-confirmation"),
  });

  const notify = () => {
    const state = readState();
    for (const listener of listeners) listener(state);
  };

  const releaseTransition = (token: symbol) => {
    if (activeTransition !== token) return;
    activeTransition = null;
    notify();
  };

  const createRecoveryHandle = (
    initialRecords: PreparedParticipantRecord[],
    token: symbol,
    allowDocumentReplacement: boolean,
    revalidateCommitGate?: () => InterfaceLocaleChangeCommitGateResult,
  ): InterfaceLocaleChangeRecoveryHandle | PreparedInterfaceLocaleChange => {
    let records = [...initialRecords];
    let active = true;
    let resumeInFlight: Promise<InterfaceLocaleChangeResumeResult> | null =
      null;

    const resume = () => {
      if (!active) return Promise.resolve("resumed" as const);
      if (resumeInFlight !== null) return resumeInFlight;

      resumeInFlight = (async () => {
        const failures: PreparedParticipantRecord[] = [];
        for (const record of [...records].reverse()) {
          try {
            await record.resume();
          } catch {
            failures.unshift(record);
          }
        }
        records = failures;
        if (records.length > 0) return "retry-required" as const;
        active = false;
        releaseTransition(token);
        return "resumed" as const;
      })().finally(() => {
        resumeInFlight = null;
      });
      return resumeInFlight;
    };

    const base: InterfaceLocaleChangeRecoveryHandle = {
      isActive: () => active,
      participantIds: () => uniqueSortedIds(records.map((record) => record.id)),
      resume,
    };
    if (!allowDocumentReplacement) return base;

    return {
      ...base,
      async flushLatest() {
        if (!active) return;
        for (const record of records) await record.flushLatest?.();
      },
      async sealForDocumentReplacement() {
        if (!active) return;
        for (const record of records) {
          if (record.sealForDocumentReplacement) {
            await record.sealForDocumentReplacement();
          } else {
            await record.flushLatest?.();
          }
        }
      },
      revalidateCommitGate: () =>
        revalidateCommitGate?.() ?? {
          status: "blocked",
          reason: "participant-set-changed",
          participantIds: [],
        },
      keepFrozenForDocumentReplacement() {
        if (!active) return;
        active = false;
        records = [];
        releaseTransition(token);
      },
    } satisfies PreparedInterfaceLocaleChange;
  };

  const recoverStoppedTransition = async (
    records: PreparedParticipantRecord[],
    token: symbol,
  ) => {
    if (records.length === 0) {
      releaseTransition(token);
      return null;
    }
    const recovery = createRecoveryHandle(records, token, false);
    const result = await recovery.resume();
    return result === "retry-required" ? recovery : null;
  };

  return {
    register(participant) {
      const normalized = copyParticipantContract(participant);
      const registrationToken = Symbol(`interface-locale:${normalized.id}`);
      participants.set(registrationToken, normalized);
      if (normalized.kind === "dirty-confirmation") dirtyRevision += 1;
      notify();
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        participants.delete(registrationToken);
        if (normalized.kind === "dirty-confirmation") dirtyRevision += 1;
        notify();
      };
    },
    readState,
    subscribe(listener) {
      listeners.add(listener);
      listener(readState());
      return () => listeners.delete(listener);
    },
    async prepare(options = {}) {
      if (activeTransition !== null) {
        return {
          status: "blocked",
          reason: "transition-in-progress",
          participantIds: [],
          recovery: null,
        };
      }

      const token = Symbol("interface-locale-change");
      activeTransition = token;
      notify();
      const confirmation =
        options.discardConfirmed === true ? pendingDirtyConfirmation : null;
      pendingDirtyConfirmation = null;
      const confirmedDirtyRegistrationTokens =
        confirmation?.revision === dirtyRevision
          ? confirmation.registrationTokens
          : new Set<symbol>();
      const prepared: PreparedParticipantRecord[] = [];
      const preparedRegistrationTokens = new Set<symbol>();
      const discardedRegistrationTokens = new Set<symbol>();

      const stop = async (
        result: InterfaceLocaleChangeStoppedPreparationInput,
      ): Promise<InterfaceLocaleChangeStoppedPreparationResult> =>
        ({
          ...result,
          recovery: await recoverStoppedTransition(prepared, token),
        }) as InterfaceLocaleChangeStoppedPreparationResult;

      while (true) {
        const inFlightIds = participantIds("in-flight");
        if (inFlightIds.length > 0) {
          return stop({
            status: "blocked",
            reason: "mutation-in-flight",
            participantIds: inFlightIds,
          });
        }

        const dirtyEntries = participantEntries("dirty-confirmation").filter(
          ([registrationToken]) =>
            !discardedRegistrationTokens.has(registrationToken),
        );
        const unconfirmedDirtyEntries = dirtyEntries.filter(
          ([registrationToken]) =>
            !confirmedDirtyRegistrationTokens.has(registrationToken),
        );
        if (unconfirmedDirtyEntries.length > 0) {
          const confirmationRevision = dirtyRevision;
          const result = await stop({
            status: "confirmation-required",
            participantIds: uniqueSortedIds(
              dirtyEntries.map(([, participant]) => participant.id),
            ),
          });
          if (confirmationRevision === dirtyRevision) {
            pendingDirtyConfirmation = {
              revision: confirmationRevision,
              registrationTokens: new Set(
                dirtyEntries.map(([registrationToken]) => registrationToken),
              ),
            };
          }
          return result;
        }

        const safeEntry = participantEntries("safe-flush").find(
          ([registrationToken]) =>
            !preparedRegistrationTokens.has(registrationToken),
        );
        if (safeEntry) {
          const [registrationToken, participant] = safeEntry;
          preparedRegistrationTokens.add(registrationToken);
          try {
            const participantPreparation = await participant.prepare();
            if (typeof participantPreparation?.resume !== "function") {
              throw new Error(
                "Safe locale-change preparation did not return a resume callback.",
              );
            }
            const flushLatest = participantPreparation.flushLatest;
            const sealForDocumentReplacement =
              participantPreparation.sealForDocumentReplacement;
            const isCommitGateReady = participantPreparation.isCommitGateReady;
            prepared.push({
              id: participant.id,
              resume: () => participantPreparation.resume(),
              flushLatest: flushLatest ? () => flushLatest() : undefined,
              sealForDocumentReplacement: sealForDocumentReplacement
                ? () => sealForDocumentReplacement()
                : undefined,
              isCommitGateReady: isCommitGateReady
                ? () => isCommitGateReady()
                : undefined,
            });
          } catch {
            return stop({
              status: "failed",
              reason: "safe-flush-failed",
              participantIds: [participant.id],
            });
          }
          continue;
        }

        if (dirtyEntries.length > 0) {
          const [registrationToken, participant] = dirtyEntries[0];
          discardedRegistrationTokens.add(registrationToken);
          try {
            await participant.discard();
          } catch {
            return stop({
              status: "failed",
              reason: "dirty-discard-failed",
              participantIds: [participant.id],
            });
          }
          continue;
        }

        // No await occurs between this final fixed-point check and returning
        // the handle, so a newly registered mutation cannot be missed here.
        const finalInFlightIds = participantIds("in-flight");
        if (finalInFlightIds.length > 0) {
          return stop({
            status: "blocked",
            reason: "mutation-in-flight",
            participantIds: finalInFlightIds,
          });
        }
        if (
          participantEntries("safe-flush").some(
            ([registrationToken]) =>
              !preparedRegistrationTokens.has(registrationToken),
          ) ||
          participantEntries("dirty-confirmation").some(
            ([registrationToken]) =>
              !discardedRegistrationTokens.has(registrationToken),
          )
        ) {
          continue;
        }

        const readyDirtyRevision = dirtyRevision;
        const revalidateCommitGate =
          (): InterfaceLocaleChangeCommitGateResult => {
            const inFlightIds = participantIds("in-flight");
            if (inFlightIds.length > 0) {
              return {
                status: "blocked",
                reason: "mutation-in-flight",
                participantIds: inFlightIds,
              };
            }

            const unpreparedSafeEntries = participantEntries(
              "safe-flush",
            ).filter(
              ([registrationToken]) =>
                !preparedRegistrationTokens.has(registrationToken),
            );
            if (unpreparedSafeEntries.length > 0) {
              return {
                status: "blocked",
                reason: "participant-set-changed",
                participantIds: uniqueSortedIds(
                  unpreparedSafeEntries.map(
                    ([, participant]) => participant.id,
                  ),
                ),
              };
            }

            const changedNestedParticipants = prepared.filter((record) => {
              try {
                return record.isCommitGateReady?.() === false;
              } catch {
                // A participant-specific gate is a safety boundary. Treat an
                // unreadable gate as changed instead of allowing navigation.
                return true;
              }
            });
            if (changedNestedParticipants.length > 0) {
              return {
                status: "blocked",
                reason: "participant-set-changed",
                participantIds: uniqueSortedIds(
                  changedNestedParticipants.map((record) => record.id),
                ),
              };
            }

            if (dirtyRevision !== readyDirtyRevision) {
              const currentDirtyEntries =
                participantEntries("dirty-confirmation");
              if (currentDirtyEntries.length === 0) {
                return { status: "ready" };
              }
              pendingDirtyConfirmation = {
                revision: dirtyRevision,
                registrationTokens: new Set(
                  currentDirtyEntries.map(
                    ([registrationToken]) => registrationToken,
                  ),
                ),
              };
              return {
                status: "confirmation-required",
                participantIds: uniqueSortedIds(
                  currentDirtyEntries.map(([, participant]) => participant.id),
                ),
              };
            }

            return { status: "ready" };
          };

        return {
          status: "prepared",
          preparation: createRecoveryHandle(
            prepared,
            token,
            true,
            revalidateCommitGate,
          ) as PreparedInterfaceLocaleChange,
        };
      }
    },
  };
}

/** Shared client coordinator used by SiteShell and stateful surfaces. */
export const interfaceLocaleChangeCoordinator =
  createInterfaceLocaleChangeCoordinator();

function copyParticipantContract(
  participant: InterfaceLocaleChangeParticipant,
): InternalParticipant {
  const id = requireParticipantId(participant.id);
  switch (participant.kind) {
    case "clean":
      return { kind: "clean", id };
    case "in-flight":
      return { kind: "in-flight", id };
    case "dirty-confirmation":
      return { kind: "dirty-confirmation", id, discard: participant.discard };
    case "safe-flush":
      return { kind: "safe-flush", id, prepare: participant.prepare };
  }
}

function requireParticipantId(id: string) {
  const normalized = id.trim();
  if (!PARTICIPANT_ID_PATTERN.test(normalized)) {
    throw new Error(
      "Locale-change participant ids must be static, non-sensitive identifiers.",
    );
  }
  return normalized;
}

function uniqueSortedIds(ids: string[]) {
  return [...new Set(ids)].sort();
}
