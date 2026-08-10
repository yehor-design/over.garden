export const SESSION_INVALIDATION_MARKER_STORAGE_KEY =
  "overgarden:session-invalidation:v1";

export type SessionInvalidationMarkerStatus =
  | "absent"
  | "present"
  | "unknown"
  | "unavailable";

export type SessionInvalidationMarkerPersistence =
  | "none"
  | "persistent"
  | "volatile_only"
  | "unavailable";

export interface SessionInvalidationMarkerRead {
  readonly status: SessionInvalidationMarkerStatus;
  readonly persistence: SessionInvalidationMarkerPersistence;
}

export type SessionInvalidationMarkerCommitResult = {
  status: "persisted" | "volatile_only" | "unavailable";
};

export type SessionInvalidationMarkerClearResult =
  | "cleared"
  | "absent"
  | "changed"
  | "unavailable";

type SnapshotState = {
  storageAvailable: boolean;
  storageValue: string | null;
  volatileGeneration: string | null;
};

type MarkerV1 = {
  v: 1;
  g: string;
};

const snapshots = new WeakMap<SessionInvalidationMarkerRead, SnapshotState>();
let volatileGeneration: string | null = null;
let volatileWindow: Window | null = null;

/**
 * Commit is deliberately synchronous. Callers use it before terminal
 * BroadcastChannel signalling and before their first await.
 */
export function commitSessionInvalidationMarker(): SessionInvalidationMarkerCommitResult {
  if (!prepareWindowScope()) return { status: "unavailable" };
  const current = readSessionInvalidationMarker();
  if (current.status === "present" || current.status === "unknown") {
    return {
      status:
        current.persistence === "persistent" ? "persisted" : "volatile_only",
    };
  }

  let generation: string;
  try {
    generation = createMarkerGeneration();
  } catch {
    return { status: "unavailable" };
  }
  volatileGeneration = generation;

  try {
    window.localStorage.setItem(
      SESSION_INVALIDATION_MARKER_STORAGE_KEY,
      serializeMarker({ v: 1, g: generation }),
    );
    return { status: "persisted" };
  } catch {
    return { status: "volatile_only" };
  }
}

/**
 * The public snapshot exposes only bounded classes. Byte-exact comparison
 * state remains module-private so it cannot accidentally enter receipts.
 */
export function readSessionInvalidationMarker(): SessionInvalidationMarkerRead {
  if (!prepareWindowScope()) {
    return snapshot("absent", "none", {
      storageAvailable: false,
      storageValue: null,
      volatileGeneration,
    });
  }

  let storageValue: string | null;
  try {
    storageValue = window.localStorage.getItem(
      SESSION_INVALIDATION_MARKER_STORAGE_KEY,
    );
  } catch {
    return snapshot(
      volatileGeneration ? "present" : "unavailable",
      volatileGeneration ? "volatile_only" : "unavailable",
      {
        storageAvailable: false,
        storageValue: null,
        volatileGeneration,
      },
    );
  }

  if (storageValue === null) {
    return snapshot(
      volatileGeneration ? "present" : "absent",
      volatileGeneration ? "volatile_only" : "none",
      {
        storageAvailable: true,
        storageValue,
        volatileGeneration,
      },
    );
  }

  const marker = parseMarker(storageValue);
  if (!marker) {
    return snapshot("unknown", "persistent", {
      storageAvailable: true,
      storageValue,
      volatileGeneration,
    });
  }

  volatileGeneration = marker.g;
  return snapshot("present", "persistent", {
    storageAvailable: true,
    storageValue,
    volatileGeneration,
  });
}

/**
 * Only a fresh authoritative document bootstrap may call this function. A
 * storage value or volatile generation that changed after capture wins.
 */
export function clearSessionInvalidationMarkerIfCurrent(
  captured: SessionInvalidationMarkerRead,
): SessionInvalidationMarkerClearResult {
  if (!prepareWindowScope()) return "unavailable";
  const state = snapshots.get(captured);
  if (!state) return "changed";

  if (!state.storageAvailable) {
    if (volatileGeneration !== state.volatileGeneration) return "changed";
    if (!volatileGeneration && captured.status === "absent") return "absent";
    volatileGeneration = null;
    return "cleared";
  }

  let currentStorageValue: string | null;
  try {
    currentStorageValue = window.localStorage.getItem(
      SESSION_INVALIDATION_MARKER_STORAGE_KEY,
    );
  } catch {
    return "unavailable";
  }

  if (
    currentStorageValue !== state.storageValue ||
    volatileGeneration !== state.volatileGeneration
  ) {
    return "changed";
  }

  if (currentStorageValue !== null) {
    try {
      window.localStorage.removeItem(SESSION_INVALIDATION_MARKER_STORAGE_KEY);
    } catch {
      return "unavailable";
    }
  }

  if (captured.status === "absent" && volatileGeneration === null) {
    return "absent";
  }
  volatileGeneration = null;
  return "cleared";
}

export function subscribeToSessionInvalidationMarker(
  listener: (snapshot: SessionInvalidationMarkerRead) => void,
) {
  if (typeof window === "undefined") return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_INVALIDATION_MARKER_STORAGE_KEY) return;
    listener(readSessionInvalidationMarker());
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

function snapshot(
  status: SessionInvalidationMarkerStatus,
  persistence: SessionInvalidationMarkerPersistence,
  state: SnapshotState,
): SessionInvalidationMarkerRead {
  const value = Object.freeze({ status, persistence });
  snapshots.set(value, state);
  return value;
}

function prepareWindowScope() {
  if (typeof window === "undefined") return false;
  if (volatileWindow !== window) {
    volatileWindow = window;
    volatileGeneration = null;
  }
  return true;
}

function serializeMarker(marker: MarkerV1) {
  return `{"v":1,"g":"${marker.g}"}`;
}

function parseMarker(value: string): MarkerV1 | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      record.v !== 1 ||
      typeof record.g !== "string" ||
      !/^[A-Za-z0-9_-]{22}$/.test(record.g)
    ) {
      return null;
    }
    return { v: 1, g: record.g };
  } catch {
    return null;
  }
}

function createMarkerGeneration() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

function encodeBase64Url(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const remaining = bytes.length - index;
    result += alphabet[a >> 2];
    result += alphabet[((a & 0x03) << 4) | (b >> 4)];
    if (remaining > 1) result += alphabet[((b & 0x0f) << 2) | (c >> 6)];
    if (remaining > 2) result += alphabet[c & 0x3f];
  }
  return result;
}
