import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export default function NotFound() {
  return (
    <Suspense fallback={null}>
      <LocalizedNotFound />
    </Suspense>
  );
}

/** Reads the interface locale at request time, inside the Suspense hole. */
export async function LocalizedNotFound() {
  const locale = await getRequestInterfaceLocale();
  const copy = getPublicSurfaceCopy(locale);

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8"
    >
      <p className="text-sm font-medium text-muted-foreground">OverGarden</p>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {copy.notFound.title}
      </h1>
      <Link href="/" className={buttonVariants({ className: "w-fit" })}>
        {copy.notFound.home}
      </Link>
    </main>
  );
}
