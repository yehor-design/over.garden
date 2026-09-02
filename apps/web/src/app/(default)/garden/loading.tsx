import { Skeleton } from "@/components/ui/skeleton";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export default async function GardenLoading() {
  return <GardenLoadingView locale={await getRequestInterfaceLocale()} />;
}

export function GardenLoadingView({ locale }: { locale: InterfaceLocale }) {
  const copy = getGardenWorkspaceCopy(locale).workspace;

  return (
    <main
      lang={locale}
      data-garden-workspace="loading"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-4xl flex-col"
    >
      <header className="px-4 pt-6 sm:px-6 sm:pt-8">
        <p className="text-xs font-semibold text-muted-foreground uppercase">
          {copy.headerEyebrow}
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground">
          {copy.loadingTitle}
        </h1>
        <Skeleton className="mt-3 h-4 w-full max-w-lg" />
        <Skeleton className="mt-2 h-4 w-2/3 max-w-sm" />
        <div className="mt-6 border-y border-border py-6">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-8 w-2/3" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
        </div>
      </header>

      <div className="grid grid-cols-2 border-b border-border bg-foreground p-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="mx-2 h-12 bg-background/20" />
        ))}
      </div>

      <div className="flex flex-col gap-10 px-4 py-8 sm:px-6">
        <LoadingSection title={copy.inventory.title} rows={4} />
        <LoadingSection title={copy.recent.title} rows={3} />
      </div>
    </main>
  );
}

function LoadingSection({ title, rows }: { title: string; rows: number }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-4 divide-y divide-border border-y border-border">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 py-4">
            <Skeleton className="size-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
