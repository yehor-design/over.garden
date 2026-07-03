import { permanentRedirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
} from "@/lib/public-localization";

interface LegacyBlogPostRedirectProps {
  params: Promise<{ slug: string }>;
}

export default async function LegacyBlogPostRedirect({
  params,
}: LegacyBlogPostRedirectProps) {
  const { slug } = await params;

  permanentRedirect(
    localizedPath(DEFAULT_PUBLIC_LOCALE, `/blog/${encodeURIComponent(slug)}`),
  );
}
