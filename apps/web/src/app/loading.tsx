import { Skeleton } from "@/components/ui/skeleton";
import { getInterfaceCopy } from "@/lib/interface-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export default async function Loading() {
  const locale = await getRequestInterfaceLocale();
  const copy = getInterfaceCopy(locale);

  return (
    <main
      lang={locale}
      data-site-shell-state="loading"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-12"
    >
      <span className="sr-only">{copy.shell.loadingTitle}</span>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-3/4 max-w-lg" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div aria-hidden="true" className="flex flex-col divide-y divide-border">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex min-h-28 gap-4 py-5">
            <Skeleton className="size-20 shrink-0 sm:size-24" />
            <div className="flex min-w-0 flex-1 flex-col gap-3 py-1">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
