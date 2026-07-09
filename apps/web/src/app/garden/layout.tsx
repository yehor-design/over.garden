import type { Metadata } from "next";

import { getInterfaceCopy } from "@/lib/interface-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { evaluateNonDiscoveryRouteIndexability } from "@/server/public-surface-indexing-policy";

const workspaceIndexState = evaluateNonDiscoveryRouteIndexability("workspace");

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  const copy = getInterfaceCopy(locale);

  return {
    title: copy.metadata.workspaceTitle,
    description: copy.metadata.workspaceDescription,
    robots: workspaceIndexState.robots,
  };
}

export default function GardenLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
