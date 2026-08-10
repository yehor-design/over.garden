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

export type SessionInvalidationMarkerKind =
  | "none"
  | "terminal_invalidation"
  | "local_exit"
  | "unknown";

export interface SessionInvalidationMarkerRead {
  readonly status: SessionInvalidationMarkerStatus;
  readonly persistence: SessionInvalidationMarkerPersistence;
  readonly kind: SessionInvalidationMarkerKind;
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
  volatileKind: Exclude<
    SessionInvalidationMarkerKind,
    "none" | "unknown"
  > | null;
};

type MarkerV1 = {
  v: 1;
  g: string;
};

type LocalExitMarkerV2 = {
  v: 2;
  k: "local_exit";
  g: string;
};

type StoredMarker = MarkerV1 | LocalExitMarkerV2;

const snapshots = new WeakMap<SessionInvalidationMarkerRead, SnapshotState>();
let volatileGeneration: string | null = null;
let volatileKind: SnapshotState["volatileKind"] = null;
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
  volatileKind = "terminal_invalidation";

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
 * Commit the retain-only local-exit terminal variant in the OVE-286 marker
 * store. The returned snapshot is the only capability that may compare-clear
 * this exact generation after a reconciliation response.
 */
export function commitLocalExitInvalidationMarker(): SessionInvalidationMarkerCommitResult & {
  readonly marker: SessionInvalidationMarkerRead;
} {
  if (!prepareWindowScope()) {
    return {
      status: "unavailable",
      marker: readSessionInvalidationMarker(),
    };
  }
  const current = readSessionInvalidationMarker();
  if (current.kind === "local_exit" || current.status === "unknown") {
    return {
      status:
        current.persistence === "persistent" ? "persisted" : "volatile_only",
      marker: current,
    };
  }

  let generation: string;
  try {
    generation = createMarkerGeneration();
  } catch {
    return { status: "unavailable", marker: current };
  }
  volatileGeneration = generation;
  volatileKind = "local_exit";

  let status: SessionInvalidationMarkerCommitResult["status"] = "volatile_only";
  try {
    window.localStorage.setItem(
      SESSION_INVALIDATION_MARKER_STORAGE_KEY,
      serializeMarker({ v: 2, k: "local_exit", g: generation }),
    );
    status = "persisted";
  } catch {
    // The current document remains terminal through the volatile generation.
  }
  return { status, marker: readSessionInvalidationMarker() };
}

/**
 * The public snapshot exposes only bounded classes. Byte-exact comparison
 * state remains module-private so it cannot accidentally enter receipts.
 */
export function readSessionInvalidationMarker(): SessionInvalidationMarkerRead {
  if (!prepareWindowScope()) {
    return snapshot("absent", "none", "none", {
      storageAvailable: false,
      storageValue: null,
      volatileGeneration,
      volatileKind,
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
      volatileGeneration ? (volatileKind ?? "unknown") : "unknown",
      {
        storageAvailable: false,
        storageValue: null,
        volatileGeneration,
        volatileKind,
      },
    );
  }

  if (storageValue === null) {
    return snapshot(
      volatileGeneration ? "present" : "absent",
      volatileGeneration ? "volatile_only" : "none",
      volatileGeneration ? (volatileKind ?? "unknown") : "none",
      {
        storageAvailable: true,
        storageValue,
        volatileGeneration,
        volatileKind,
      },
    );
  }

  const marker = parseMarker(storageValue);
  if (!marker) {
    return snapshot("unknown", "persistent", "unknown", {
      storageAvailable: true,
      storageValue,
      volatileGeneration,
      volatileKind,
    });
  }

  volatileGeneration = marker.g;
  volatileKind = marker.v === 2 ? "local_exit" : "terminal_invalidation";
  return snapshot("present", "persistent", volatileKind, {
    storageAvailable: true,
    storageValue,
    volatileGeneration,
    volatileKind,
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
    volatileKind = null;
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
  volatileKind = null;
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
  kind: SessionInvalidationMarkerKind,
  state: SnapshotState,
): SessionInvalidationMarkerRead {
  const value = Object.freeze({ status, persistence, kind });
  snapshots.set(value, state);
  return value;
}

function prepareWindowScope() {
  if (typeof window === "undefined") return false;
  if (volatileWindow !== window) {
    volatileWindow = window;
    volatileGeneration = null;
    volatileKind = null;
  }
  return true;
}

function serializeMarker(marker: StoredMarker) {
  return marker.v === 1
    ? `{"v":1,"g":"${marker.g}"}`
    : `{"v":2,"k":"local_exit","g":"${marker.g}"}`;
}

function parseMarker(value: string): StoredMarker | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.g !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(record.g)) {
      return null;
    }
    if (Object.keys(record).length === 2 && record.v === 1) {
      return { v: 1, g: record.g };
    }
    if (
      Object.keys(record).length === 3 &&
      record.v === 2 &&
      record.k === "local_exit"
    ) {
      return { v: 2, k: "local_exit", g: record.g };
    }
    return null;
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
