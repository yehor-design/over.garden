import BlogPostRoute, {
  generateMetadata as generateLocalizedBlogPostMetadata,
} from "../../[locale]/blog/[slug]/page";

import {
  DEFAULT_PUBLIC_LOCALE,
} from "@/lib/public-localization";

interface LegacyBlogPostRedirectProps {
  params: Promise<{ slug: string }>;
}

export function generateMetadata({ params }: LegacyBlogPostRedirectProps) {
  return params.then(({ slug }) =>
    generateLocalizedBlogPostMetadata({
      params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    }),
  );
}

export default async function BlogPostPage({
  params,
}: LegacyBlogPostRedirectProps) {
  const { slug } = await params;

  return BlogPostRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
  });
}
