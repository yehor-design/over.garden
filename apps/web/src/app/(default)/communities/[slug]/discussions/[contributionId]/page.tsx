import ContributionDiscussionRoute, {
  generateMetadata as generateLocalizedMetadata,
} from "@/app/[locale]/communities/[slug]/discussions/[contributionId]/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

/**
 * The unprefixed half of a community discussion.
 *
 * Only the prefixed half existed, so `/communities/{slug}/discussions/{id}`
 * fell through to the family's `[...missing]` catch-all and answered `200`
 * with a `noindex` body — a link a reader followed from the unprefixed
 * community page led nowhere, and looked like it had arrived.
 */
interface RootContributionDiscussionRouteProps {
  params: Promise<{ slug: string; contributionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export { generateLocalizedMetadata as generateMetadata };

export default async function RootContributionDiscussionRoute({
  params,
  searchParams,
}: RootContributionDiscussionRouteProps) {
  const { slug, contributionId } = await params;
  return ContributionDiscussionRoute({
    params: Promise.resolve({
      locale: DEFAULT_PUBLIC_LOCALE,
      slug,
      contributionId,
    }),
    searchParams,
  });
}
