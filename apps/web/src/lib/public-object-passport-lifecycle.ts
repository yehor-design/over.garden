import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { getLivingObjectPassportCopy } from "@/lib/living-object-passport";
import { localizedPath } from "@/lib/public-localization";

const PUBLIC_OBJECT_PASSPORT_PATH = /^\/lineage\/objects\/([^/]+)\/?$/i;

export function matchPublicObjectPassportPath(pathname: string) {
  return PUBLIC_OBJECT_PASSPORT_PATH.exec(pathname)?.[1] ?? null;
}

export function renderGonePublicObjectPassportHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
) {
  const copy = getLivingObjectPassportCopy(locale);
  return renderLifecycleDocument(
    locale,
    copy.passportRemoved,
    copy.passportRemovedDescription,
    location,
  );
}

export function renderNotFoundPublicObjectPassportHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
) {
  const copy = getLivingObjectPassportCopy(locale);
  return renderLifecycleDocument(
    locale,
    copy.passportNotFound,
    copy.passportNotFoundDescription,
    location,
  );
}

function renderLifecycleDocument(
  locale: InterfaceLocale,
  title: string,
  description: string,
  location?: PublicLifecycleRequestLocation,
) {
  const copy = getLivingObjectPassportCopy(locale);
  const objectsPath = localizedPath(locale, "/objects");

  return renderPublicLifecycleDocument({
    locale,
    pathname: location?.pathname ?? "/lineage/objects/missing",
    search: location?.search,
    title,
    description,
    actionHref: objectsPath,
    actionLabel: copy.browseObjects,
  });
}
