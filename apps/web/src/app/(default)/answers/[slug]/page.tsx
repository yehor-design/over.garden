import AnswerRoute, {
  generateMetadata as generateLocalizedAnswerMetadata,
} from "@/app/[locale]/answers/[slug]/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface LegacyAnswerRedirectProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateMetadata({
  params,
  searchParams,
}: LegacyAnswerRedirectProps) {
  return Promise.all([params, searchParams ?? Promise.resolve({})]).then(
    ([{ slug }, query]) =>
      generateLocalizedAnswerMetadata({
        params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
        searchParams: Promise.resolve(query),
      }),
  );
}

export default async function AnswerPage({
  params,
  searchParams,
}: LegacyAnswerRedirectProps) {
  const { slug } = await params;

  return AnswerRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    searchParams,
  });
}
