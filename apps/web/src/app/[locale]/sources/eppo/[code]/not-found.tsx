import { EppoArchiveNotFound } from "@/components/public/public-eppo-archive-explorer";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export default async function LocalizedEppoSourceDetailNotFound() {
  return <EppoArchiveNotFound locale={await getRequestInterfaceLocale()} />;
}
