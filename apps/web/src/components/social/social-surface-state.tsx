"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicLocale } from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";

export type SocialSurface = "feed" | "notifications" | "bookmarks" | "wishlist";

export function SocialSurfaceLoading({ surface }: { surface: SocialSurface }) {
  return (
    <main
      data-my-social-surface={surface}
      data-state="loading"
      className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5"
    >
      <header className="grid gap-3 border-b border-border pb-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="flex gap-2 overflow-hidden pt-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-32 shrink-0" />
          ))}
        </div>
      </header>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-24 shrink-0" />
        ))}
      </div>
      <div className="divide-y divide-border border-y border-border">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="grid gap-3 py-5">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full max-w-2xl" />
          </div>
        ))}
      </div>
    </main>
  );
}

export function SocialSurfaceError({
  surface,
  reset,
}: {
  surface: SocialSurface;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const locale = pathname.startsWith("/bg/")
    ? "bg"
    : pathname.startsWith("/ru/")
      ? "ru"
      : "uk";
  const copy = getSocialSurfaceCopy(locale satisfies PublicLocale);

  return (
    <main
      lang={locale}
      data-my-social-surface={surface}
      data-state="error"
      className="mx-auto flex w-full max-w-5xl flex-col px-4 py-8 sm:px-6"
    >
      <section className="border-y border-border py-8">
        <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          {copy.common.loadError(copy.tabs[surface])}
        </h1>
        <Button type="button" onClick={reset} className="mt-4">
          <RefreshCw aria-hidden="true" />
          {copy.common.retry}
        </Button>
      </section>
    </main>
  );
}
