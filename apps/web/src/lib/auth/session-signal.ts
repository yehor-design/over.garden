import {
  OWNER_USER_ID_DOCUMENT_ATTRIBUTE,
  OWNER_USER_ID_HEADER,
  SESSION_SIGNAL_CHANNEL,
  normalizeOwnerUserId,
  type SessionSignal,
} from "@/lib/auth/owner-scope-contract";

const STORAGE_KEY = "overgarden-session-signal";

/** Identifies this tab so it can ignore the signals it sent itself. */
export const SESSION_SIGNAL_TAB_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/** The owner the server rendered this document for, or null for a guest. */
export function readRenderedOwnerUserId(): string | null {
  if (typeof document === "undefined") return null;
  return normalizeOwnerUserId(
    document.documentElement.getAttribute(OWNER_USER_ID_DOCUMENT_ATTRIBUTE),
  );
}

/** Headers a fetch mutation adds so the server can compare the rendered owner. */
export function ownerScopeHeaders(
  ownerUserId: string | null = readRenderedOwnerUserId(),
): Record<string, string> {
  return ownerUserId ? { [OWNER_USER_ID_HEADER]: ownerUserId } : {};
}

/**
 * Tells every other tab of this browser that the account changed. Tabs react
 * by reloading to the home page (D6): unsaved text is lost by design.
 */
export function announceSessionSignal(input: {
  type: SessionSignal["type"];
  ownerUserId: string | null;
}): void {
  if (typeof window === "undefined") return;
  const signal: SessionSignal = {
    ...input,
    sourceTabId: SESSION_SIGNAL_TAB_ID,
  };
  try {
    const channel = new BroadcastChannel(SESSION_SIGNAL_CHANNEL);
    channel.postMessage(signal);
    channel.close();
  } catch {
    // BroadcastChannel unavailable; the storage fallback below still fires.
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...signal, at: Date.now() }),
    );
  } catch {
    // Storage may be blocked; the BroadcastChannel path already ran.
  }
}

export function subscribeSessionSignals(
  listener: (signal: SessionSignal) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(SESSION_SIGNAL_CHANNEL);
    channel.onmessage = (event) => {
      const signal = parseSessionSignal(event.data);
      if (signal && signal.sourceTabId !== SESSION_SIGNAL_TAB_ID)
        listener(signal);
    };
  } catch {
    channel = null;
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const signal = parseSessionSignal(JSON.parse(event.newValue));
      if (signal && signal.sourceTabId !== SESSION_SIGNAL_TAB_ID)
        listener(signal);
    } catch {
      // Ignore malformed values written by another origin script.
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}

function parseSessionSignal(value: unknown): SessionSignal | null {
  if (!value || typeof value !== "object") return null;
  const record = value as {
    type?: unknown;
    ownerUserId?: unknown;
    sourceTabId?: unknown;
  };
  if (record.type !== "signed_in" && record.type !== "signed_out") return null;
  return {
    type: record.type,
    ownerUserId: normalizeOwnerUserId(
      typeof record.ownerUserId === "string" ? record.ownerUserId : null,
    ),
    sourceTabId:
      typeof record.sourceTabId === "string" ? record.sourceTabId : "",
  };
}
