import type { Metadata } from "next";

import {
  eppoArchiveExplorerMetadata,
  renderEppoArchiveExplorer,
} from "@/app/eppo-archive-pages";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface EppoPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateMetadata(): Promise<Metadata> {
  return eppoArchiveExplorerMetadata(DEFAULT_PUBLIC_LOCALE);
}

export default async function EppoPage({ searchParams }: EppoPageProps) {
  return renderEppoArchiveExplorer(
    DEFAULT_PUBLIC_LOCALE,
    (await searchParams) ?? {},
  );
}
