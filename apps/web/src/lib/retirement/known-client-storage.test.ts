import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  assertKnownClientStorageAbsentTwice,
  deleteKnownIndexedDatabase,
  inventoryKnownClientStorage,
  isKnownOverGardenDatabaseName,
  planKnownClientStorageRetirement,
  retireKnownClientStorage,
  unregisterLegacyOverGardenServiceWorkers,
  type KnownClientStorageEnvironment,
  type LegacyControlRecord,
} from "./known-client-storage";

const RESOLVED_BINDING = "R".repeat(43);
const RETAINED_BINDING = "U".repeat(43);
const RESOLVED_OWNER_DATABASE = `overgarden-offline-owner-v1-${RESOLVED_BINDING}`;
const RETAINED_OWNER_DATABASE = `overgarden-offline-owner-v1-${RETAINED_BINDING}`;

describe("known legacy client storage", () => {
  it("is dependency-free and never imports the retired runtime", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./known-client-storage.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/dexie|@\/lib\/offline|legacy-device-work/i);
  });

  it("accepts only exact shared, control, and opaque owner database names", () => {
    expect(isKnownOverGardenDatabaseName("overgarden-offline")).toBe(true);
    expect(isKnownOverGardenDatabaseName("overgarden-control-v1")).toBe(true);
    expect(isKnownOverGardenDatabaseName(RESOLVED_OWNER_DATABASE)).toBe(true);
    expect(
      isKnownOverGardenDatabaseName("overgarden-offline-owner-v1-short"),
    ).toBe(false);
    expect(isKnownOverGardenDatabaseName("unrelated-app")).toBe(false);
  });

  it("plans owner deletion only for OVE-322 terminal control states", () => {
    expect(
      planKnownClientStorageRetirement(
        [
          "overgarden-offline",
          "overgarden-control-v1",
          RESOLVED_OWNER_DATABASE,
          RETAINED_OWNER_DATABASE,
        ],
        [
          controlRecord(RESOLVED_BINDING, "retirement_resolved"),
          controlRecord(RETAINED_BINDING, "active"),
        ],
      ),
    ).toEqual({
      deleteDatabaseNames: ["overgarden-offline", RESOLVED_OWNER_DATABASE],
      expectedAbsentDatabaseNames: [
        "overgarden-offline",
        RESOLVED_OWNER_DATABASE,
      ],
      unresolvedBindingCount: 1,
      preserveControlDatabase: true,
    });

    expect(
      planKnownClientStorageRetirement(
        ["overgarden-control-v1", RETAINED_OWNER_DATABASE],
        [controlRecord(RETAINED_BINDING, "foreign_or_orphan_retained")],
      ),
    ).toEqual({
      deleteDatabaseNames: [RETAINED_OWNER_DATABASE, "overgarden-control-v1"],
      expectedAbsentDatabaseNames: [
        RETAINED_OWNER_DATABASE,
        "overgarden-control-v1",
      ],
      unresolvedBindingCount: 0,
      preserveControlDatabase: false,
    });
  });

  it("retires exact resolved names and worker while preserving unrelated state", async () => {
    const environment = fakeEnvironment({
      databaseNames: [
        "overgarden-offline",
        "overgarden-control-v1",
        RESOLVED_OWNER_DATABASE,
        "unrelated-app",
      ],
      controlRecords: [controlRecord(RESOLVED_BINDING, "retirement_resolved")],
      cacheNames: ["unrelated-cache"],
      scriptUrls: [
        "https://over.garden/sw.js",
        "https://over.garden/unrelated-sw.js",
      ],
    });

    await expect(retireKnownClientStorage(environment)).resolves.toEqual({
      status: "absent",
      absenceReads: 2,
      deletedDatabaseCount: 3,
      unregisteredWorkerCount: 1,
      unresolvedBindingCount: 0,
    });
    expect(
      environment.indexedDb.deleteDatabase.mock.calls.map(([name]) => name),
    ).toEqual([
      "overgarden-offline",
      RESOLVED_OWNER_DATABASE,
      "overgarden-control-v1",
    ]);
    await expect(environment.indexedDb.databases!()).resolves.toEqual([
      { name: "unrelated-app" },
    ]);
    const registrations = await environment.serviceWorker!.getRegistrations();
    expect(registrations[0]!.unregister).toHaveBeenCalledOnce();
    expect(registrations[1]!.unregister).not.toHaveBeenCalled();
  });

  it("retains an unresolved owner binding and reports only a bounded count", async () => {
    const environment = fakeEnvironment({
      databaseNames: [
        "overgarden-offline",
        "overgarden-control-v1",
        RETAINED_OWNER_DATABASE,
      ],
      controlRecords: [controlRecord(RETAINED_BINDING, "active")],
    });

    await expect(retireKnownClientStorage(environment)).resolves.toEqual({
      status: "unresolved_retained",
      absenceReads: 2,
      deletedDatabaseCount: 1,
      unregisteredWorkerCount: 0,
      unresolvedBindingCount: 1,
    });
    expect(environment.indexedDb.deleteDatabase).toHaveBeenCalledOnce();
    expect(environment.indexedDb.deleteDatabase).toHaveBeenCalledWith(
      "overgarden-offline",
    );
    await expect(environment.indexedDb.databases!()).resolves.toEqual([
      { name: "overgarden-control-v1" },
      { name: RETAINED_OWNER_DATABASE },
    ]);
  });

  it("fails a blocked exact deletion without broadening the target", async () => {
    const environment = fakeEnvironment({
      databaseNames: ["overgarden-offline"],
      blockedDeleteNames: ["overgarden-offline"],
    });

    await expect(retireKnownClientStorage(environment)).rejects.toMatchObject({
      code: "indexeddb_delete_blocked",
    });
    expect(environment.indexedDb.deleteDatabase).toHaveBeenCalledTimes(1);
    expect(environment.indexedDb.deleteDatabase).toHaveBeenCalledWith(
      "overgarden-offline",
    );
  });

  it("refuses an app-looking cache because the exact owned cache set is empty", async () => {
    const environment = fakeEnvironment({
      databaseNames: [],
      cacheNames: ["overgarden-unknown-cache"],
    });

    await expect(retireKnownClientStorage(environment)).rejects.toMatchObject({
      code: "unexpected_overgarden_cache_present",
    });
    expect(environment.indexedDb.deleteDatabase).not.toHaveBeenCalled();
  });

  it("classifies exact names without reading journal content", async () => {
    const environment = fakeEnvironment({
      databaseNames: [
        "overgarden-offline",
        "overgarden-control-v1",
        RESOLVED_OWNER_DATABASE,
        "unrelated-app",
      ],
      cacheNames: ["unrelated-cache"],
      scriptUrls: [
        "https://over.garden/sw.js",
        "https://over.garden/unrelated-sw.js",
      ],
    });

    await expect(inventoryKnownClientStorage(environment)).resolves.toEqual({
      databaseEnumeration: "available",
      databaseNames: [
        "overgarden-control-v1",
        "overgarden-offline",
        RESOLVED_OWNER_DATABASE,
      ],
      legacyServiceWorkerCount: 1,
      unexpectedOverGardenCacheNames: [],
    });
  });

  it("requires two absence reads and stays inconclusive without enumeration", async () => {
    const environment = fakeEnvironment({ databaseNames: ["unrelated-app"] });
    await expect(
      assertKnownClientStorageAbsentTwice(
        ["overgarden-offline", RESOLVED_OWNER_DATABASE],
        environment,
      ),
    ).resolves.toEqual({ status: "confirmed_absent", absenceReads: 2 });

    environment.indexedDb.databases = undefined;
    await expect(retireKnownClientStorage(environment)).rejects.toMatchObject({
      code: "indexeddb_enumeration_unavailable",
    });
  });

  it("keeps low-level exact deletion and worker boundaries", async () => {
    const environment = fakeEnvironment({
      databaseNames: [RESOLVED_OWNER_DATABASE],
      scriptUrls: [
        "https://over.garden/sw.js",
        "https://over.garden/unrelated-sw.js",
        "https://other.example/sw.js",
      ],
    });
    await expect(
      deleteKnownIndexedDatabase(RESOLVED_OWNER_DATABASE, environment),
    ).resolves.toEqual({
      status: "delete_observed",
      name: RESOLVED_OWNER_DATABASE,
    });
    await expect(
      unregisterLegacyOverGardenServiceWorkers(environment),
    ).resolves.toEqual({ attempted: 1, unregistered: 1 });
  });
});

function controlRecord(
  binding: string,
  state: LegacyControlRecord["state"],
): LegacyControlRecord {
  return { binding, state };
}

function fakeEnvironment(input: {
  databaseNames?: string[];
  blockedDeleteNames?: string[];
  cacheNames?: string[];
  scriptUrls?: string[];
  controlRecords?: LegacyControlRecord[];
}): KnownClientStorageEnvironment & {
  indexedDb: KnownClientStorageEnvironment["indexedDb"] & {
    databases: ReturnType<typeof vi.fn> | undefined;
    deleteDatabase: ReturnType<typeof vi.fn>;
    readControlRecords: ReturnType<typeof vi.fn>;
  };
  caches: { keys: ReturnType<typeof vi.fn> };
  serviceWorker: { getRegistrations: ReturnType<typeof vi.fn> };
} {
  const databaseNames = [...(input.databaseNames ?? [])];
  const blocked = new Set(input.blockedDeleteNames ?? []);
  const registrations = (input.scriptUrls ?? []).map((scriptURL) => {
    const registration: {
      active: { scriptURL: string } | null;
      installing: null;
      waiting: null;
      unregister: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
    } = {
      active: { scriptURL },
      installing: null,
      waiting: null,
      unregister: vi.fn(async (): Promise<boolean> => {
        registration.active = null;
        return true;
      }),
    };
    return registration;
  });
  const deleteDatabase = vi.fn((name: string) => {
    const request: {
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
      onblocked: (() => void) | null;
    } = { onsuccess: null, onerror: null, onblocked: null };
    queueMicrotask(() => {
      if (blocked.has(name)) {
        request.onblocked?.();
        return;
      }
      const index = databaseNames.indexOf(name);
      if (index >= 0) databaseNames.splice(index, 1);
      request.onsuccess?.();
    });
    return request;
  });
  return {
    origin: "https://over.garden",
    indexedDb: {
      databases: vi.fn(async () => databaseNames.map((name) => ({ name }))),
      deleteDatabase,
      readControlRecords: vi.fn(async () => [...(input.controlRecords ?? [])]),
    },
    caches: { keys: vi.fn(async () => [...(input.cacheNames ?? [])]) },
    serviceWorker: {
      getRegistrations: vi.fn(async () => registrations),
    },
  };
}
