import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";
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

/**
 * `/knowledge` without a prefix, which is the Ukrainian address (ADR-0029 D10).
 *
 * The geography redirect that used to sit here could not work and had to go —
 * the same defect found on `/species` on 2026-09-12. By the time this runs the
 * shell has streamed, so the status is already `200` and a `redirect()` cannot
 * send a location header; the reader gets the chrome and an empty page. D10
 * settles it anyway: a canonical URL answers `200` to everyone, which is what
 * OVE-422 established for every other public page.
 */
export default async function RootKnowledgeRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const query = (await searchParams) ?? {};
  return renderPublicKnowledgePage(DEFAULT_PUBLIC_LOCALE, query);
}
