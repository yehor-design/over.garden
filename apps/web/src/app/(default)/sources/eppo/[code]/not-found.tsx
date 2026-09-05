import { EppoArchiveNotFound } from "@/components/public/public-eppo-archive-explorer";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export default function EppoSourceDetailNotFound() {
  return <EppoArchiveNotFound locale={DEFAULT_PUBLIC_LOCALE} />;
}
