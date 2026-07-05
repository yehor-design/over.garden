import AnswerRoute, {
  generateMetadata as generateLocalizedAnswerMetadata,
} from "../../[locale]/answers/[slug]/page";

import {
  DEFAULT_PUBLIC_LOCALE,
} from "@/lib/public-localization";

interface LegacyAnswerRedirectProps {
  params: Promise<{ slug: string }>;
}

export function generateMetadata({ params }: LegacyAnswerRedirectProps) {
  return params.then(({ slug }) =>
    generateLocalizedAnswerMetadata({
      params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    }),
  );
}

export default async function AnswerPage({
  params,
}: LegacyAnswerRedirectProps) {
  const { slug } = await params;

  return AnswerRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
  });
}
