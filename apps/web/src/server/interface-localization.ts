import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";

import {
  INTERFACE_LOCALE_COOKIE_NAME,
  INTERFACE_LOCALE_REQUEST_HEADER,
  resolveInterfaceLocalization,
} from "@/lib/interface-localization";
import {
  INTERFACE_MARKET_COOKIE_NAME,
  INTERFACE_MARKET_REQUEST_HEADER,
  readInterfaceCountryCode,
} from "@/lib/interface-market";

/**
 * The reader's language and market for this render.
 *
 * The explicit locale header is present only when the address names a
 * language (`/bg/…`); the proxy sends nothing else under that name
 * (`forwardInterfaceLocalization` in `proxy.ts`). Everywhere else the cookie
 * decides — read through `cookies()`, which after a Server Action holds what
 * the action wrote. That is what lets the language form on a workspace route
 * re-render the page in the language just chosen: `headers()` still describes
 * the request as it arrived, before the choice.
 */
export async function resolveRequestInterfaceLocalization() {
  const [requestHeaders, cookieStore] = await Promise.all([
    headers(),
    cookies(),
  ]);

  return resolveInterfaceLocalization({
    explicitMarket: requestHeaders.get(INTERFACE_MARKET_REQUEST_HEADER),
    explicitLocale: requestHeaders.get(INTERFACE_LOCALE_REQUEST_HEADER),
    persistedMarket: cookieStore.get(INTERFACE_MARKET_COOKIE_NAME)?.value,
    persistedLocale: cookieStore.get(INTERFACE_LOCALE_COOKIE_NAME)?.value,
    countryCode: readInterfaceCountryCode(requestHeaders),
  });
}

export async function resolveRequestInterfaceLocale() {
  return (await resolveRequestInterfaceLocalization()).locale;
}

export const getRequestInterfaceLocalization = cache(
  resolveRequestInterfaceLocalization,
);
export const getRequestInterfaceLocale = cache(resolveRequestInterfaceLocale);
