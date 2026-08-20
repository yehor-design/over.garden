"use client";

export const LEGACY_SHARED_DATABASE_NAME = "overgarden-offline" as const;
export const LEGACY_CONTROL_DATABASE_NAME = "overgarden-control-v1" as const;
export const LEGACY_OWNER_DATABASE_PREFIX =
  "overgarden-offline-owner-v1-" as const;
export const LEGACY_SERVICE_WORKER_PATH = "/sw.js" as const;

const OPAQUE_BINDING = /^[A-Za-z0-9_-]{43}$/;
const DEFAULT_DELETE_DEADLINE_MS = 3_000;

interface IndexedDatabaseInfoLike {
  name?: string;
}

interface IndexedDbDeleteRequestLike {
  onsuccess: ((...args: never[]) => unknown) | null;
  onerror: ((...args: never[]) => unknown) | null;
  onblocked: ((...args: never[]) => unknown) | null;
}

interface ServiceWorkerRegistrationLike {
  active?: { scriptURL: string } | null;
  installing?: { scriptURL: string } | null;
  waiting?: { scriptURL: string } | null;
  unregister(): Promise<boolean>;
}

export interface KnownClientStorageEnvironment {
  origin: string;
  indexedDb: {
    databases?: () => Promise<IndexedDatabaseInfoLike[]>;
    deleteDatabase(name: string): IndexedDbDeleteRequestLike;
  };
  caches: { keys(): Promise<string[]> };
  serviceWorker: {
    getRegistrations(): Promise<readonly ServiceWorkerRegistrationLike[]>;
  } | null;
}

export interface KnownClientStorageInventory {
  databaseEnumeration: "available" | "unavailable";
  databaseNames: string[];
  legacyServiceWorkerCount: number;
  unexpectedOverGardenCacheNames: string[];
}

export class KnownClientStorageError extends Error {
  constructor(readonly code: string) {
    super("Known OverGarden client storage could not be retired safely.");
    this.name = "KnownClientStorageError";
  }
}

export function isKnownOverGardenDatabaseName(value: unknown): value is string {
  if (
    value === LEGACY_SHARED_DATABASE_NAME ||
    value === LEGACY_CONTROL_DATABASE_NAME
  ) {
    return true;
  }
  if (
    typeof value !== "string" ||
    !value.startsWith(LEGACY_OWNER_DATABASE_PREFIX)
  ) {
    return false;
  }
  return OPAQUE_BINDING.test(value.slice(LEGACY_OWNER_DATABASE_PREFIX.length));
}

export function legacyOwnerDatabaseName(binding: string): string {
  if (!OPAQUE_BINDING.test(binding)) {
    throw new KnownClientStorageError("owner_binding_invalid");
  }
  return `${LEGACY_OWNER_DATABASE_PREFIX}${binding}`;
}

export function browserKnownClientStorageEnvironment(): KnownClientStorageEnvironment {
  if (typeof indexedDB === "undefined") {
    throw new KnownClientStorageError("indexeddb_unavailable");
  }
  const factory = indexedDB as IDBFactory & {
    databases?: () => Promise<IDBDatabaseInfo[]>;
  };
  return {
    origin:
      typeof window === "undefined" ? "" : new URL(window.location.href).origin,
    indexedDb: {
      databases:
        typeof factory.databases === "function"
          ? () => factory.databases!()
          : undefined,
      deleteDatabase: (name) => factory.deleteDatabase(name),
    },
    caches: {
      keys: () => {
        if (typeof caches === "undefined") {
          throw new KnownClientStorageError("cache_api_unavailable");
        }
        return caches.keys();
      },
    },
    serviceWorker:
      typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? {
            getRegistrations: () => navigator.serviceWorker.getRegistrations(),
          }
        : null,
  };
}

export async function inventoryKnownClientStorage(
  environment = browserKnownClientStorageEnvironment(),
): Promise<KnownClientStorageInventory> {
  const databaseInfos = environment.indexedDb.databases
    ? await environment.indexedDb.databases()
    : null;
  const databaseNames = (databaseInfos ?? [])
    .map(({ name }) => name)
    .filter(isKnownOverGardenDatabaseName)
    .sort();
  const registrations = environment.serviceWorker
    ? await environment.serviceWorker.getRegistrations()
    : [];
  const cacheNames = await environment.caches.keys();
  return {
    databaseEnumeration: databaseInfos ? "available" : "unavailable",
    databaseNames,
    legacyServiceWorkerCount: registrations.filter((registration) =>
      isLegacyServiceWorkerRegistration(registration, environment.origin),
    ).length,
    unexpectedOverGardenCacheNames: cacheNames
      .filter(isOverGardenCacheName)
      .sort(),
  };
}

export async function deleteKnownIndexedDatabase(
  name: string,
  environment = browserKnownClientStorageEnvironment(),
  options: { deadlineMs?: number; signal?: AbortSignal } = {},
): Promise<{ status: "delete_observed"; name: string }> {
  if (!isKnownOverGardenDatabaseName(name)) {
    throw new KnownClientStorageError("indexeddb_delete_target_forbidden");
  }
  if (options.signal?.aborted) throw abortError();
  const deadlineMs = boundedDeadline(options.deadlineMs);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      request.onsuccess = null;
      request.onerror = null;
      request.onblocked = null;
      outcome();
    };
    const abort = () => finish(() => reject(abortError()));
    const timeout = setTimeout(
      () =>
        finish(() =>
          reject(new KnownClientStorageError("indexeddb_delete_timeout")),
        ),
      deadlineMs,
    );
    const request = environment.indexedDb.deleteDatabase(name);
    request.onsuccess = () =>
      finish(() => resolve({ status: "delete_observed", name }));
    request.onerror = () =>
      finish(() =>
        reject(new KnownClientStorageError("indexeddb_delete_failed")),
      );
    request.onblocked = () =>
      finish(() =>
        reject(new KnownClientStorageError("indexeddb_delete_blocked")),
      );
    options.signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function unregisterLegacyOverGardenServiceWorkers(
  environment = browserKnownClientStorageEnvironment(),
): Promise<{ attempted: number; unregistered: number }> {
  if (!environment.serviceWorker) return { attempted: 0, unregistered: 0 };
  const registrations = await environment.serviceWorker.getRegistrations();
  const owned = registrations.filter((registration) =>
    isLegacyServiceWorkerRegistration(registration, environment.origin),
  );
  let unregistered = 0;
  for (const registration of owned) {
    if (await registration.unregister()) unregistered += 1;
  }
  if (unregistered !== owned.length) {
    throw new KnownClientStorageError("service_worker_unregister_failed");
  }
  return { attempted: owned.length, unregistered };
}

export async function assertKnownClientStorageAbsentTwice(
  expectedAbsentDatabaseNames: string[],
  environment = browserKnownClientStorageEnvironment(),
): Promise<{ status: "confirmed_absent"; absenceReads: 2 }> {
  const names = [...new Set(expectedAbsentDatabaseNames)];
  if (names.some((name) => !isKnownOverGardenDatabaseName(name))) {
    throw new KnownClientStorageError("absence_target_forbidden");
  }
  for (let read = 0; read < 2; read += 1) {
    const inventory = await inventoryKnownClientStorage(environment);
    if (inventory.databaseEnumeration !== "available") {
      throw new KnownClientStorageError("indexeddb_enumeration_unavailable");
    }
    if (
      names.some((name) => inventory.databaseNames.includes(name)) ||
      inventory.legacyServiceWorkerCount > 0 ||
      inventory.unexpectedOverGardenCacheNames.length > 0
    ) {
      throw new KnownClientStorageError("known_client_storage_present");
    }
    await Promise.resolve();
  }
  return { status: "confirmed_absent", absenceReads: 2 };
}

function isLegacyServiceWorkerRegistration(
  registration: ServiceWorkerRegistrationLike,
  expectedOrigin: string,
) {
  const urls = [
    registration.active?.scriptURL,
    registration.installing?.scriptURL,
    registration.waiting?.scriptURL,
  ].filter((value): value is string => typeof value === "string");
  return urls.some((value) => {
    try {
      const url = new URL(value);
      return (
        url.origin === expectedOrigin &&
        url.pathname === LEGACY_SERVICE_WORKER_PATH
      );
    } catch {
      return false;
    }
  });
}

function isOverGardenCacheName(name: string) {
  return /^overgarden(?:$|[-_.:])/i.test(name);
}

function boundedDeadline(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_DELETE_DEADLINE_MS;
  return Math.max(1, Math.min(DEFAULT_DELETE_DEADLINE_MS, Math.trunc(value!)));
}

function abortError() {
  return new DOMException("Known storage cleanup cancelled.", "AbortError");
}
