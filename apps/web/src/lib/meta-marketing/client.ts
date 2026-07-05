"use client";

import {
  META_MARKETING_CONSENT_EVENT,
  META_MARKETING_CONSENT_STORAGE_KEY,
  isMetaMarketingEventName,
  normalizeMetaMarketingConsent,
  resolveMetaMarketingPublicConfig,
  type MetaMarketingConsent,
  type MetaMarketingEventName,
} from "./events";

type MetaPixelFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: MetaPixelFn;
  }
}

interface TrackMetaMarketingEventOptions {
  eventId?: string;
  browserPixel?: boolean;
  conversionsApi?: boolean;
}

export interface TrackMetaMarketingEventResult {
  eventId: string | null;
  browserPixelSent: boolean;
  conversionsApiQueued: boolean;
  skippedReason: string | null;
}

export function readStoredMetaMarketingConsent(): MetaMarketingConsent {
  if (typeof window === "undefined") return "undecided";

  try {
    return normalizeMetaMarketingConsent(
      window.localStorage.getItem(META_MARKETING_CONSENT_STORAGE_KEY),
    );
  } catch {
    return "undecided";
  }
}

export function writeStoredMetaMarketingConsent(
  consent: Exclude<MetaMarketingConsent, "undecided">,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(META_MARKETING_CONSENT_STORAGE_KEY, consent);
  } catch {
    // Storage-denied browsers must still honor the in-session user choice.
  }

  if (consent === "declined") {
    window.fbq?.("consent", "revoke");
  } else {
    window.fbq?.("consent", "grant");
  }

  window.dispatchEvent(new Event(META_MARKETING_CONSENT_EVENT));
}

export function subscribeToMetaMarketingConsent(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = () => onStoreChange();
  window.addEventListener(META_MARKETING_CONSENT_EVENT, handleChange);
  window.addEventListener("storage", handleChange);

  return () => {
    window.removeEventListener(META_MARKETING_CONSENT_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

export async function trackMetaMarketingEvent(
  eventName: MetaMarketingEventName,
  options: TrackMetaMarketingEventOptions = {},
): Promise<TrackMetaMarketingEventResult> {
  const config = resolveMetaMarketingPublicConfig();
  if (!config.enabled) return skipped("deployment_disabled");
  if (!isMetaMarketingEventName(eventName)) return skipped("unsupported_event");
  if (readStoredMetaMarketingConsent() !== "accepted") {
    return skipped("consent_required");
  }

  const eventId = options.eventId ?? createMetaMarketingEventId(eventName);
  let browserPixelSent = false;

  if (options.browserPixel !== false && typeof window !== "undefined") {
    if (window.fbq) {
      window.fbq("trackCustom", eventName, {}, { eventID: eventId });
      browserPixelSent = true;
    }
  }

  let conversionsApiQueued = false;
  if (options.conversionsApi !== false && typeof fetch === "function") {
    try {
      await fetch("/api/meta/conversions", {
        method: "POST",
        credentials: "omit",
        keepalive: true,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          eventName,
          eventId,
          marketingConsent: "accepted",
          browserPixelSent,
        }),
      });
      conversionsApiQueued = true;
    } catch {
      conversionsApiQueued = false;
    }
  }

  return {
    eventId,
    browserPixelSent,
    conversionsApiQueued,
    skippedReason: null,
  };
}

export function createMetaMarketingEventId(
  eventName: MetaMarketingEventName,
) {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `og_${eventName}_${Date.now()}_${randomPart}`.slice(0, 120);
}

function skipped(reason: string): TrackMetaMarketingEventResult {
  return {
    eventId: null,
    browserPixelSent: false,
    conversionsApiQueued: false,
    skippedReason: reason,
  };
}
