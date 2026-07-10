import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  Database,
  ImageIcon,
  ListChecks,
  MonitorSmartphone,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import {
  VISUAL_FIXTURE_MANIFEST,
  VISUAL_FIXTURE_MANIFEST_HASH,
  type VisualFixtureMediaAspect,
} from "@/lib/visual-fixtures/manifest";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Visual fixtures | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function VisualFixtureIndexPage() {
  const environment = tryResolveVisualFixtureEnvironment(process.env);
  if (!environment) notFound();

  const [{ db }, { getPublicDerivativeUrl }, { getVisualFixtureStatus }] =
    await Promise.all([
      import("@/db"),
      import("@/lib/storage"),
      import("@/server/visual-fixtures/repository"),
    ]);
  const status = await getVisualFixtureStatus(db, VISUAL_FIXTURE_MANIFEST);

  return (
    <main
      data-visual-fixture-index="true"
      className="min-h-dvh bg-background text-foreground"
    >
      <header className="border-b border-foreground/15 bg-foreground text-background">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase">OverGarden</p>
            <h1 className="text-lg font-semibold">
              Deterministic visual environment
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>{environment.target}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <section
          aria-labelledby="fixture-status-heading"
          className="grid gap-5"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Database className="size-4" aria-hidden="true" />
                Manifest {status.version}
              </p>
              <h2
                id="fixture-status-heading"
                className="mt-1 text-2xl font-semibold"
              >
                {status.seeded ? "Dataset ready" : "Dataset incomplete"}
              </h2>
            </div>
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
                status.seeded
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              {status.seeded ? "Counts verified" : "Seed required"}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4 lg:grid-cols-8">
            <CountFact label="Fixture users" value={status.actual.actors} />
            <CountFact label="Public profiles" value={status.actual.profiles} />
            <CountFact label="Spaces" value={status.actual.spaces} />
            <CountFact label="Living objects" value={status.actual.objects} />
            <CountFact label="Journal entries" value={status.actual.entries} />
            <CountFact label="Trusted topics" value={status.actual.topics} />
            <CountFact
              label="Topic memberships"
              value={status.actual.topicSignals}
            />
            <CountFact label="Media" value={status.actual.media} />
          </dl>

          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>Manifest SHA-256</span>
            <code className="font-mono break-all text-foreground">
              {VISUAL_FIXTURE_MANIFEST_HASH}
            </code>
          </div>
        </section>

        <Separator />

        <section aria-labelledby="scenario-heading" className="grid gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MonitorSmartphone className="size-4" aria-hidden="true" />
              Desktop and mobile-320
            </p>
            <h2 id="scenario-heading" className="mt-1 text-xl font-semibold">
              Route scenarios
            </h2>
          </div>

          <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
            {VISUAL_FIXTURE_MANIFEST.scenarios.map((scenario) => (
              <li key={scenario.id} className="min-w-0 bg-background p-4">
                <div className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 text-sm font-semibold break-words">
                      {scenario.label}
                    </h3>
                    <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {scenario.expectedUiState === "not_found"
                        ? `Not-found UI · ${scenario.expectedStatus}`
                        : `Expected ${scenario.expectedStatus}`}
                    </span>
                  </div>
                  <code className="line-clamp-2 text-xs break-all text-muted-foreground">
                    {scenario.path}
                  </code>
                  <Link
                    href={scenario.path}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "mt-auto w-fit",
                    })}
                  >
                    Open route
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <Separator />

        <section
          aria-labelledby="state-coverage-heading"
          className="grid gap-4"
        >
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ListChecks className="size-4" aria-hidden="true" />
              Explicit visual and privacy boundaries
            </p>
            <h2
              id="state-coverage-heading"
              className="mt-1 text-xl font-semibold"
            >
              State coverage
            </h2>
          </div>

          <ul className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
            {VISUAL_FIXTURE_MANIFEST.stateCoverage.map((state) => (
              <li key={state.id} className="min-w-0 bg-background p-4">
                <div className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 text-sm font-semibold break-words">
                      {state.label}
                    </h3>
                    <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {state.count}
                    </span>
                  </div>
                  <p className="text-sm leading-5 text-muted-foreground">
                    {state.detail}
                  </p>
                  {state.path ? (
                    <Link
                      href={state.path}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "mt-auto w-fit",
                      })}
                    >
                      Open evidence
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="mt-auto text-xs font-medium text-muted-foreground">
                      Owner-only boundary · no public route
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <Separator />

        <section aria-labelledby="profile-heading" className="grid gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UsersRound className="size-4" aria-hidden="true" />
              Synthetic public identities
            </p>
            <h2 id="profile-heading" className="mt-1 text-xl font-semibold">
              Test profiles
            </h2>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {VISUAL_FIXTURE_MANIFEST.actors.map((actor) => (
              <li key={actor.id} className="min-w-0 bg-background p-4">
                <p className="text-sm font-semibold break-words">
                  {actor.displayName}
                </p>
                <Link
                  href={`/@${actor.handle}`}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  @{actor.handle}
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <Separator />

        <section
          id="media-gallery"
          aria-labelledby="media-heading"
          className="grid gap-4"
        >
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ImageIcon className="size-4" aria-hidden="true" />
              EXIF-free generated raster set
            </p>
            <h2 id="media-heading" className="mt-1 text-xl font-semibold">
              Media aspect gallery
            </h2>
          </div>

          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VISUAL_FIXTURE_MANIFEST.media.map((item) => (
              <figure
                key={item.id}
                className="min-w-0 overflow-hidden rounded-lg border border-border bg-background"
              >
                <div
                  className={cn(
                    "relative w-full bg-muted",
                    aspectClass(item.aspect),
                  )}
                >
                  <Image
                    src={getPublicDerivativeUrl(item.derivativeKey)}
                    alt={item.altText}
                    fill
                    sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
                    className="object-cover"
                    loading="eager"
                    unoptimized
                  />
                </div>
                <figcaption className="grid gap-1 p-3">
                  <span className="text-sm font-medium">
                    {aspectLabel(item.aspect)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.width} × {item.height}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function CountFact({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 bg-background px-3 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function aspectClass(aspect: VisualFixtureMediaAspect) {
  return {
    square: "aspect-square",
    landscape_4_3: "aspect-[4/3]",
    portrait_3_4: "aspect-[3/4]",
    wide_16_9: "aspect-video",
  }[aspect];
}

function aspectLabel(aspect: VisualFixtureMediaAspect) {
  return {
    square: "square",
    landscape_4_3: "landscape 4:3",
    portrait_3_4: "portrait 3:4",
    wide_16_9: "wide 16:9",
  }[aspect];
}
