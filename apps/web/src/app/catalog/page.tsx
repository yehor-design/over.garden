import type { Metadata } from "next";

import {
  renderStableRegistryExplorer,
  stableRegistryExplorerMetadata,
} from "@/app/stable-registry-public-pages";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface CatalogPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateMetadata(): Promise<Metadata> {
  return stableRegistryExplorerMetadata(DEFAULT_PUBLIC_LOCALE, "catalog");
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  return renderStableRegistryExplorer(
    DEFAULT_PUBLIC_LOCALE,
    "catalog",
    (await searchParams) ?? {},
  );
}
