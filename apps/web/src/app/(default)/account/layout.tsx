import type { Metadata } from "next";

import { evaluateNonDiscoveryRouteIndexability } from "@/server/public-surface-indexing-policy";

const accountIndexState = evaluateNonDiscoveryRouteIndexability("operator");

export const metadata: Metadata = {
  robots: accountIndexState.robots,
};

export default function AccountLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
