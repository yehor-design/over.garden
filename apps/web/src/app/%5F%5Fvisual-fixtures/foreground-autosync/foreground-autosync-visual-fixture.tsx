"use client";

import { useEffect, useRef, useState } from "react";

import type { DocumentMutationAdmissionTransportResultV1 } from "@/lib/auth/document-mutation-generation-transport";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  createForegroundAutosyncCoordinator,
  installForegroundAutosyncEventTriggers,
  type ForegroundAutosyncCoordinator,
  type ForegroundAutosyncReceipt,
} from "@/lib/offline/foreground-autosync";
import type {
  OfflineMutation,
  OfflineMutationSyncCandidate,
} from "@/lib/offline/queue";

type FixtureScenario =
  | "match"
  | "retry_after"
  | "stall_once"
  | "controlled_match";

type FixtureRowStatus = "queued" | "syncing" | "failed" | "synced";

interface FixtureRow {
  automaticAttemptConsumedRevision: number | null;
  id: string;
  revision: number;
  status: FixtureRowStatus;
}

interface ForegroundAutosyncFixtureSnapshot {
  admissionCount: number;
  automaticClaimCount: number;
  controlCounts: {
    editor: number;
    locale: number;
    manual: number;
    navigation: number;
    signOut: number;
  };
  lastAdmissionResult: Exclude<
    DocumentMutationAdmissionTransportResultV1,
    "MATCH"
  > | null;
  leaseCount: number;
  manualClaimCount: number;
  markedForManualRecoveryCount: number;
  networkCount: number;
  receipts: ForegroundAutosyncReceipt[];
  row: FixtureRow | null;
}

interface ForegroundAutosyncFixtureController {
  beginAutomaticSignals(): void;
  cancelCurrentContext(): Promise<void>;
  coalesceAllSix(): Promise<"rejected" | "synced">;
  completeAdmissionAfterContextChange(): Promise<void>;
  newRevision(scenario?: FixtureScenario): Promise<void>;
  prepare(scenario?: FixtureScenario): Promise<void>;
  runManual(): Promise<"rejected" | "synced">;
  snapshot(): ForegroundAutosyncFixtureSnapshot;
  waitForIdle(): Promise<void>;
}

declare global {
  interface Window {
    __ove289ForegroundAutosyncFixture?: ForegroundAutosyncFixtureController;
  }
}

interface FixtureState {
  admissionCount: number;
  automaticClaimCount: number;
  controlCounts: ForegroundAutosyncFixtureSnapshot["controlCounts"];
  current: boolean;
  lateAdmissionResolve: ((result: "MATCH") => void) | null;
  lastAdmissionResult: ForegroundAutosyncFixtureSnapshot["lastAdmissionResult"];
  leaseCount: number;
  manualClaimCount: number;
  markedForManualRecoveryCount: number;
  networkCount: number;
  receipts: ForegroundAutosyncReceipt[];
  row: FixtureRow | null;
  scenario: FixtureScenario;
}

const SYNTHETIC_OWNER_ID = "00000000-0000-4000-8000-000000000289";
const SYNTHETIC_MUTATION_ID = "ove289-synthetic-mutation";
const SYNTHETIC_DOCUMENT_GENERATION = "ove289-synthetic-document-generation";

const COPY: Record<
  InterfaceLocale,
  {
    editor: string;
    locale: string;
    manual: string;
    navigation: string;
    signOut: string;
    title: string;
  }
> = {
  uk: {
    editor: "Редагувати синтетичний запис",
    locale: "Перемкнути синтетичну мову",
    manual: "Синхронізувати синтетичний запис вручну",
    navigation: "Відкрити синтетичний сад",
    signOut: "Синтетичний вихід",
    title: "Синтетичний стенд фоново-незалежної синхронізації",
  },
  bg: {
    editor: "Редактиране на синтетичен запис",
    locale: "Смяна на синтетичен език",
    manual: "Ръчно синхронизиране на синтетичен запис",
    navigation: "Отваряне на синтетична градина",
    signOut: "Синтетично излизане",
    title: "Синтетичен стенд за синхронизация само на преден план",
  },
  ru: {
    editor: "Редактировать синтетическую запись",
    locale: "Переключить синтетический язык",
    manual: "Синхронизировать синтетическую запись вручную",
    navigation: "Открыть синтетический сад",
    signOut: "Синтетический выход",
    title: "Синтетический стенд синхронизации только на переднем плане",
  },
};

/** Synthetic-only harness that exercises the production coordinator in a browser. */
export function ForegroundAutosyncVisualFixture({
  locale = "uk",
}: {
  locale?: InterfaceLocale;
}) {
  const [rowStatus, setRowStatus] = useState<FixtureRowStatus | "empty">(
    "empty",
  );
  const stateRef = useRef(createFixtureState());
  const coordinatorRef = useRef<ForegroundAutosyncCoordinator<{
    readbackUrl: string;
  }> | null>(null);
  const copy = COPY[locale];

  useEffect(() => {
    const state = stateRef.current;
    state.current = true;
    const refresh = () => setRowStatus(state.row?.status ?? "empty");
    const coordinator = createForegroundAutosyncCoordinator({
      ownerUserId: SYNTHETIC_OWNER_ID,
      documentMutationGeneration: SYNTHETIC_DOCUMENT_GENERATION,
      isCurrent: () => state.current,
      dependencies: {
        recoverExpiredClaims: async () => 0,
        listAutomaticCandidates: async () => {
          const row = state.row;
          if (
            !row ||
            row.status !== "queued" ||
            row.automaticAttemptConsumedRevision === row.revision
          ) {
            return [];
          }
          return [candidate(row, "automatic")];
        },
        getManualCandidate: async (_owner, mutationId) => {
          const row = state.row;
          if (
            !row ||
            row.id !== mutationId ||
            (row.status !== "queued" && row.status !== "failed")
          ) {
            return null;
          }
          return candidate(row, "manual");
        },
        admit: ({ signal }) => {
          state.admissionCount += 1;
          refresh();
          if (state.scenario === "stall_once") {
            state.scenario = "match";
            return new Promise((resolve) => {
              signal.addEventListener(
                "abort",
                () => resolve("MUTATION_ADMISSION_UNAVAILABLE"),
                { once: true },
              );
            });
          }
          if (state.scenario === "controlled_match") {
            return new Promise((resolve) => {
              state.lateAdmissionResolve = resolve;
            });
          }
          return Promise.resolve("MATCH");
        },
        markAdmissionFailure: async (_owner, candidates) => {
          const row = state.row;
          if (!row) return 0;
          const current = candidates.find(
            (item) => item.id === row.id && item.revision === row.revision,
          );
          if (!current) return 0;
          row.status = "failed";
          if (current.mode === "automatic") {
            row.automaticAttemptConsumedRevision = row.revision;
          }
          state.markedForManualRecoveryCount += 1;
          refresh();
          return 1;
        },
        claimAutomatic: async (_owner, item) => {
          const claimed = claimFixtureRow(state, item, "automatic");
          if (claimed) state.automaticClaimCount += 1;
          refresh();
          return claimed;
        },
        claimManual: async (_owner, item) => {
          const claimed = claimFixtureRow(state, item, "manual");
          if (claimed) state.manualClaimCount += 1;
          refresh();
          return claimed;
        },
        syncClaimed: async () => {
          state.networkCount += 1;
          const row = state.row;
          if (state.scenario === "retry_after") {
            if (row) row.status = "failed";
            refresh();
            throw Object.assign(new Error("Synthetic Retry-After."), {
              retryAfterSeconds: 120,
              status: 429,
            });
          }
          if (row) row.status = "synced";
          refresh();
          return { readbackUrl: "/garden" };
        },
        withLease: async (_key, signal, operation) => {
          if (signal.aborted) throw abortError();
          state.leaseCount += 1;
          refresh();
          await operation();
        },
        monotonicNow: () => performance.now(),
      },
      onAdmissionResult: (result) => {
        state.lastAdmissionResult = result;
        refresh();
      },
      onReceipt: (receipt) => {
        state.receipts.push({ ...receipt, triggers: [...receipt.triggers] });
        refresh();
      },
    });
    coordinatorRef.current = coordinator;
    const removeTriggers = installForegroundAutosyncEventTriggers(coordinator);

    const controller: ForegroundAutosyncFixtureController = {
      beginAutomaticSignals() {
        emitAllAutomaticSignals(coordinator);
      },
      async cancelCurrentContext() {
        state.current = false;
        coordinator.dispose();
        await coordinator.whenIdle();
        refresh();
      },
      async coalesceAllSix() {
        emitAllAutomaticSignals(coordinator);
        const result = await settleManual(coordinator, state.row?.id);
        await coordinator.whenIdle();
        return result;
      },
      async completeAdmissionAfterContextChange() {
        state.current = false;
        state.lateAdmissionResolve?.("MATCH");
        state.lateAdmissionResolve = null;
        await coordinator.whenIdle();
        refresh();
      },
      async newRevision(scenario = "match") {
        await coordinator.whenIdle();
        const previousRevision = state.row?.revision ?? 0;
        state.row = {
          automaticAttemptConsumedRevision:
            state.row?.automaticAttemptConsumedRevision ?? null,
          id: SYNTHETIC_MUTATION_ID,
          revision: previousRevision + 1,
          status: "queued",
        };
        state.scenario = scenario;
        refresh();
        window.dispatchEvent(new Event("overgarden:offline-queue-changed"));
        await coordinator.whenIdle();
      },
      async prepare(scenario = "match") {
        await coordinator.whenIdle();
        resetFixtureState(state, scenario);
        refresh();
      },
      async runManual() {
        const result = await settleManual(coordinator, state.row?.id);
        await coordinator.whenIdle();
        return result;
      },
      snapshot: () => fixtureSnapshot(state),
      waitForIdle: () => coordinator.whenIdle(),
    };
    window.__ove289ForegroundAutosyncFixture = controller;

    return () => {
      removeTriggers();
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
      if (window.__ove289ForegroundAutosyncFixture === controller) {
        delete window.__ove289ForegroundAutosyncFixture;
      }
    };
  }, []);

  const incrementControl = (
    control: keyof ForegroundAutosyncFixtureSnapshot["controlCounts"],
  ) => {
    stateRef.current.controlCounts[control] += 1;
  };

  return (
    <main
      data-foreground-autosync-fixture="true"
      data-testid="foreground-autosync-fixture"
      lang={locale}
    >
      <h1>{copy.title}</h1>
      <nav aria-label={copy.navigation}>
        <button
          data-testid="foreground-autosync-navigation-control"
          onClick={() => incrementControl("navigation")}
          type="button"
        >
          {copy.navigation}
        </button>
      </nav>
      <button
        data-testid="foreground-autosync-editor-control"
        onClick={() => incrementControl("editor")}
        type="button"
      >
        {copy.editor}
      </button>
      <button
        data-testid="foreground-autosync-locale-control"
        onClick={() => incrementControl("locale")}
        type="button"
      >
        {copy.locale}
      </button>
      <button
        data-testid="foreground-autosync-manual-control"
        onClick={() => {
          incrementControl("manual");
          void settleManual(coordinatorRef.current, stateRef.current.row?.id);
        }}
        type="button"
      >
        {copy.manual}
      </button>
      <button
        data-testid="foreground-autosync-sign-out-control"
        onClick={() => incrementControl("signOut")}
        type="button"
      >
        {copy.signOut}
      </button>
      <output data-testid="foreground-autosync-row-status">{rowStatus}</output>
    </main>
  );
}

function createFixtureState(): FixtureState {
  return {
    admissionCount: 0,
    automaticClaimCount: 0,
    controlCounts: {
      editor: 0,
      locale: 0,
      manual: 0,
      navigation: 0,
      signOut: 0,
    },
    current: true,
    lateAdmissionResolve: null,
    lastAdmissionResult: null,
    leaseCount: 0,
    manualClaimCount: 0,
    markedForManualRecoveryCount: 0,
    networkCount: 0,
    receipts: [],
    row: null,
    scenario: "match",
  };
}

function resetFixtureState(state: FixtureState, scenario: FixtureScenario) {
  const fresh = createFixtureState();
  Object.assign(state, fresh, {
    row: {
      automaticAttemptConsumedRevision: null,
      id: SYNTHETIC_MUTATION_ID,
      revision: 1,
      status: "queued",
    } satisfies FixtureRow,
    scenario,
  });
}

function fixtureSnapshot(
  state: FixtureState,
): ForegroundAutosyncFixtureSnapshot {
  return structuredClone({
    admissionCount: state.admissionCount,
    automaticClaimCount: state.automaticClaimCount,
    controlCounts: state.controlCounts,
    lastAdmissionResult: state.lastAdmissionResult,
    leaseCount: state.leaseCount,
    manualClaimCount: state.manualClaimCount,
    markedForManualRecoveryCount: state.markedForManualRecoveryCount,
    networkCount: state.networkCount,
    receipts: state.receipts,
    row: state.row,
  });
}

function candidate(
  row: FixtureRow,
  mode: OfflineMutationSyncCandidate["mode"],
): OfflineMutationSyncCandidate {
  return { id: row.id, mode, revision: row.revision };
}

function claimFixtureRow(
  state: FixtureState,
  item: OfflineMutationSyncCandidate,
  mode: OfflineMutationSyncCandidate["mode"],
): OfflineMutation | undefined {
  const row = state.row;
  if (
    !row ||
    item.mode !== mode ||
    item.id !== row.id ||
    item.revision !== row.revision ||
    (row.status !== "queued" && (mode !== "manual" || row.status !== "failed"))
  ) {
    return undefined;
  }
  if (
    mode === "automatic" &&
    row.automaticAttemptConsumedRevision === row.revision
  ) {
    return undefined;
  }
  row.status = "syncing";
  if (mode === "automatic") {
    row.automaticAttemptConsumedRevision = row.revision;
  }
  return {
    automaticAttemptConsumedRevision: row.automaticAttemptConsumedRevision,
    createdAt: 1,
    id: row.id,
    idempotencyKey: `synthetic-revision-${row.revision}`,
    kind: "journal_entry",
    ownerUserId: SYNTHETIC_OWNER_ID,
    payload: {
      body: "Synthetic fixture body",
      clientMutationId: `synthetic-revision-${row.revision}`,
      entryDate: "2026-08-11",
      plantName: "Synthetic plant",
      title: "Synthetic fixture",
    },
    queueRevision: row.revision,
    status: "syncing",
    syncLeaseExpiresAt: 60_001,
    updatedAt: 2,
  };
}

function emitAllAutomaticSignals(
  coordinator: ForegroundAutosyncCoordinator<unknown>,
) {
  coordinator.request("initial_scan");
  window.dispatchEvent(new Event("overgarden:offline-queue-changed"));
  window.dispatchEvent(new Event("online"));
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
}

async function settleManual(
  coordinator: ForegroundAutosyncCoordinator<{ readbackUrl: string }> | null,
  mutationId: string | undefined,
): Promise<"rejected" | "synced"> {
  if (!coordinator) return "rejected";
  try {
    await coordinator.runManual(mutationId ?? SYNTHETIC_MUTATION_ID);
    return "synced";
  } catch {
    return "rejected";
  }
}

function abortError() {
  return new DOMException(
    "Synthetic fixture context was cancelled.",
    "AbortError",
  );
}
