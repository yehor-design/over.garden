import { notFound, unstable_rethrow } from "next/navigation";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import {
  STATIC_PARAMS_PLACEHOLDER,
  staticReadsAreAvailable,
} from "@/server/public-prerender";
import { readPublicObjectPassportIdBySlug } from "@/server/public-cache";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  StaticRenderDeferred,
} from "@/server/static-public-page";

import {
  generateMetadata as generatePassportMetadata,
  renderPassport,
} from "@/app/[locale]/lineage/objects/[objectId]/page";
import { isPublicLocale } from "@/lib/public-localization";
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

  const objectId = await readPublicObjectPassportIdBySlug(
    matched.handle,
    matched.slug,
  );
  return objectId ? { locale, objectId } : null;
}

export async function generateMetadata({
  params,
}: AuthorScopedPassportRouteProps) {
  if ((await params).profileHandle === STATIC_PARAMS_PLACEHOLDER) return {};
  if (!(await staticReadsAreAvailable())) return {};
  const address = await resolveObjectId(params).catch((error: unknown) => {
    unstable_rethrow(error);
    return null;
  });
  if (!address) return {};
  return generatePassportMetadata({
    params: Promise.resolve({
      locale: address.locale,
      objectId: address.objectId,
    }),
  });
}

export function generateStaticParams() {
  return [
    {
      profileHandle: STATIC_PARAMS_PLACEHOLDER,
      objectSlug: STATIC_PARAMS_PLACEHOLDER,
    },
  ];
}

export default async function AuthorScopedPassportRoute({
  params,
  searchParams,
}: AuthorScopedPassportRouteProps) {
  const { profileHandle, objectSlug } = await params;
  if (profileHandle === STATIC_PARAMS_PLACEHOLDER) return null;
  return renderStaticPublicPage({
    fallback: <RootLoadingSkeleton />,
    render: async (phase) => {
      await deferStaticRenderWithoutDatabase(phase);
      const address = await resolveObjectId(params).catch((error: unknown) => {
        unstable_rethrow(error);
        if (error instanceof StaticRenderDeferred) throw error;
        deferStaticRenderAfterFailure(phase);
        throw error;
      });
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
      if (!isPublicLocale(address.locale)) notFound();
      // The passport's own renderer, in this attempt's phase: calling the
      // lineage route instead would start a second static attempt inside
      // this one.
      return renderPassport(
        address.objectId,
        address.locale,
        searchParams,
        phase,
      );
    },
  });
}
