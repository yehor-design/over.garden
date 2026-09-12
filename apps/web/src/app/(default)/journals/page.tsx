import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";
import {
  generateMetadata as generateLocalizedJournalsMetadata,
  renderPublicJournalsPage,
} from "@/app/[locale]/journals/page";

export async function generateMetadata() {
  return generateLocalizedJournalsMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

/**
 * Rendered, never redirected by the reader's interface locale.
 *
 * A canonical URL answers `200` to everyone (ADR-0029 D10), and OVE-422 took
 * the geography redirects out of the public pages — these were the ones a
 * `(default)` wrapper still carried. A `redirect()` here could not work
 * anyway: the shell has streamed by the time it runs, so the status is already
 * `200` and the location header has sailed. Measured on production 2026-09-12,
 * `/journals` came back 81 592 bytes with no JSON-LD while `/bg/journals`
 * rendered in 210 401.
 *
 * The language control in the shell is how a reader reaches their own prefix,
 * and `hreflang` is how a crawler does.
 */
export default async function RootJournalsRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const query = (await searchParams) ?? {};
  return renderPublicJournalsPage(DEFAULT_PUBLIC_LOCALE, query);
}
