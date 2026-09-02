"use client";

import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { normalizeOwnerUserId } from "@/lib/auth/owner-scope-contract";
import {
  announceSessionSignal,
  subscribeSessionSignals,
} from "@/lib/auth/session-signal";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath } from "@/lib/public-localization";

const LAST_OWNER_KEY = "overgarden-session-owner";

/**
 * Cross-tab account changes (ADR-0022, D6). Any tab that learns the account
 * differs from the one its document was rendered for reloads to the home page
 * as whoever is signed in now; unsaved text is lost by design.
 */
export function SessionSignalBoundary({
  locale,
  ownerUserId,
}: {
  locale: InterfaceLocale;
  ownerUserId: string | null;
}) {
  useEffect(() => {
    const homePath = localizedPath(locale, "/");
    const goHome = () => window.location.replace(homePath);

    // A tab that lands after an OAuth callback or a full-page sign-in has no
    // explicit signal to send, so compare with the last owner this tab saw.
    try {
      const previous = normalizeOwnerUserId(
        window.sessionStorage.getItem(LAST_OWNER_KEY),
      );
      const seen = window.sessionStorage.getItem(LAST_OWNER_KEY) !== null;
      window.sessionStorage.setItem(LAST_OWNER_KEY, ownerUserId ?? "");
      if (seen && previous !== ownerUserId) {
        announceSessionSignal({
          type: ownerUserId ? "signed_in" : "signed_out",
          ownerUserId: ownerUserId,
        });
      }
    } catch {
      // sessionStorage may be unavailable; explicit signals still work.
    }

    const unsubscribe = subscribeSessionSignals((signal) => {
      if (signal.ownerUserId !== ownerUserId) goHome();
    });

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void authClient
        .getSession()
        .then((result) => {
          const liveOwner = normalizeOwnerUserId(result.data?.user?.id ?? null);
          if (liveOwner !== ownerUserId) goHome();
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [locale, ownerUserId]);

  return null;
}
