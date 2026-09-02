import type { Metadata } from "next";

import {
  renderStableRegistryExplorer,
  stableRegistryExplorerMetadata,
} from "@/app/stable-registry-public-pages";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface EppoPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateMetadata(): Promise<Metadata> {
  return stableRegistryExplorerMetadata(DEFAULT_PUBLIC_LOCALE, "eppo");
}

export default async function EppoPage({ searchParams }: EppoPageProps) {
  return renderStableRegistryExplorer(
    DEFAULT_PUBLIC_LOCALE,
    "eppo",
    (await searchParams) ?? {},
  );
}
