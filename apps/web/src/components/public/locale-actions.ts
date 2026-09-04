"use server";

import { cookies } from "next/headers";

import {
  INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
  INTERFACE_LOCALE_COOKIE_NAME,
} from "@/lib/interface-localization";
import { isInterfaceLocaleAllowed } from "@/lib/interface-market";
import { isPublicLocale } from "@/lib/public-localization";
import { getRequestInterfaceLocalization } from "@/server/interface-localization";

/**
 * Remember an interface language on a route that has no locale prefix.
 *
 * Public pages do not need this: their locale is in the path, so choosing one is
 * an ordinary link and the proxy writes the cookie from the prefix it lands on.
 * Workspace and account routes have no prefix, so the choice has nowhere to live
 * but the cookie, and this is the whole of it — one guarded write.
 *
 * What it replaces: a 753-line change coordinator, a 303-line document-wide
 * boundary that monkey-patched `window.fetch`, two 2 250 ms flush phases, two
 * commit gates, a `POST` and a full document replacement with a
 * `pagehide`/`pageshow` handshake. ADR-0022 D6 had already removed that pattern
 * once, under the names "document-mutation admission" and "mutation registry".
 *
 * Form-shaped so the control is a real form with a real endpoint: choosing a
 * language must not need the client bundle to have run.
 */
export async function setInterfaceLocaleAction(
  _previous: null,
  formData: FormData,
): Promise<null> {
  const requested = formData.get("locale");
  if (typeof requested !== "string" || !isPublicLocale(requested)) return null;

  // The market decides which languages exist. A value in a form may not widen
  // that set, so it is checked against the market this request resolved to.
  const { market } = await getRequestInterfaceLocalization();
  if (!isInterfaceLocaleAllowed(market, requested)) return null;

  const cookieStore = await cookies();
  cookieStore.set({
    name: INTERFACE_LOCALE_COOKIE_NAME,
    value: requested,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
  });

  return null;
}
