import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  assertKnownClientStorageAbsentTwice,
  deleteKnownIndexedDatabase,
  inventoryKnownClientStorage,
  isKnownOverGardenDatabaseName,
  unregisterLegacyOverGardenServiceWorkers,
  type KnownClientStorageEnvironment,
} from "./known-client-storage";

const BINDING = "B".repeat(43);
const OWNER_DATABASE = `overgarden-offline-owner-v1-${BINDING}`;

describe("known legacy client storage", () => {
  it("is dependency-free and never imports the retired Dexie runtime", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./known-client-storage.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/dexie|@\/lib\/offline/i);
  });

  it("accepts only the exact shared, control, and opaque owner database names", () => {
    expect(isKnownOverGardenDatabaseName("overgarden-offline")).toBe(true);
    expect(isKnownOverGardenDatabaseName("overgarden-control-v1")).toBe(true);
    expect(isKnownOverGardenDatabaseName(OWNER_DATABASE)).toBe(true);
    expect(
      isKnownOverGardenDatabaseName("overgarden-offline-owner-v1-short"),
    ).toBe(false);
    expect(isKnownOverGardenDatabaseName("unrelated-app")).toBe(false);
  });

  it("classifies exact names without reading database content", async () => {
    const environment = fakeEnvironment({
      databaseNames: [
        "overgarden-offline",
        "overgarden-control-v1",
        OWNER_DATABASE,
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
        OWNER_DATABASE,
      ],
      legacyServiceWorkerCount: 1,
      unexpectedOverGardenCacheNames: [],
    });
  });

  it("fails a blocked exact database deletion without broadening the target", async () => {
    const environment = fakeEnvironment({
      databaseNames: [OWNER_DATABASE],
      blockedDeleteNames: [OWNER_DATABASE],
    });

    await expect(
      deleteKnownIndexedDatabase(OWNER_DATABASE, environment, {
        deadlineMs: 20,
      }),
    ).rejects.toMatchObject({ code: "indexeddb_delete_blocked" });
    expect(environment.indexedDb.deleteDatabase).toHaveBeenCalledTimes(1);
    expect(environment.indexedDb.deleteDatabase).toHaveBeenCalledWith(
      OWNER_DATABASE,
    );
  });

  it("unregisters only the same-origin exact /sw.js registration", async () => {
    const environment = fakeEnvironment({
      scriptUrls: [
        "https://over.garden/sw.js",
        "https://over.garden/unrelated-sw.js",
        "https://other.example/sw.js",
      ],
    });

    await expect(
      unregisterLegacyOverGardenServiceWorkers(environment),
    ).resolves.toEqual({ attempted: 1, unregistered: 1 });
    const registrations = await environment.serviceWorker!.getRegistrations();
    expect(registrations[0]!.unregister).toHaveBeenCalledOnce();
    expect(registrations[1]!.unregister).not.toHaveBeenCalled();
    expect(registrations[2]!.unregister).not.toHaveBeenCalled();
  });

  it("requires two consecutive absence reads and leaves unrelated state alone", async () => {
    const environment = fakeEnvironment({
      databaseNames: ["unrelated-app"],
      cacheNames: ["unrelated-cache"],
      scriptUrls: ["https://over.garden/unrelated-sw.js"],
    });

    await expect(
      assertKnownClientStorageAbsentTwice(
        ["overgarden-offline", OWNER_DATABASE],
        environment,
      ),
    ).resolves.toEqual({ status: "confirmed_absent", absenceReads: 2 });
    expect(environment.indexedDb.databases).toHaveBeenCalledTimes(2);
    expect(environment.caches.keys).toHaveBeenCalledTimes(2);
    expect(environment.serviceWorker!.getRegistrations).toHaveBeenCalledTimes(
      2,
    );
  });

  it("stays inconclusive when database enumeration is unavailable", async () => {
    const environment = fakeEnvironment({ databaseNames: [] });
    environment.indexedDb.databases = undefined;

    await expect(
      assertKnownClientStorageAbsentTwice(["overgarden-offline"], environment),
    ).rejects.toMatchObject({ code: "indexeddb_enumeration_unavailable" });
  });
});

function fakeEnvironment(input: {
  databaseNames?: string[];
  blockedDeleteNames?: string[];
  cacheNames?: string[];
  scriptUrls?: string[];
}): KnownClientStorageEnvironment & {
  indexedDb: KnownClientStorageEnvironment["indexedDb"] & {
    databases: ReturnType<typeof vi.fn> | undefined;
    deleteDatabase: ReturnType<typeof vi.fn>;
  };
  caches: { keys: ReturnType<typeof vi.fn> };
  serviceWorker: {
    getRegistrations: ReturnType<typeof vi.fn>;
  };
} {
  const databaseNames = [...(input.databaseNames ?? [])];
  const blocked = new Set(input.blockedDeleteNames ?? []);
  const registrations = (input.scriptUrls ?? []).map((scriptURL) => ({
    active: { scriptURL },
    installing: null,
    waiting: null,
    unregister: vi.fn().mockResolvedValue(true),
  }));
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
    },
    caches: { keys: vi.fn(async () => [...(input.cacheNames ?? [])]) },
    serviceWorker: {
      getRegistrations: vi.fn(async () => registrations),
    },
  };
}
