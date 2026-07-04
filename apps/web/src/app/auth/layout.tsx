import type { Metadata } from "next";

import { evaluateNonDiscoveryRouteIndexability } from "@/server/public-surface-indexing-policy";

const authIndexState = evaluateNonDiscoveryRouteIndexability("auth");

export const metadata: Metadata = {
  robots: authIndexState.robots,
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
