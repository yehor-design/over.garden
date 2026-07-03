import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Globe2, Sprout } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  getMarketLanding,
  listMarketLandings,
} from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface MarketRouteProps {
  params: Promise<{ market: string }>;
}

export function generateStaticParams() {
  return listMarketLandings().map((landing) => ({
    market: landing.market,
  }));
}

export async function generateMetadata({
  params,
}: MarketRouteProps): Promise<Metadata> {
  const { market } = await params;
  const landing = getMarketLanding(market);

  if (!landing) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Market | OverGarden",
      robots: missingState.robots,
    };
  }

  const indexState = evaluatePublicSurfaceIndexability({
    kind: landing.kind,
  });

  return {
    title: `${landing.title} | OverGarden`,
    description: landing.description,
    alternates: {
      canonical: landing.path,
    },
    robots: indexState.robots,
  };
}

export default async function MarketLandingPage({ params }: MarketRouteProps) {
  const { market } = await params;
  const landing = getMarketLanding(market);

  if (!landing) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <Link
          href="/"
          className="self-start rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          OverGarden
        </Link>
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Globe2 className="size-4" />
            Market landing
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {landing.title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {landing.description}
          </p>
        </div>
        <Link href="/garden" className={buttonVariants({ className: "w-fit" })}>
          <Sprout className="size-4" />
          Start a private record
        </Link>
      </header>

      <section className="grid gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Who this is for
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-foreground">
          {landing.localAudience}
        </p>
      </section>

      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          The promise
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {landing.promise}
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          What public discovery can safely use now
        </h2>
        <ul className="grid gap-3">
          {landing.proofPlan.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-border p-4 text-sm leading-6 text-muted-foreground"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Related paths
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {landing.relatedLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="grid gap-2 rounded-lg border border-border p-4 text-sm transition-colors hover:bg-muted"
            >
              <span className="flex items-center gap-2 font-medium text-foreground">
                <ArrowRight className="size-4" />
                {link.label}
              </span>
              <span className="leading-6 text-muted-foreground">
                {link.description}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
