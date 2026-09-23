import { Link } from "@/components/ui/link";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getOwnerLineageCatalogKindLabel,
  getOwnerLineageCopy,
} from "@/lib/owner-lineage-copy";
import type { LineageGardenerIdentity } from "@/server/lineage-identity";

/**
 * The other gardener, as their public profile shows them: a name that opens
 * the profile and the handle beside it, so two gardeners called the same are
 * still two (`OVE-495`, criterion 7). A gardener with no public profile to
 * show — none, hidden, or a block between the two — is said to be one, never
 * given an id or a made-up name.
 */
export function LineageGardener({
  identity,
  locale,
}: {
  identity: LineageGardenerIdentity | null;
  locale: InterfaceLocale;
}) {
  if (!identity) {
    return (
      <span className="text-text-muted">
        {getOwnerLineageCopy(locale).common.gardenerWithoutProfile}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-2">
      <Link
        href={identity.profilePath}
        className="font-medium break-words"
        data-lineage-gardener={identity.handle}
      >
        {identity.displayName ?? `@${identity.handle}`}
      </Link>
      {identity.displayName ? (
        <span className="break-all text-text-muted">@{identity.handle}</span>
      ) : null}
    </span>
  );
}

/**
 * What tells one "Томат" from another: its variety as the gardener wrote it,
 * and the catalogue kind it was matched to.
 */
export function lineageObjectMeta(
  object: {
    varietyText: string | null;
    catalogKind: Parameters<typeof getOwnerLineageCatalogKindLabel>[1];
  },
  locale: InterfaceLocale,
) {
  return [
    object.varietyText ?? getOwnerLineageCopy(locale).common.unknownVariety,
    getOwnerLineageCatalogKindLabel(locale, object.catalogKind),
  ]
    .filter((item): item is string => Boolean(item))
    .join(" · ");
}
