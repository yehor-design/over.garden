import { PublicStableRegistryNotFound } from "@/components/public/public-stable-registry-explorer";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export default function CatalogDetailNotFound() {
  return (
    <PublicStableRegistryNotFound
      locale={DEFAULT_PUBLIC_LOCALE}
      surface="catalog"
    />
  );
}
