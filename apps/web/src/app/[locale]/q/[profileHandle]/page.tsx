import { notFound } from "next/navigation";
import {
  generateMetadata,
  renderPublicProfile,
  type LocalizedPublicProfileRouteProps,
} from "@/app/[locale]/[profileHandle]/(profile)/page";
import { isPublicLocale } from "@/lib/public-localization";
import { matchPublicProfilePath } from "@/lib/public-profile-lifecycle";
import { normalizePublicProfileTab } from "@/lib/public-profile-tabs";

export { generateMetadata };

export default async function ProfileTabRoute({
  params,
  searchParams,
}: LocalizedPublicProfileRouteProps) {
  const { locale, profileHandle } = await params;
  const handle = matchPublicProfilePath(`/${profileHandle}`);
  if (!isPublicLocale(locale) || !handle) notFound();
  const query = (await searchParams) ?? {};
  return renderPublicProfile(
    locale,
    handle,
    searchParams,
    normalizePublicProfileTab(query.tab),
  );
}
