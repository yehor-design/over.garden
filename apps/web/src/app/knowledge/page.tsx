import { redirect } from "next/navigation";

import {
  buildPublicKnowledgeHref,
  normalizePublicKnowledgeRequest,
} from "@/lib/public-knowledge-content";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import { resolveVisualFixturePublicKnowledgeMode } from "@/lib/visual-fixtures/public-knowledge-scenarios";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  generateMetadata as generateLocalizedKnowledgeMetadata,
  renderPublicKnowledgePage,
} from "../[locale]/knowledge/page";

export const dynamic = "force-dynamic";

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
  const visualMode = resolveVisualFixturePublicKnowledgeMode(
    query,
    process.env,
  );

  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    const href = buildPublicKnowledgeHref(
      locale as PublicLocale,
      request,
      visualMode === "corpus",
    );
    redirect(withVisualMode(href, visualMode));
  }

  return renderPublicKnowledgePage(DEFAULT_PUBLIC_LOCALE, query);
}

function withVisualMode(
  href: string,
  mode: ReturnType<typeof resolveVisualFixturePublicKnowledgeMode>,
) {
  if (!mode || mode === "corpus") return href;
  const url = new URL(href, "https://visual-fixtures.invalid");
  url.searchParams.set("__visualKnowledge", mode);
  return `${url.pathname}${url.search}`;
}
