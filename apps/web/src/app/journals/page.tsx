import { redirect } from "next/navigation";

import { buildPublicJournalDirectoryHref } from "@/lib/public-journal-directory-navigation";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { normalizePublicJournalDirectoryRequest } from "@/server/public-journal-directory-repository";
import {
  generateMetadata as generateLocalizedJournalsMetadata,
  renderPublicJournalsPage,
} from "../[locale]/journals/page";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return generateLocalizedJournalsMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function RootJournalsRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const [locale, query] = await Promise.all([
    getRequestInterfaceLocale(),
    searchParams ?? Promise.resolve({}),
  ]);
  const request = normalizePublicJournalDirectoryRequest(query);

  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    redirect(buildPublicJournalDirectoryHref(locale as PublicLocale, request));
  }

  return renderPublicJournalsPage(DEFAULT_PUBLIC_LOCALE, query);
}
