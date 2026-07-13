"use client";

import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCommunityCopy } from "@/lib/community-copy";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
} from "@/lib/public-localization";

export default function CommunityDirectoryError({
  reset,
}: {
  reset: () => void;
}) {
  const localeSegment = usePathname().split("/")[1] ?? "";
  const locale = isPublicLocale(localeSegment)
    ? localeSegment
    : DEFAULT_PUBLIC_LOCALE;
  const copy = getCommunityCopy(locale);

  return (
    <main
      lang={locale}
      className="mx-auto grid w-full max-w-5xl justify-items-start gap-4 px-4 py-10 sm:px-6"
    >
      <h1 className="text-2xl font-semibold">{copy.directoryTitle}</h1>
      <p className="text-sm text-muted-foreground" role="alert">
        {copy.error}
      </p>
      <Button onClick={reset}>{copy.retry}</Button>
    </main>
  );
}
