import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, NotebookPen, ShieldCheck, Sprout } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { gardenFirstEntryHomepagePath } from "@/lib/garden/public-paths";

export const metadata: Metadata = {
  title: "OverGarden",
  description:
    "Keep a living, dated record of what happens to each plant you grow.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-5 py-8 sm:px-8">
      <header className="flex flex-col justify-center gap-7 border-b border-border py-16 sm:py-20">
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-muted-foreground">
            OverGarden
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Keep a living record of every plant you grow.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Save dated notes and photos for the same plant over time, then turn
            the useful parts into public proof when you choose.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={gardenFirstEntryHomepagePath()}
            className={buttonVariants({ size: "lg" })}
          >
            <Sprout className="size-4" />
            Start first entry
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/garden"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Open workspace
          </Link>
        </div>

        <dl className="grid gap-3 pt-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
              <NotebookPen className="size-4" />
              Object history
            </dt>
            <dd className="text-sm leading-6 text-muted-foreground">
              One plant, many dated observations, no lost chat advice.
            </dd>
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck className="size-4" />
              Private by default
            </dt>
            <dd className="text-sm leading-6 text-muted-foreground">
              Location stays hidden unless you deliberately choose a region.
            </dd>
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sprout className="size-4" />
              Public proof later
            </dt>
            <dd className="text-sm leading-6 text-muted-foreground">
              Publish selected entries only after the private record exists.
            </dd>
          </div>
        </dl>
      </header>

      <section className="grid gap-3 pb-8">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          The first useful action is a saved entry.
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          OverGarden is being piloted around one concrete behavior: create a
          plant object, write the first observation, and return to the same
          object when something changes.
        </p>
      </section>
    </main>
  );
}
