import { PublicStableRegistryNotFound } from "@/components/public/public-stable-registry-explorer";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export default async function LocalizedEppoSourceDetailNotFound() {
  return (
    <PublicStableRegistryNotFound
      locale={await getRequestInterfaceLocale()}
      surface="eppo"
    />
  );
}
