import { notFound } from "next/navigation";

import PublicLineageObjectRoute, {
  generateMetadata as generatePassportMetadata,
} from "@/app/[locale]/lineage/objects/[objectId]/page";
import { matchAuthorScopedObjectPath } from "@/lib/address/match-address-path";
import { publicObjectPassportPath } from "@/lib/garden/public-paths";

/**
 * An object passport at its own address: `/@{handle}/objects/{slug}`
 * (ADR-0029 D9). `/lineage/objects/{uuid}` put a database identifier in a
 * public URL; this is the same page under a name a reader can read.
 *
 * `objects` is a reserved entry slug in the address manifest for exactly this
 * reason: an entry called *objects* would take its own author's passports with
 * it.
 */
interface AuthorScopedPassportRouteProps {
  params: Promise<{
    locale: string;
    profileHandle: string;
    objectSlug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

async function resolveObjectId(
  params: AuthorScopedPassportRouteProps["params"],
): Promise<{ locale: string; objectId: string } | null> {
  const { locale, profileHandle, objectSlug } = await params;
  const matched = matchAuthorScopedObjectPath(
    publicObjectPassportPath(profileHandle, objectSlug),
  );
  if (!matched) return null;

  const { getPublicObjectPassportIdBySlug } = await import(
    "@/server/public-object-passport-repository"
  );
  const objectId = await getPublicObjectPassportIdBySlug(
    matched.handle,
    matched.slug,
  );
  return objectId ? { locale, objectId } : null;
}

export async function generateMetadata({
  params,
}: AuthorScopedPassportRouteProps) {
  const address = await resolveObjectId(params);
  if (!address) return {};
  return generatePassportMetadata({
    params: Promise.resolve({
      locale: address.locale,
      objectId: address.objectId,
    }),
  });
}

export default async function AuthorScopedPassportRoute({
  params,
  searchParams,
}: AuthorScopedPassportRouteProps) {
  const address = await resolveObjectId(params);
  if (!address) notFound();

  return PublicLineageObjectRoute({
    params: Promise.resolve({
      locale: address.locale,
      objectId: address.objectId,
    }),
    searchParams,
  });
}
