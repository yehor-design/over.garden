import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  Flag,
  ImageOff,
  MapPin,
  MoreHorizontal,
  PawPrint,
  Settings,
  ShieldBan,
  Sprout,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import {
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { AuthIntentAction } from "@/lib/auth/auth-intent-contract";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import { publicProfilePath } from "@/lib/garden/public-paths";
import { localizedPath } from "@/lib/public-localization";
import {
  getPublicProfileCopy,
  PUBLIC_PROFILE_LANGUAGE_LABELS,
} from "@/lib/public-profile-copy";
import { cn } from "@/lib/utils";
import type { ProfileViewerState } from "@/server/profile-interaction-repository";
import type {
  PublicProfileEvidencePage,
  PublicProfileJournalEvidence,
  PublicProfileObjectEvidence,
} from "@/server/public-profile-repository";
import {
  blockProfileAction,
  followProfileAction,
  reportProfileAction,
  unfollowProfileAction,
} from "@/app/[locale]/[profileHandle]/actions";

const OBJECT_PREVIEW_SIZE = 6;
const JOURNAL_PREVIEW_SIZE = 8;
const COUNTRY_ONLY_PROFILE_REGION_CODES = new Set(["UA-30", "UA-40", "BG-22"]);

type PublicProfileViewer = ProfileViewerState | { kind: "guest" };

export function PublicProfileView({
  profile,
  locale,
  viewer,
  actionStatus,
  previewVisibility,
  headingLevel = "h1",
  resumeAction = null,
  resumeControl = null,
}: {
  profile: PublicProfileEvidencePage;
  locale: InterfaceLocale;
  viewer: PublicProfileViewer;
  actionStatus?: string | null;
  previewVisibility?: "public" | "private";
  headingLevel?: "h1" | "h2" | "h3";
  resumeAction?: AuthIntentAction | null;
  resumeControl?: string | null;
}) {
  const copy = getPublicProfileCopy(locale);
  const basePath = publicProfilePath(locale, profile.handle);
  const visibleObjects = profile.objects.slice(0, OBJECT_PREVIEW_SIZE);
  const moreObjects = profile.objects.slice(OBJECT_PREVIEW_SIZE);
  const visibleJournals = profile.journals.slice(0, JOURNAL_PREVIEW_SIZE);
  const moreJournals = profile.journals.slice(JOURNAL_PREVIEW_SIZE);
  const regionLabel = publicProfileRegionLabel(profile.coarseRegionCode);
  const actionMessage = profileActionMessage(actionStatus, locale);
  const ownerEmptyState =
    viewer.kind === "owner" || previewVisibility !== undefined;
  const ProfileHeading = headingLevel;

  return (
    <article
      data-public-profile="v2"
      data-profile-content-order="objects-journals-about"
      className="grid gap-8"
    >
      <AuthIntentFocus action={resumeAction} control={resumeControl} />
      <SiteShellContextRailRegistration
        modules={buildPublicProfileContextModules(profile, locale)}
      />

      <header className="grid gap-5 border-b border-border pb-6">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
          <ProfileAvatar profile={profile} />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {copy.profileLabel}
                </p>
                {previewVisibility === "private" ? (
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    {copy.privateProfile}
                  </span>
                ) : null}
              </div>
              <ProfileHeading className="mt-1 text-2xl leading-tight font-semibold break-words text-foreground sm:text-3xl">
                {profile.displayName}
              </ProfileHeading>
              <p className="mt-1 text-sm font-medium break-words text-muted-foreground">
                {profile.mention}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {regionLabel ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" aria-hidden="true" />
                  {regionLabel}
                </span>
              ) : null}
              {profile.languages.length > 0 ? (
                <span>
                  {profile.languages
                    .map(
                      (language) =>
                        PUBLIC_PROFILE_LANGUAGE_LABELS[locale][language],
                    )
                    .join(" · ")}
                </span>
              ) : null}
            </div>

            <ProfileActions
              profile={profile}
              locale={locale}
              viewer={viewer}
              returnTo={basePath}
              resumeAction={resumeAction}
            />
          </div>
        </div>

        {actionMessage ? (
          <p
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
            role="status"
          >
            {actionMessage}
          </p>
        ) : null}

        <ProfileStats profile={profile} locale={locale} />
      </header>

      <section id="profile-objects" className="grid gap-4">
        <SectionHeading
          title={copy.objectsTitle}
          description={copy.objectsDescription}
        />
        {visibleObjects.length > 0 ? (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {visibleObjects.map((object) => (
                <li key={object.objectId}>
                  <ProfileObjectCard object={object} locale={locale} />
                </li>
              ))}
            </ul>
            {moreObjects.length > 0 ? (
              <details className="group grid gap-3">
                <summary className="w-fit cursor-pointer list-none text-sm font-semibold text-primary hover:underline">
                  {copy.showMore(moreObjects.length, profile.hasMoreObjects)}
                </summary>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {moreObjects.map((object) => (
                    <li key={object.objectId}>
                      <ProfileObjectCard object={object} locale={locale} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : (
          <ProfileEmptyState
            message={ownerEmptyState ? copy.noOwnerObjects : copy.noObjects}
            ownerAction={ownerEmptyState ? copy.addFirstObject : null}
          />
        )}
      </section>

      <section
        id="profile-journals"
        className="grid gap-4 border-t border-border pt-7"
      >
        <SectionHeading
          title={copy.journalsTitle}
          description={copy.journalsDescription}
        />
        {visibleJournals.length > 0 ? (
          <>
            <ol className="divide-y divide-border border-y border-border">
              {visibleJournals.map((journal) => (
                <li key={journal.entryId}>
                  <ProfileJournalRow journal={journal} locale={locale} />
                </li>
              ))}
            </ol>
            {moreJournals.length > 0 ? (
              <details className="group grid gap-3">
                <summary className="w-fit cursor-pointer list-none text-sm font-semibold text-primary hover:underline">
                  {copy.showMore(moreJournals.length, profile.hasMoreJournals)}
                </summary>
                <ol className="mt-3 divide-y divide-border border-y border-border">
                  {moreJournals.map((journal) => (
                    <li key={journal.entryId}>
                      <ProfileJournalRow journal={journal} locale={locale} />
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </>
        ) : (
          <ProfileEmptyState
            message={ownerEmptyState ? copy.noOwnerJournals : copy.noJournals}
          />
        )}
      </section>

      <section
        id="profile-about"
        className="grid gap-3 border-t border-border pt-7"
      >
        <h2 className="text-xl font-semibold text-foreground">
          {copy.aboutTitle}
        </h2>
        <p className="max-w-2xl text-sm leading-6 break-words whitespace-pre-wrap text-foreground">
          {profile.bio ?? copy.aboutEmpty}
        </p>
        {profile.summary.relationships === null ? (
          <p className="text-sm text-muted-foreground">
            {copy.relationshipsHidden}
          </p>
        ) : null}
      </section>
    </article>
  );
}

function publicProfileRegionLabel(code: string | null) {
  const label = getCoarseRegionLabel(code);
  if (!label || !code || !COUNTRY_ONLY_PROFILE_REGION_CODES.has(code)) {
    return label;
  }

  return label.split(" - ")[0] ?? null;
}

function ProfileAvatar({ profile }: { profile: PublicProfileEvidencePage }) {
  if (profile.avatarUrl) {
    return (
      <Image
        src={profile.avatarUrl}
        alt={profile.avatarAlt}
        width={112}
        height={112}
        sizes="112px"
        unoptimized
        priority
        className="size-24 shrink-0 rounded-full border border-border bg-muted object-cover sm:size-28"
      />
    );
  }

  return (
    <div
      className="flex size-24 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-2xl font-semibold text-muted-foreground sm:size-28"
      aria-label={profile.avatarAlt}
    >
      {initials(profile.displayName, profile.handle)}
    </div>
  );
}

function ProfileStats({
  profile,
  locale,
}: {
  profile: PublicProfileEvidencePage;
  locale: InterfaceLocale;
}) {
  const copy = getPublicProfileCopy(locale);
  const stats = [
    { label: copy.publicObjects, value: profile.summary.publicObjectCount },
    { label: copy.publicEntries, value: profile.summary.publicEntryCount },
    ...(profile.summary.relationships
      ? [
          {
            label: copy.followers,
            value: profile.summary.relationships.followers,
          },
          {
            label: copy.following,
            value: profile.summary.relationships.following,
          },
        ]
      : []),
  ];

  return (
    <dl className="grid grid-cols-2 border-y border-border sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="min-w-0 border-b border-border px-3 py-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
        >
          <dt className="truncate text-xs text-muted-foreground">
            {stat.label}
          </dt>
          <dd className="mt-1 text-xl font-semibold text-foreground tabular-nums">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProfileActions({
  profile,
  locale,
  viewer,
  returnTo,
  resumeAction,
}: {
  profile: PublicProfileEvidencePage;
  locale: InterfaceLocale;
  viewer: PublicProfileViewer;
  returnTo: string;
  resumeAction: AuthIntentAction | null;
}) {
  const copy = getPublicProfileCopy(locale);
  const target = { kind: "profile" as const, ref: profile.handle };
  const hiddenFields = (
    <>
      <input type="hidden" name="handle" value={profile.handle} />
      <input type="hidden" name="locale" value={locale} />
    </>
  );

  if (viewer.kind === "owner") {
    return (
      <Link
        href="/garden/profile#public-profile-editor"
        className={buttonVariants({ size: "sm", className: "w-fit" })}
      >
        <Settings aria-hidden="true" />
        {copy.manageProfile}
      </Link>
    );
  }

  if (viewer.kind === "blocked" || viewer.kind === "unavailable") return null;

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      {viewer.kind === "guest" ? (
        <AuthIntentTrigger
          action="follow"
          returnTo={returnTo}
          target={target}
          label={copy.follow}
          icon={<UserPlus aria-hidden="true" />}
          size="sm"
          id="lineage-follow"
        />
      ) : viewer.kind === "following" ? (
        <DocumentMutationActionForm
          action={unfollowProfileAction}
          id="lineage-follow"
        >
          {hiddenFields}
          <button
            type="submit"
            data-auth-intent-control="follow"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <UserMinus aria-hidden="true" />
            {copy.unfollow}
          </button>
        </DocumentMutationActionForm>
      ) : (
        <DocumentMutationActionForm
          action={followProfileAction}
          id="lineage-follow"
        >
          {hiddenFields}
          <button
            type="submit"
            data-auth-intent-control="follow"
            className={buttonVariants({ size: "sm" })}
          >
            <UserPlus aria-hidden="true" />
            {copy.follow}
          </button>
        </DocumentMutationActionForm>
      )}

      <details
        className="group w-full sm:relative sm:w-auto"
        id="profile-report"
        open={
          resumeAction === "report" || resumeAction === "block" || undefined
        }
      >
        <summary
          className={cn(
            buttonVariants({ variant: "outline", size: "icon" }),
            "cursor-pointer list-none",
          )}
          aria-label={copy.moreActions}
          title={copy.moreActions}
        >
          <MoreHorizontal aria-hidden="true" />
        </summary>
        <div className="absolute inset-x-0 top-11 z-20 grid w-auto gap-3 rounded-md border border-border bg-background p-3 shadow-lg sm:right-0 sm:left-auto sm:w-64">
          {viewer.kind === "guest" ? (
            <>
              <AuthIntentTrigger
                action="report"
                returnTo={returnTo}
                target={target}
                label={copy.report}
                icon={<Flag aria-hidden="true" />}
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                formClassName="w-full"
              />
              <AuthIntentTrigger
                action="block"
                returnTo={returnTo}
                target={target}
                label={copy.block}
                icon={<ShieldBan aria-hidden="true" />}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-destructive"
                formClassName="w-full"
                id="profile-block"
              />
            </>
          ) : (
            <>
              <DocumentMutationActionForm
                action={reportProfileAction}
                className="grid gap-2"
              >
                {hiddenFields}
                <label className="grid gap-1 text-xs font-medium text-foreground">
                  {copy.reportTitle}
                  <select
                    name="reason"
                    defaultValue="spam"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  >
                    {Object.entries(copy.reportReasons).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <button
                  type="submit"
                  data-auth-intent-control="report"
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                    className: "justify-start",
                  })}
                >
                  <Flag aria-hidden="true" />
                  {copy.reportSubmit}
                </button>
              </DocumentMutationActionForm>
              <DocumentMutationActionForm
                action={blockProfileAction}
                id="profile-block"
              >
                {hiddenFields}
                <button
                  type="submit"
                  data-auth-intent-control="block"
                  className={buttonVariants({
                    variant: "ghost",
                    size: "sm",
                    className: "w-full justify-start text-destructive",
                  })}
                >
                  <ShieldBan aria-hidden="true" />
                  {copy.block}
                </button>
              </DocumentMutationActionForm>
            </>
          )}
        </div>
      </details>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-1">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function ProfileObjectCard({
  object,
  locale,
}: {
  object: PublicProfileObjectEvidence;
  locale: InterfaceLocale;
}) {
  const copy = getPublicProfileCopy(locale);
  const identityState = {
    confirmed: copy.identityConfirmed,
    provisional: copy.identityProvisional,
    unknown: copy.identityUnknown,
  }[object.identityState];

  return (
    <Link
      href={object.publicPath}
      className="group grid h-full overflow-hidden rounded-md border border-border bg-background transition-colors hover:border-primary/60"
    >
      {object.coverImageUrl ? (
        <SubjectAwareMediaImage
          src={object.coverImageUrl}
          alt={object.coverImageAlt}
          width={640}
          height={480}
          sizes="(min-width: 640px) 20rem, 100vw"
          unoptimized
          presentationMode="cover"
          focalX={object.coverFocalX}
          focalY={object.coverFocalY}
          intrinsicWidth={object.coverIntrinsicWidth}
          intrinsicHeight={object.coverIntrinsicHeight}
          className="aspect-4/3 w-full border-b border-border bg-muted"
        />
      ) : (
        <span className="flex aspect-4/3 w-full items-center justify-center border-b border-border bg-muted text-muted-foreground">
          <ImageOff className="size-7" aria-hidden="true" />
        </span>
      )}
      <span className="grid gap-2 p-3">
        <span className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 text-primary">
            <ObjectKindIcon kind={object.objectKind} />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold break-words text-foreground group-hover:text-primary">
              {object.displayName}
            </span>
            <span className="mt-0.5 block text-xs break-words text-muted-foreground">
              {object.identityLabel ?? identityState}
            </span>
          </span>
        </span>
        <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{copy.entryCount(object.publicEntryCount)}</span>
          <time dateTime={dateTimeValue(object.latestEntryDate)}>
            {formatDate(object.latestEntryDate, locale)}
          </time>
        </span>
      </span>
    </Link>
  );
}

function ProfileJournalRow({
  journal,
  locale,
}: {
  journal: PublicProfileJournalEvidence;
  locale: InterfaceLocale;
}) {
  return (
    <article className="grid gap-3 py-4 sm:flex">
      <Link
        href={journal.publicPath}
        aria-label={journal.title}
        className="block shrink-0"
      >
        {journal.coverImageUrl ? (
          <SubjectAwareMediaImage
            src={journal.coverImageUrl}
            alt={journal.coverImageAlt}
            width={320}
            height={240}
            sizes="120px"
            unoptimized
            presentationMode="cover"
            focalX={journal.coverFocalX}
            focalY={journal.coverFocalY}
            intrinsicWidth={journal.coverIntrinsicWidth}
            intrinsicHeight={journal.coverIntrinsicHeight}
            className="aspect-4/3 w-full rounded-md border border-border bg-muted sm:w-30"
          />
        ) : (
          <span className="flex aspect-4/3 w-full items-center justify-center rounded-md border border-border bg-muted text-muted-foreground sm:w-30">
            <BookOpen className="size-6" aria-hidden="true" />
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <time dateTime={dateTimeValue(journal.entryDate)}>
            {formatDate(journal.entryDate, locale)}
          </time>
          <span aria-hidden="true">·</span>
          {journal.context.publicPath ? (
            <Link
              href={journal.context.publicPath}
              className="font-medium hover:text-primary hover:underline"
            >
              {journal.context.label}
            </Link>
          ) : (
            <span>{journal.context.label}</span>
          )}
        </div>
        <h3 className="mt-1 text-base font-semibold break-words text-foreground">
          <Link
            href={journal.publicPath}
            className="hover:text-primary hover:underline"
          >
            {journal.title}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 break-words text-muted-foreground">
          {journal.bodyPreview}
        </p>
      </div>
    </article>
  );
}

function ProfileEmptyState({
  message,
  ownerAction,
}: {
  message: string;
  ownerAction?: string | null;
}) {
  return (
    <div className="grid gap-3 border-y border-dashed border-border py-6 text-sm text-muted-foreground">
      <p>{message}</p>
      {ownerAction ? (
        <Link
          href="/garden#first-entry-composer"
          className={buttonVariants({ size: "sm", className: "w-fit" })}
        >
          <Sprout aria-hidden="true" />
          {ownerAction}
        </Link>
      ) : null}
    </div>
  );
}

function ObjectKindIcon({
  kind,
}: {
  kind: PublicProfileObjectEvidence["objectKind"];
}) {
  if (kind === "animal")
    return <PawPrint className="size-4" aria-hidden="true" />;
  return <Sprout className="size-4" aria-hidden="true" />;
}

export function buildPublicProfileContextModules(
  profile: PublicProfileEvidencePage,
  locale: InterfaceLocale,
): SiteShellContextRailModule[] {
  const copy = getPublicProfileCopy(locale);
  const relationshipItems = profile.summary.relationships
    ? [
        {
          href: "#profile-about",
          label: copy.followers,
          meta: String(profile.summary.relationships.followers),
        },
        {
          href: "#profile-about",
          label: copy.following,
          meta: String(profile.summary.relationships.following),
        },
      ]
    : [];
  const domainItems = [
    { label: copy.plants, value: profile.summary.objectKinds.plant },
    { label: copy.animals, value: profile.summary.objectKinds.animal },
  ]
    .filter((item) => item.value > 0)
    .map((item) => ({
      href: "#profile-objects",
      label: item.label,
      meta: String(item.value),
    }));

  return [
    {
      key: "profile-objects",
      title: copy.objectsTitle,
      items: domainItems,
      emptyLabel: copy.noObjects,
    },
    {
      key: "profile-activity",
      title: copy.activity,
      items: [
        {
          href: "#profile-journals",
          label: copy.publicEntries,
          meta: String(profile.summary.publicEntryCount),
        },
        {
          href: "#profile-about",
          label: copy.lineage,
          meta: String(profile.summary.confirmedLineageEdgeCount),
        },
        ...relationshipItems,
      ],
    },
    {
      key: "profile-navigation",
      title: copy.navigation,
      items: [
        { href: "#profile-objects", label: copy.objectsTitle },
        { href: "#profile-journals", label: copy.journalsTitle },
        {
          href: localizedPath(locale, "/feed"),
          label: copy.followedFeed,
        },
        { href: "/garden/lineage/claims", label: copy.lineageClaims },
      ],
    },
  ];
}

function profileActionMessage(
  status: string | null | undefined,
  locale: InterfaceLocale,
) {
  const messages = getPublicProfileCopy(locale).actionMessages;
  if (!status || !(status in messages)) return null;
  return messages[status as keyof typeof messages];
}

function initials(displayName: string, handle: string) {
  const value = displayName.startsWith("@") ? handle : displayName;
  return (
    value
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || handle.slice(0, 2).toUpperCase()
  );
}

function dateTimeValue(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function formatDate(value: Date | string, locale: InterfaceLocale) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
