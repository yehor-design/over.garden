import LocalizedNotificationsRoute, {
  generateMetadata as generateLocalizedNotificationsMetadata,
} from "@/app/[locale]/notifications/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedNotificationsMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

interface NotificationsRouteProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NotificationsRoute({
  searchParams,
}: NotificationsRouteProps) {
  return LocalizedNotificationsRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
    searchParams,
  });
}
