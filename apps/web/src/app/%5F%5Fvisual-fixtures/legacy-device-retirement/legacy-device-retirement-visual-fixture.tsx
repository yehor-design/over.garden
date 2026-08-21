"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SignOutProvider } from "@/components/auth/sign-out-provider";
import { LegacyDeviceRetirementBanner } from "@/components/retirement/legacy-device-retirement-banner";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  assertKnownClientStorageAbsentTwice,
  browserKnownClientStorageEnvironment,
  deleteKnownIndexedDatabase,
  legacyOwnerDatabaseName,
  KnownClientStorageError,
  unregisterLegacyOverGardenServiceWorkers,
  type KnownClientStorageEnvironment,
} from "@/lib/retirement/known-client-storage";
import {
  createLegacyDeviceRetirementController,
  LegacyRetirementPortError,
  type LegacyDeviceRetirementPort,
  type LegacyRetirementIdentity,
  type LegacyRetirementItem,
} from "@/lib/retirement/legacy-device-retirement";

export type LegacyRetirementFixtureScenario =
  | "happy"
  | "blocked"
  | "unavailable"
  | "slow"
  | "another";

interface FixtureSnapshot {
  absenceReads: number;
  deleteAttempts: number;
  deleteSuccesses: number;
  independentActions: number;
  lateDeletes: number;
  sourcePresent: boolean;
  transferAttempts: number;
}

class FixtureProbe {
  constructor(scenario: LegacyRetirementFixtureScenario) {
    void scenario;
  }

  readonly #value: FixtureSnapshot = {
    absenceReads: 0,
    deleteAttempts: 0,
    deleteSuccesses: 0,
    independentActions: 0,
    lateDeletes: 0,
    sourcePresent: true,
    transferAttempts: 0,
  };

  read(): FixtureSnapshot {
    return { ...this.#value };
  }

  update(mutator: (value: FixtureSnapshot) => void): void {
    mutator(this.#value);
  }
}

interface LegacyRetirementFixtureController {
  closeBlockedHandle(): void;
  snapshot(): FixtureSnapshot;
}

declare global {
  interface Window {
    __ove322LegacyRetirementFixture?: LegacyRetirementFixtureController;
  }
}

const BINDING = "B".repeat(43);
const IDENTITY: LegacyRetirementIdentity = {
  ownerUserId: "00000000-0000-4000-8000-000000000322",
  ownerVaultBinding: BINDING,
  sessionGeneration: "S".repeat(43),
  documentMutationGeneration: "synthetic-document-generation",
};
const OWNER_DATABASE = legacyOwnerDatabaseName(BINDING);
const UNRELATED_DATABASE = "ove322-unrelated-app";
const UNRELATED_CACHE = "ove322-unrelated-cache";

export function LegacyDeviceRetirementVisualFixture({
  locale,
  scenario,
}: {
  locale: InterfaceLocale;
  scenario: LegacyRetirementFixtureScenario;
}) {
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState(false);
  const [independentActions, setIndependentActions] = useState(0);
  const blockedHandle = useRef<IDBDatabase | null>(null);
  const probe = useMemo(() => new FixtureProbe(scenario), [scenario]);

  useEffect(() => {
    let disposed = false;
    void seedFixtureStorage(scenario).then(
      ({ retainedHandle }) => {
        if (disposed) {
          retainedHandle?.close();
          return;
        }
        blockedHandle.current = retainedHandle;
        setSeeded(true);
      },
      () => {
        if (!disposed) setSeedError(true);
      },
    );
    return () => {
      disposed = true;
      blockedHandle.current?.close();
      blockedHandle.current = null;
      delete window.__ove322LegacyRetirementFixture;
    };
  }, [scenario]);

  const port = useMemo(
    () => createFixturePort(scenario, probe),
    [probe, scenario],
  );
  const controllerFactory = useMemo(
    () => async () =>
      createLegacyDeviceRetirementController({
        identity: IDENTITY,
        port,
        networkDeadlineMs: 30_000,
        storageDeadlineMs: 3_000,
      }),
    [port],
  );

  useEffect(() => {
    probe.update((snapshot) => {
      snapshot.independentActions = independentActions;
    });
  }, [independentActions, probe]);

  useEffect(() => {
    if (!seeded) return;
    window.__ove322LegacyRetirementFixture = {
      closeBlockedHandle() {
        blockedHandle.current?.close();
        blockedHandle.current = null;
      },
      snapshot: () => probe.read(),
    };
    return () => {
      delete window.__ove322LegacyRetirementFixture;
    };
  }, [probe, seeded]);

  if (seedError) {
    return <p role="alert">Synthetic retirement fixture could not start.</p>;
  }
  if (!seeded) {
    return <p role="status">Preparing synthetic retirement storage…</p>;
  }

  return (
    <SignOutProvider
      locale={locale}
      currentSessionBinding={IDENTITY.sessionGeneration}
    >
      <main
        data-legacy-retirement-fixture="true"
        className="mx-auto grid min-h-dvh max-w-5xl content-start gap-5 p-6"
      >
        <LegacyDeviceRetirementBanner
          locale={locale}
          ownerUserId={IDENTITY.ownerUserId}
          sessionGeneration={IDENTITY.sessionGeneration}
          documentMutationGeneration={IDENTITY.documentMutationGeneration}
          controllerFactory={controllerFactory}
        />
        <section className="grid gap-3 rounded-lg border p-4">
          <h1 className="font-semibold">
            Synthetic returning-device workspace
          </h1>
          <button
            type="button"
            data-testid="retirement-independent-action"
            onClick={() => setIndependentActions((value) => value + 1)}
          >
            Independent workspace action
          </button>
          <output data-testid="retirement-independent-count">
            {independentActions}
          </output>
        </section>
      </main>
    </SignOutProvider>
  );
}

function createFixturePort(
  scenario: LegacyRetirementFixtureScenario,
  probe: FixtureProbe,
): LegacyDeviceRetirementPort {
  const itemCount = scenario === "slow" ? 10_000 : 1;
  const items: LegacyRetirementItem[] = Array.from(
    { length: itemCount },
    (_, index) => ({
      token: `synthetic-${index}`,
      kind: index % 2 === 0 ? "draft" : "mutation",
      mediaIntentCount: index === 0 ? 1 : 0,
      updatedAt: 1_786_381_200_000,
    }),
  );
  const deleteSource = async (signal: AbortSignal) => {
    const environment = retirementEnvironment(scenario);
    probe.update((snapshot) => {
      snapshot.deleteAttempts += 1;
    });
    try {
      await deleteKnownIndexedDatabase(OWNER_DATABASE, environment, { signal });
      probe.update((snapshot) => {
        snapshot.deleteSuccesses += 1;
        snapshot.sourcePresent = false;
      });
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof KnownClientStorageError) {
        throw new LegacyRetirementPortError("deletion_blocked", error.code);
      }
      throw error;
    }
  };

  return {
    async inspect(_identity, signal) {
      throwIfAborted(signal);
      return {
        items: probe.read().sourcePresent ? items : [],
        bounded: false,
        foreignBindingCount: 0,
        foreignOwnerResidueCount: 0,
        capability:
          scenario === "unavailable"
            ? "enumeration_unavailable"
            : "enumeration_available",
      };
    },
    async assertSession(_identity, signal) {
      throwIfAborted(signal);
      return true;
    },
    async transferAndVerify(_item, _identity, signal) {
      probe.update((snapshot) => {
        snapshot.transferAttempts += 1;
      });
      if (scenario === "another") return { status: "another_account" };
      if (scenario === "slow") {
        return new Promise((resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Cancelled", "AbortError")),
            { once: true },
          );
          void resolve;
        });
      }
      throwIfAborted(signal);
      return { status: "verified" };
    },
    async deleteVerifiedBatch(_items, _identity, signal) {
      const before = probe.read().deleteSuccesses;
      await deleteSource(signal);
      if (signal.aborted && probe.read().deleteSuccesses > before) {
        probe.update((snapshot) => {
          snapshot.lateDeletes += 1;
        });
      }
    },
    async discardCurrentOwner(_items, _identity, signal) {
      await deleteSource(signal);
    },
    async finalize(_identity, signal) {
      throwIfAborted(signal);
      const environment = retirementEnvironment(scenario);
      await unregisterLegacyOverGardenServiceWorkers(environment);
      try {
        const receipt = await assertKnownClientStorageAbsentTwice(
          [OWNER_DATABASE],
          environment,
        );
        probe.update((snapshot) => {
          snapshot.absenceReads = receipt.absenceReads;
        });
        return {
          status: "completed",
          absenceReads: receipt.absenceReads,
          foreignOwnerResidue: false,
          foreignOrOrphanRetained: false,
        };
      } catch (error) {
        if (error instanceof KnownClientStorageError) {
          throw new LegacyRetirementPortError("deletion_blocked", error.code);
        }
        throw error;
      }
    },
  };
}

function retirementEnvironment(
  scenario: LegacyRetirementFixtureScenario,
): KnownClientStorageEnvironment {
  const environment = browserKnownClientStorageEnvironment();
  if (scenario !== "unavailable") return environment;
  return {
    ...environment,
    indexedDb: { ...environment.indexedDb, databases: undefined },
  };
}

async function seedFixtureStorage(scenario: LegacyRetirementFixtureScenario) {
  await deleteDatabase(OWNER_DATABASE);
  await deleteDatabase(UNRELATED_DATABASE);
  const retainedHandle = await createDatabase(
    OWNER_DATABASE,
    scenario === "blocked",
  );
  await createDatabase(UNRELATED_DATABASE, false);
  localStorage.setItem("ove322-unrelated-local-storage", "preserve");
  document.cookie = "ove322_unrelated_cookie=preserve; SameSite=Lax; Path=/";
  if ("caches" in window) {
    await caches.open(UNRELATED_CACHE);
  }
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  }
  return { retainedHandle };
}

function createDatabase(name: string, retain: boolean) {
  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("synthetic")) {
        request.result.createObjectStore("synthetic");
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("synthetic", "readwrite");
      transaction.objectStore("synthetic").put({ retained: true }, "row");
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        if (retain) resolve(database);
        else {
          database.close();
          resolve(null);
        }
      };
    };
  });
}

function deleteDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Synthetic database blocked."));
  });
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
}
