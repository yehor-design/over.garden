import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";
import {
  generateMetadata as generateLocalizedRegisterHubMetadata,
  renderPublicRegisterHubPage,
} from "@/app/[locale]/species/[slug]/register/page";

interface RootRegisterHubRouteProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: RootRegisterHubRouteProps) {
  const { slug } = await params;
  return generateLocalizedRegisterHubMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
  });
}

/**
 * `/species/{species}/register` without a prefix, the Ukrainian address.
 *
 * It renders rather than redirecting by interface locale — see the browse
 * route beside it: a canonical URL answers `200` to everyone (ADR-0029 D10),
 * and a `redirect()` after the shell has streamed leaves the reader with an
 * empty page instead of a location header.
 */
export default async function RootRegisterHubRoute({
  params,
}: RootRegisterHubRouteProps) {
  const { slug } = await params;
  return renderPublicRegisterHubPage(DEFAULT_PUBLIC_LOCALE, slug);
}
