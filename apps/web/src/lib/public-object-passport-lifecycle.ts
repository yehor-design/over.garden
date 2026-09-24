import { matchAddressPath } from "@/lib/address/match-address-path";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleAuthor,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { getLivingObjectPassportCopy } from "@/lib/living-object-passport";
import { localizedPath } from "@/lib/public-localization";
import {
  MISSING_ADDRESS_SLUG,
  publicObjectPassportPath,
  publicProfilePath,
} from "@/lib/garden/public-paths";

export function matchPublicObjectPassportPath(pathname: string) {
  return matchAddressPath("object", pathname);
}

export function renderGonePublicObjectPassportHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
  author?: PublicLifecycleAuthor | null,
) {
  const copy = getLivingObjectPassportCopy(locale);
  return renderLifecycleDocument(
    locale,
    copy.passportRemoved,
    copy.passportRemovedDescription,
    location,
    author,
  );
}

export function renderNotFoundPublicObjectPassportHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
  author?: PublicLifecycleAuthor | null,
) {
  const copy = getLivingObjectPassportCopy(locale);
  return renderLifecycleDocument(
    locale,
    copy.passportNotFound,
    copy.passportNotFoundDescription,
    location,
    author,
  );
}

/**
 * The one way on. A passport is a gardener's object, so its tombstone leads
 * to that gardener's other plants and animals when their profile still
 * answers, and to the journals directory when it does not. It used to lead
 * to the organism catalogue under the label "living objects" — the mix-up
 * `OG-UX-019` found in the passport's own breadcrumb (`OVE-478`).
 */
function renderLifecycleDocument(
  locale: InterfaceLocale,
  title: string,
  description: string,
  location?: PublicLifecycleRequestLocation,
  author?: PublicLifecycleAuthor | null,
) {
  const copy = getLivingObjectPassportCopy(locale);
  const action = author
    ? {
        actionHref: `${publicProfilePath(locale, author.handle)}#profile-objects`,
        actionLabel: copy.authorObjects.replace("{handle}", author.handle),
      }
    : {
        actionHref: localizedPath(locale, "/journals"),
        actionLabel: copy.browseJournals,
      };

  return renderPublicLifecycleDocument({
    locale,
    pathname:
      location?.pathname ??
      publicObjectPassportPath(MISSING_ADDRESS_SLUG, MISSING_ADDRESS_SLUG),
    search: location?.search,
    title,
    description,
    ...action,
  });
}
