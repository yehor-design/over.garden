import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";

import {
  INTERFACE_LOCALE_COOKIE_NAME,
  INTERFACE_LOCALE_REQUEST_HEADER,
  resolveInterfaceLocale,
} from "@/lib/interface-localization";

export async function resolveRequestInterfaceLocale() {
  const [requestHeaders, cookieStore] = await Promise.all([
    headers(),
    cookies(),
  ]);

  return resolveInterfaceLocale({
    explicitLocale: requestHeaders.get(INTERFACE_LOCALE_REQUEST_HEADER),
    persistedLocale: cookieStore.get(INTERFACE_LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
    countryCode:
      requestHeaders.get("x-vercel-ip-country") ??
      requestHeaders.get("cf-ipcountry") ??
      requestHeaders.get("x-country-code"),
  });
}

export const getRequestInterfaceLocale = cache(resolveRequestInterfaceLocale);
