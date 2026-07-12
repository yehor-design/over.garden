import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  BookOpenText,
  CheckCircle2,
  Database,
  Fingerprint,
  ImageIcon,
  KeyRound,
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
import { VisualIntentDraftTrigger } from "./visual-intent-draft-trigger";

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

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4 lg:grid-cols-6">
            <CountFact label="Fixture users" value={status.actual.actors} />
            <CountFact label="Public profiles" value={status.actual.profiles} />
            <CountFact
              label="Profile follows"
              value={status.actual.profileFollows}
            />
            <CountFact
              label="Profile blocks"
              value={status.actual.profileBlocks}
            />
            <CountFact
              label="Profile reports"
              value={status.actual.profileReports}
            />
            <CountFact label="Spaces" value={status.actual.spaces} />
            <CountFact
              label="Catalog identities"
              value={status.actual.catalogItems}
            />
            <CountFact
              label="Catalog names"
              value={status.actual.catalogNames}
            />
            <CountFact label="Living objects" value={status.actual.objects} />
            <CountFact
              label="Pending lineage"
              value={status.actual.lineagePendingIdentities}
            />
            <CountFact
              label="Claimable edges"
              value={status.actual.lineageEdges}
            />
            <CountFact label="Journal entries" value={status.actual.entries} />
            <CountFact
              label="Object mentions"
              value={status.actual.objectMentions}
            />
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
          aria-labelledby="profile-evidence-heading"
          className="grid gap-4"
        >
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UsersRound className="size-4" aria-hidden="true" />
              Public-safe identity through production profile loaders
            </p>
            <h2
              id="profile-evidence-heading"
              className="mt-1 text-xl font-semibold"
            >
              Gardener-profile V2 evidence
            </h2>
          </div>

          <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
            {VISUAL_FIXTURE_MANIFEST.profileEvidence.scenarios.map(
              (scenario) => (
                <li key={scenario.id} className="min-w-0 bg-background p-4">
                  <div className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 text-sm font-semibold break-words">
                        {scenario.id.replaceAll("-", " ")}
                      </h3>
                      <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {scenario.expectedStatus}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <PassportEvidenceFact
                        label="Access"
                        value={scenario.access.replaceAll("-", " ")}
                      />
                      <PassportEvidenceFact
                        label="Content"
                        value={scenario.contentState}
                      />
                      <PassportEvidenceFact
                        label="Objects"
                        value={`${scenario.expectedPublicObjectCount} · load ${scenario.expectedObjectIds.length}`}
                      />
                      <PassportEvidenceFact
                        label="Journals"
                        value={`${scenario.expectedPublicEntryCount} · load ${scenario.expectedJournalEntryIds.length}`}
                      />
                      <PassportEvidenceFact
                        label="Avatar"
                        value={scenario.expectedAvatar ? "raster" : "none"}
                      />
                      <PassportEvidenceFact
                        label="Viewports"
                        value="desktop + 320"
                      />
                    </dl>
                    <Link
                      href={scenario.path}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "mt-auto w-fit",
                      })}
                    >
                      Open profile
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              ),
            )}
          </ol>
        </section>

        <Separator />

        <section aria-labelledby="passport-heading" className="grid gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Fingerprint className="size-4" aria-hidden="true" />
              Public lifecycle and owner scope through production loaders
            </p>
            <h2 id="passport-heading" className="mt-1 text-xl font-semibold">
              Living-object passport evidence
            </h2>
          </div>

          <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
            {VISUAL_FIXTURE_MANIFEST.passportEvidence.scenarios.map(
              (scenario) => (
                <li key={scenario.id} className="min-w-0 bg-background p-4">
                  <div className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 text-sm font-semibold break-words">
                        {scenario.id.replaceAll("-", " ")}
                      </h3>
                      <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {scenario.expectedStatus}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <PassportEvidenceFact
                        label="Access"
                        value={scenario.access.replaceAll("-", " ")}
                      />
                      <PassportEvidenceFact
                        label="Kind"
                        value={scenario.objectKind.replaceAll("_", " ")}
                      />
                      <PassportEvidenceFact
                        label="Identity"
                        value={scenario.identityState}
                      />
                      <PassportEvidenceFact
                        label="Timeline"
                        value={`${scenario.timelineState} · ${scenario.expectedTimelineCount}`}
                      />
                      <PassportEvidenceFact
                        label="Media"
                        value={`${scenario.mediaState} · ${scenario.expectedMediaAspects.length}`}
                      />
                      <PassportEvidenceFact
                        label="Viewports"
                        value="desktop + 320"
                      />
                    </dl>
                    <Link
                      href={scenario.path}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "mt-auto w-fit",
                      })}
                    >
                      Open passport
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              ),
            )}
          </ol>
        </section>

        <Separator />

        <section aria-labelledby="journal-entry-heading" className="grid gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BookOpenText className="size-4" aria-hidden="true" />
              Production read model, lifecycle, chronology, and owner scope
            </p>
            <h2
              id="journal-entry-heading"
              className="mt-1 text-xl font-semibold"
            >
              Journal-entry V2 evidence
            </h2>
          </div>

          <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
            {VISUAL_FIXTURE_MANIFEST.journalEntryEvidence.scenarios.map(
              (scenario) => (
                <li key={scenario.id} className="min-w-0 bg-background p-4">
                  <div className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 text-sm font-semibold break-words">
                        {scenario.id.replaceAll("-", " ")}
                      </h3>
                      <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {scenario.expectedStatus}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <PassportEvidenceFact
                        label="Access"
                        value={scenario.access.replaceAll("-", " ")}
                      />
                      <PassportEvidenceFact
                        label="Context"
                        value={scenario.contextKind}
                      />
                      <PassportEvidenceFact
                        label="Content"
                        value={scenario.contentLength}
                      />
                      <PassportEvidenceFact
                        label="Media"
                        value={`${scenario.mediaState} · ${scenario.expectedMediaCount}`}
                      />
                      <PassportEvidenceFact
                        label="Chronology"
                        value={`${scenario.expectedNewer ? "newer" : "first"} · ${scenario.expectedOlder ? "older" : "last"}`}
                      />
                      <PassportEvidenceFact
                        label="Viewports"
                        value="desktop + 320"
                      />
                    </dl>
                    <Link
                      href={scenario.path}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "mt-auto w-fit",
                      })}
                    >
                      Open journal entry
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              ),
            )}
          </ol>
        </section>

        <Separator />

        <section aria-labelledby="intent-heading" className="grid gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <KeyRound className="size-4" aria-hidden="true" />
              Mutation boundaries and exact action recovery
            </p>
            <h2 id="intent-heading" className="mt-1 text-xl font-semibold">
              Intent-aware authentication
            </h2>
          </div>

          <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
            {VISUAL_FIXTURE_MANIFEST.intentEvidence.scenarios.map(
              (scenario) => (
                <li key={scenario.id} className="min-w-0 bg-background p-4">
                  <div className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 text-sm font-semibold break-words">
                        {scenario.label}
                      </h3>
                      <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {intentStateLabel(scenario.state)}
                      </span>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      {scenario.draftKind ? (
                        <VisualIntentDraftTrigger
                          kind={scenario.draftKind}
                          objectId={scenario.target?.ref}
                          startPath={scenario.startPath}
                        />
                      ) : (
                        <Link
                          href={scenario.startPath}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                        >
                          Start intent
                          <ArrowUpRight aria-hidden="true" />
                        </Link>
                      )}
                      <Link
                        href={scenario.resumePath}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        Inspect resume
                      </Link>
                    </div>
                  </div>
                </li>
              ),
            )}
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

function PassportEvidenceFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium break-words text-foreground">
        {value}
      </dd>
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

function intentStateLabel(state: string) {
  return state.replaceAll("_", " ");
}
