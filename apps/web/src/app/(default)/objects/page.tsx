import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";
import {
  generateMetadata as generateLocalizedObjectsMetadata,
  renderPublicObjectsPage,
} from "@/app/[locale]/objects/page";

export async function generateMetadata() {
  return generateLocalizedObjectsMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

/**
 * Rendered, never redirected by the reader's interface locale — see the
 * journals route beside it: a canonical URL answers `200` to everyone
 * (ADR-0029 D10), and a `redirect()` after the shell has streamed cannot fire.
 */
export default async function RootObjectsRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const query = (await searchParams) ?? {};
  return renderPublicObjectsPage(DEFAULT_PUBLIC_LOCALE, query);
}
