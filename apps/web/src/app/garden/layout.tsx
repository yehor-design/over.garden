import type { Metadata } from "next";

import { evaluateNonDiscoveryRouteIndexability } from "@/server/public-surface-indexing-policy";

const workspaceIndexState = evaluateNonDiscoveryRouteIndexability("workspace");

export const metadata: Metadata = {
  robots: workspaceIndexState.robots,
};

export default function GardenLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
