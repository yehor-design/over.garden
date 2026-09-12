import { notFound } from "next/navigation";

import PublicLineageObjectRoute, {
  generateMetadata as generatePassportMetadata,
} from "@/app/[locale]/lineage/objects/[objectId]/page";
import { matchAuthorScopedObjectPath } from "@/lib/address/match-address-path";
import {
  decodeRouteSegment,
  routeHandleSegment,
} from "@/lib/address/route-segments";
import { publicObjectPassportPath } from "@/lib/garden/public-paths";
import { logAddressRefusal } from "@/server/address-refusal-log";

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
  // Decoded first, because `publicObjectPassportPath` encodes what it is given
  // and a segment arrives from the URL already encoded — see
  // `decodeRouteSegment`, which exists because encoding it twice is what made
  // every passport answer 200 with the not-found page.
  const matched = matchAuthorScopedObjectPath(
    publicObjectPassportPath(
      routeHandleSegment(profileHandle),
      decodeRouteSegment(objectSlug),
    ),
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
  const { profileHandle, objectSlug } = await params;
  const address = await resolveObjectId(params);
  if (!address) {
    logAddressRefusal({
      route: "author_scoped_passport",
      reason: "address_unresolved",
      detail: {
        handle: routeHandleSegment(profileHandle),
        slug: decodeRouteSegment(objectSlug),
      },
    });
    notFound();
  }

  return PublicLineageObjectRoute({
    params: Promise.resolve({
      locale: address.locale,
      objectId: address.objectId,
    }),
    searchParams,
  });
}
