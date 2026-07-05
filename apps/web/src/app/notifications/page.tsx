import LocalizedNotificationsRoute, {
  generateMetadata as generateLocalizedNotificationsMetadata,
} from "../[locale]/notifications/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedNotificationsMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function NotificationsRoute() {
  return LocalizedNotificationsRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}
