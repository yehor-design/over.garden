import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRootLocaleRedirectPath } from "@/lib/public-localization";

export const dynamic = "force-dynamic";

export default async function RootLocaleRedirectPage() {
  const requestHeaders = await headers();

  redirect(getRootLocaleRedirectPath(requestHeaders.get("accept-language")));
}
