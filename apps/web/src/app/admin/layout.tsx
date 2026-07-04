import type { Metadata } from "next";

import { evaluateNonDiscoveryRouteIndexability } from "@/server/public-surface-indexing-policy";

const operatorIndexState = evaluateNonDiscoveryRouteIndexability("operator");

export const metadata: Metadata = {
  robots: operatorIndexState.robots,
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
