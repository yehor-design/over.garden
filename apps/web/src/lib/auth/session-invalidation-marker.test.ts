import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("session invalidation marker", () => {
  it("commits one exact payload-free generation idempotently", async () => {
    const storage = new TestStorage();
    installWindow(storage);
    const marker = await loadMarker();

    expect(marker.commitSessionInvalidationMarker()).toEqual({
      status: "persisted",
    });
    const firstValue = storage.getItem(
      marker.SESSION_INVALIDATION_MARKER_STORAGE_KEY,
    );
    expect(firstValue).toMatch(/^\{"v":1,"g":"[A-Za-z0-9_-]{22}"\}$/);

    expect(marker.commitSessionInvalidationMarker()).toEqual({
      status: "persisted",
    });
    expect(
      storage.getItem(marker.SESSION_INVALIDATION_MARKER_STORAGE_KEY),
    ).toBe(firstValue);
    expect(firstValue).not.toMatch(
      /owner|user|session|email|provider|route|locale|content|timestamp|token|cookie|latitude|longitude/i,
    );

    const snapshot = marker.readSessionInvalidationMarker();
    expect(snapshot.status).toBe("present");
    expect(marker.clearSessionInvalidationMarkerIfCurrent(snapshot)).toBe(
      "cleared",
    );
    expect(marker.readSessionInvalidationMarker().status).toBe("absent");
  });

  it("keeps a volatile terminal generation when storage is denied", async () => {
    installWindow(new ThrowingStorage());
    const marker = await loadMarker();

    expect(marker.commitSessionInvalidationMarker()).toEqual({
      status: "volatile_only",
    });
    expect(marker.commitSessionInvalidationMarker()).toEqual({
      status: "volatile_only",
    });
    expect(marker.readSessionInvalidationMarker()).toMatchObject({
      status: "present",
      persistence: "volatile_only",
    });
  });

  it("treats malformed and unknown versions as terminal until exact bootstrap clear", async () => {
    const storage = new TestStorage();
    installWindow(storage);
    const marker = await loadMarker();

    for (const raw of ["not-json", '{"v":2,"g":"opaque"}']) {
      storage.setItem(marker.SESSION_INVALIDATION_MARKER_STORAGE_KEY, raw);
      const snapshot = marker.readSessionInvalidationMarker();
      expect(snapshot).toMatchObject({
        status: "unknown",
        persistence: "persistent",
      });
      expect(marker.clearSessionInvalidationMarkerIfCurrent(snapshot)).toBe(
        "cleared",
      );
      expect(marker.readSessionInvalidationMarker().status).toBe("absent");
    }
  });

  it("refuses to clear a newer generation committed during bootstrap", async () => {
    const storage = new TestStorage();
    installWindow(storage);
    const marker = await loadMarker();
    marker.commitSessionInvalidationMarker();
    const captured = marker.readSessionInvalidationMarker();
    const newer = '{"v":1,"g":"BBBBBBBBBBBBBBBBBBBBBB"}';
    storage.setItem(marker.SESSION_INVALIDATION_MARKER_STORAGE_KEY, newer);

    expect(marker.clearSessionInvalidationMarkerIfCurrent(captured)).toBe(
      "changed",
    );
    expect(
      storage.getItem(marker.SESSION_INVALIDATION_MARKER_STORAGE_KEY),
    ).toBe(newer);
  });

  it("notifies only for the dedicated persistent marker key", async () => {
    const storage = new TestStorage();
    const listeners = installWindow(storage);
    const marker = await loadMarker();
    const listener = vi.fn();
    const unsubscribe = marker.subscribeToSessionInvalidationMarker(listener);

    listeners.emitStorage("unrelated", "value");
    expect(listener).not.toHaveBeenCalled();

    storage.setItem(
      marker.SESSION_INVALIDATION_MARKER_STORAGE_KEY,
      '{"v":1,"g":"CCCCCCCCCCCCCCCCCCCCCC"}',
    );
    listeners.emitStorage(
      marker.SESSION_INVALIDATION_MARKER_STORAGE_KEY,
      storage.getItem(marker.SESSION_INVALIDATION_MARKER_STORAGE_KEY),
    );
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ status: "present" });

    unsubscribe();
  });
});

async function loadMarker() {
  return import("./session-invalidation-marker");
}

function installWindow(storage: Storage) {
  const storageListeners = new Set<(event: StorageEvent) => void>();
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener(type: string, listener: (event: StorageEvent) => void) {
      if (type === "storage") storageListeners.add(listener);
    },
    removeEventListener(type: string, listener: (event: StorageEvent) => void) {
      if (type === "storage") storageListeners.delete(listener);
    },
  });
  return {
    emitStorage(key: string, newValue: string | null) {
      for (const listener of storageListeners) {
        listener({ key, newValue } as StorageEvent);
      }
    },
  };
}

class TestStorage implements Storage {
  protected readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

class ThrowingStorage extends TestStorage {
  override getItem(): string | null {
    throw new DOMException("denied", "SecurityError");
  }
  override removeItem(): void {
    throw new DOMException("denied", "SecurityError");
  }
  override setItem(): void {
    throw new DOMException("denied", "SecurityError");
  }
}
