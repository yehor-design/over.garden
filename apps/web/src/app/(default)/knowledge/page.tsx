import { redirect } from "next/navigation";

import {
  buildPublicKnowledgeHref,
  normalizePublicKnowledgeRequest,
} from "@/lib/public-knowledge-content";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  generateMetadata as generateLocalizedKnowledgeMetadata,
  renderPublicKnowledgePage,
} from "@/app/[locale]/knowledge/page";

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  return generateLocalizedKnowledgeMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
    searchParams,
  });
}

export default async function RootKnowledgeRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const [locale, query] = await Promise.all([
    getRequestInterfaceLocale(),
    searchParams ?? Promise.resolve({}),
  ]);
  const request = normalizePublicKnowledgeRequest(query);

  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    redirect(buildPublicKnowledgeHref(locale as PublicLocale, request));
  }

  return renderPublicKnowledgePage(DEFAULT_PUBLIC_LOCALE, query);
}
