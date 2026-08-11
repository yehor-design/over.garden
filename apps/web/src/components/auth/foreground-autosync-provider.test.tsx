import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const coordinator = {
    dispose: vi.fn(),
    request: vi.fn(),
    runManual: vi.fn(async () => ({ readbackUrl: "/garden" })),
    whenIdle: vi.fn(async () => undefined),
  };
  return {
    activeOwner: "00000000-0000-4000-8000-0000000000a1" as string | null,
    admissionHandler: vi.fn(),
    confirmContinuity: vi.fn(async () => "MATCH" as const),
    coordinator,
    createCoordinator: vi.fn(
      (input: {
        dependencies: {
          admit(input: {
            deadlineMs: number;
            documentMutationGeneration: string;
            signal: AbortSignal;
          }): Promise<string>;
        };
        documentMutationGeneration: string;
        isCurrent(): boolean;
        onAdmissionResult?(result: string): void;
        ownerUserId: string;
      }) => {
        void input;
        return coordinator;
      },
    ),
    directSync: vi.fn(async () => ({ readbackUrl: "/garden" })),
    getMutation: vi.fn(async () => ({
      id: "queued-mutation",
      ownerUserId: "00000000-0000-4000-8000-0000000000a1",
    })),
    installTriggers: vi.fn(() => vi.fn()),
  };
});

vi.mock("@/lib/offline/foreground-autosync", () => ({
  FOREGROUND_AUTOSYNC_ADMISSION_DEADLINE_MS: 3_000,
  ForegroundAutosyncIneligibleError: class extends Error {
    constructor() {
      super("ineligible");
      this.name = "ForegroundAutosyncIneligibleError";
    }
  },
  createForegroundAutosyncCoordinator: mocks.createCoordinator,
  installForegroundAutosyncEventTriggers: mocks.installTriggers,
  withForegroundAutosyncLease: vi.fn(),
}));

vi.mock("@/lib/offline/journal-entry-sync", () => ({
  syncClaimedOfflineJournalEntryMutation: vi.fn(),
  syncOfflineJournalEntryMutation: mocks.directSync,
}));

vi.mock("@/lib/offline/queue", () => ({
  claimOfflineMutationForAutomaticSync: vi.fn(),
  claimOfflineMutationForManualSync: vi.fn(),
  getOfflineMutation: mocks.getMutation,
  getOfflineMutationManualSyncCandidate: vi.fn(),
  listOfflineMutationsEligibleForAutomaticSync: vi.fn(),
  markOfflineMutationsForManualRecovery: vi.fn(),
  recoverExpiredOfflineMutationSyncClaims: vi.fn(),
}));

vi.mock("@/lib/offline/owner-vault", () => ({
  readActiveOwnerUserId: () => mocks.activeOwner,
}));

vi.mock("./document-mutation-recovery", () => ({
  confirmDocumentMutationOwnerContinuity: mocks.confirmContinuity,
  useOptionalDocumentMutationGeneration: () => ({
    handleTransportResult: mocks.admissionHandler,
  }),
}));

import {
  ForegroundAutosyncProvider,
  useOptionalForegroundAutosync,
} from "./foreground-autosync-provider";

interface AutosyncContext {
  runManualMutation(mutationId: string): Promise<{ readbackUrl: string }>;
}

function Probe({ onReady }: { onReady(value: AutosyncContext | null): void }) {
  onReady(useOptionalForegroundAutosync());
  return <span>fixture child</span>;
}

describe("foreground autosync provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.activeOwner = "00000000-0000-4000-8000-0000000000a1";
    mocks.createCoordinator.mockReturnValue(mocks.coordinator);
    mocks.installTriggers.mockReturnValue(vi.fn());
  });

  it("mounts one exact owner/document coordinator and routes manual action through it", async () => {
    let current: AutosyncContext | null = null;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ForegroundAutosyncProvider
          documentMutationGeneration="opaque-generation"
          enabled={true}
        >
          <Probe onReady={(value) => (current = value)} />
        </ForegroundAutosyncProvider>,
      );
    });

    expect(mocks.createCoordinator).toHaveBeenCalledOnce();
    const input = mocks.createCoordinator.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      documentMutationGeneration: "opaque-generation",
      ownerUserId: mocks.activeOwner,
    });
    expect(mocks.installTriggers).toHaveBeenCalledWith(mocks.coordinator);
    const context = current as AutosyncContext | null;
    if (!context) throw new Error("Expected the autosync context.");
    await expect(context.runManualMutation("queued-mutation")).resolves.toEqual(
      { readbackUrl: "/garden" },
    );
    expect(mocks.coordinator.runManual).toHaveBeenCalledWith("queued-mutation");
    expect(mocks.directSync).not.toHaveBeenCalled();

    expect(input?.isCurrent()).toBe(true);
    mocks.activeOwner = "00000000-0000-4000-8000-0000000000b2";
    expect(input?.isCurrent()).toBe(false);

    await act(async () => renderer.unmount());
    expect(mocks.coordinator.dispose).toHaveBeenCalledOnce();
  });

  it("fails closed without a current generation instead of creating a direct sync path", async () => {
    let current: AutosyncContext | null = null;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ForegroundAutosyncProvider
          documentMutationGeneration={null}
          enabled={true}
        >
          <Probe onReady={(value) => (current = value)} />
        </ForegroundAutosyncProvider>,
      );
    });

    expect(mocks.createCoordinator).not.toHaveBeenCalled();
    const context = current as AutosyncContext | null;
    if (!context) throw new Error("Expected the autosync context.");
    await expect(
      context.runManualMutation("queued-mutation"),
    ).rejects.toHaveProperty("name", "ForegroundAutosyncIneligibleError");
    expect(mocks.getMutation).not.toHaveBeenCalled();
    expect(mocks.directSync).not.toHaveBeenCalled();

    await act(async () => renderer.unmount());
  });

  it("shares the exact 3000 ms OVE-290 adapter and forwards degraded results", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ForegroundAutosyncProvider
          documentMutationGeneration="opaque-generation"
          enabled={true}
        >
          <span>child</span>
        </ForegroundAutosyncProvider>,
      );
    });
    const input = mocks.createCoordinator.mock.calls[0]?.[0];
    const signal = new AbortController().signal;

    await expect(
      input?.dependencies.admit({
        deadlineMs: 3_000,
        documentMutationGeneration: "opaque-generation",
        signal,
      }),
    ).resolves.toBe("MATCH");
    expect(mocks.confirmContinuity).toHaveBeenCalledWith(
      "opaque-generation",
      signal,
    );
    input?.onAdmissionResult?.("MUTATION_ADMISSION_UNAVAILABLE");
    expect(mocks.admissionHandler).toHaveBeenCalledWith(
      "MUTATION_ADMISSION_UNAVAILABLE",
    );

    await act(async () => renderer.unmount());
  });
});
