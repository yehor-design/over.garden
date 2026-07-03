import { permanentRedirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
} from "@/lib/public-localization";

interface LegacyAnswerRedirectProps {
  params: Promise<{ slug: string }>;
}

export default async function LegacyAnswerRedirect({
  params,
}: LegacyAnswerRedirectProps) {
  const { slug } = await params;

  permanentRedirect(
    localizedPath(
      DEFAULT_PUBLIC_LOCALE,
      `/answers/${encodeURIComponent(slug)}`,
    ),
  );
}
