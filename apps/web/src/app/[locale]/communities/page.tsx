import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicCommunityDirectory } from "@/components/public/public-community";
import { getCommunityCopy } from "@/lib/community-copy";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { listPublicCommunities } from "@/server/community-repository";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
import { scopedToUser, type RequestScope } from "@/server/request-scope";

export const dynamic = "force-dynamic";

interface CommunityDirectoryRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: CommunityDirectoryRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";
  const copy = getCommunityCopy(locale);
  const indexState = evaluatePublicSurfaceIndexability({ kind: "community" });

  return {
    title: `${copy.directoryTitle} | OverGarden`,
    description: copy.directoryDescription,
    alternates: {
      canonical: localizedPath(locale, "/communities"),
      languages: buildLanguageAlternates("/communities"),
    },
    robots: indexState.robots,
    openGraph: { locale },
  };
}

export async function renderCommunityDirectory(locale: PublicLocale) {
  const viewerScope = await currentViewerScope();
  try {
    const communities = await listPublicCommunities(viewerScope);
    return (
      <PublicCommunityDirectory
        locale={locale}
        communities={communities}
        state="ready"
      />
    );
  } catch {
    return (
      <PublicCommunityDirectory
        locale={locale}
        communities={[]}
        state="error"
      />
    );
  }
}

export default async function CommunityDirectoryRoute({
  params,
}: CommunityDirectoryRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) return notFound();
  return renderCommunityDirectory(localeParam);
}

async function currentViewerScope(): Promise<RequestScope | null> {
  try {
    const session = await getCurrentSession();
    return session?.user?.id
      ? scopedToUser(session.user.id, getSessionId(session))
      : null;
  } catch {
    return null;
  }
}
