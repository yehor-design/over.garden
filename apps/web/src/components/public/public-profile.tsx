import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpenIcon as BookOpen } from "@/components/icons/BookOpen";
import { FlagIcon as Flag } from "@/components/icons/Flag";
import { MapPinIcon as MapPin } from "@/components/icons/MapPin";
import { DotsThreeIcon as MoreHorizontal } from "@/components/icons/DotsThree";
import { NotePencilIcon as NotePencil } from "@/components/icons/NotePencil";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlusIcon as Plus } from "@/components/icons/Plus";
import { ShieldSlashIcon as ShieldBan } from "@/components/icons/ShieldSlash";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import { TranslateIcon as Translate } from "@/components/icons/Translate";
import { UserMinusIcon as UserMinus } from "@/components/icons/UserMinus";
import { UserPlusIcon as UserPlus } from "@/components/icons/UserPlus";

import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { PublicFeedEntryCard } from "@/components/public/public-feed-entry-card";
import { PublicProfileTabs } from "@/components/public/public-profile-tabs";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link as TextLink } from "@/components/ui/link";
import { MediaFigure } from "@/components/ui/media-figure";
import { Pagination } from "@/components/ui/pagination";
import { ProfileHeader } from "@/components/ui/profile-header";
import { Section } from "@/components/ui/section";
import type { TabModel } from "@/components/ui/tabs";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { AuthIntentAction } from "@/lib/auth/auth-intent-contract";
import { entryCardDates, entryCardFeedLabels } from "@/lib/entry-card-dates";
import { getLocalizedCoarseRegionLabel } from "@/lib/garden/regions";
import { publicProfilePath } from "@/lib/garden/public-paths";
import { resolveIllustration } from "@/lib/illustrations";
import { firstPhotographIndex } from "@/lib/media/first-photograph";
import {
  publicProfileListHref,
  type PublicProfileTabId,
} from "@/lib/public-profile-tabs";
import {
  formatPublicProfileCount,
  getPublicProfileCopy,
  PUBLIC_PROFILE_LANGUAGE_LABELS,
} from "@/lib/public-profile-copy";
import { formatPublicCount } from "@/lib/public-surface-localization";
import { cn } from "@/lib/utils";
import type { ProfileViewerState } from "@/server/profile-interaction-repository";
import type {
  PublicProfileEvidencePage,
  PublicProfileListPage,
  PublicProfileObjectEvidence,
} from "@/server/public-profile-repository";
import {
  blockProfileAction,
  followProfileAction,
  reportProfileAction,
  unfollowProfileAction,
} from "@/app/[locale]/[profileHandle]/actions";
import { iconButtonVariants } from "@/components/ui/icon-button";
import { HiddenField } from "@/components/ui/hidden-field";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

/**
 * A city is more precise than a profile should say where its gardener lives,
 * so for these codes only the country is shown.
 */
const COUNTRY_ONLY_PROFILE_REGION_CODES = new Set(["UA-30", "UA-40", "BG-22"]);

type PublicProfileViewer = ProfileViewerState | { kind: "guest" };

/**
 * A gardener's public profile (`OVE-494`).
 *
 * Who they are — name, handle, picture, bio, where and in which languages,
 * how many follow them — and what they published, in two views: **Entries**,
 * every observation as the feed's own card, and **Objects**, the living
 * subjects whose journals those entries make up. Each list pages through
 * everything; nothing past a first screenful is out of reach.
 *
 * The page is the same document for every reader. The one thing that knows
 * who is reading is the action slot — follow for a visitor, edit for the
 * gardener — and it resolves on the server beside the static facts, never
 * inside them.
 */
export function PublicProfileView({
  profile,
  locale,
  viewer,
  actionStatus,
  preview = false,
  headingLevel = "h1",
  activeTab = "entries",
  resumeAction = null,
  resumeControl = null,
  actionSlot,
}: {
  profile: PublicProfileEvidencePage;
  locale: InterfaceLocale;
  viewer: PublicProfileViewer;
  actionSlot?: ReactNode;
  actionStatus?: string | null;
  /** The owner's editor preview shows the owner-facing empty states. */
  preview?: boolean;
  headingLevel?: "h1" | "h2" | "h3";
  /** From `?tab=`, already normalized. The server decides what is open. */
  activeTab?: PublicProfileTabId;
  resumeAction?: AuthIntentAction | null;
  resumeControl?: string | null;
}) {
  const copy = getPublicProfileCopy(locale);
  const basePath = publicProfilePath(locale, profile.handle);
  const regionLabel = publicProfileRegionLabel(
    locale,
    profile.coarseRegionCode,
  );
  const actionMessage = profileActionMessage(actionStatus, locale);
  const ownerEmptyState = viewer.kind === "owner" || preview;
  // Heading levels never skip (DESIGN.md §8). On the profile's own page the
  // gardener's name is the `h1` and a tab panel's section is an `h2`; inside
  // the owner's preview the whole thing is already nested, so both drop a
  // level rather than the section outranking the name it belongs to.
  const sectionLevel = headingLevel === "h1" ? 2 : 3;
  const cardHeadingLevel = 3;
  // Only the open panel's first photograph is asked for at once: a panel the
  // reader cannot see has nothing on the first screen.
  const standalone = headingLevel === "h1";
  const entryPhotograph =
    standalone && activeTab === "entries"
      ? firstPhotographIndex(
          profile.entries.items,
          (entry) => entry.media.length > 0,
        )
      : -1;
  const objectPhotograph =
    standalone && activeTab === "objects"
      ? firstPhotographIndex(
          profile.objects.items,
          (object) => object.coverImageUrl !== null,
        )
      : -1;
  const relationships = profile.summary.relationships;
  const counts = relationships
    ? [
        relationships.followers > 0
          ? formatPublicProfileCount(
              locale,
              "followers",
              relationships.followers,
            )
          : null,
        relationships.following > 0
          ? formatPublicProfileCount(
              locale,
              "following",
              relationships.following,
            )
          : null,
      ].filter((count): count is string => count !== null)
    : [];

  const tabs: TabModel[] = [
    {
      id: "entries",
      label: (
        <ProfileTabLabel
          label={copy.entriesTab}
          count={profile.summary.publicEntryCount}
        />
      ),
      content: (
        <Section
          id="profile-entries"
          title={copy.entriesTab}
          level={sectionLevel}
          // The tab above already says the word, so the heading is the
          // region's name for a screen reader and nothing to the eye.
          headingClassName="sr-only"
        >
          {profile.entries.items.length > 0 ? (
            <>
              <ol className="grid list-none gap-4" data-profile-entries="true">
                {profile.entries.items.map((entry, index) => (
                  <li key={entry.id} className="min-w-0">
                    <PublicFeedEntryCard
                      locale={locale}
                      copy={entryCardFeedLabels(locale)}
                      entry={entry}
                      headingLevel={cardHeadingLevel}
                      priority={index === entryPhotograph}
                    />
                  </li>
                ))}
              </ol>
              {preview ? null : (
                <ProfileListPagination
                  label={copy.entriesPages}
                  list={profile.entries}
                  previousLabel={copy.newerEntries}
                  nextLabel={copy.olderEntries}
                  status={copy.pageStatus}
                  hrefFor={(page) =>
                    publicProfileListHref(basePath, "entries", page)
                  }
                />
              )}
            </>
          ) : profile.entries.page > 1 ? (
            <ProfilePageMissing
              message={copy.pageMissing}
              firstPageLabel={copy.firstPage}
              href={publicProfileListHref(basePath, "entries", 1)}
            />
          ) : (
            <EmptyState
              illustration={
                ownerEmptyState ? resolveIllustration("empty-journal") : null
              }
              variant={ownerEmptyState ? "first-run" : "no-results"}
              title={ownerEmptyState ? copy.noOwnerEntries : copy.noEntries}
              action={
                ownerEmptyState ? (
                  <Link href="/garden/new" className={buttonVariants({})}>
                    <NotePencil aria-hidden="true" />
                    {copy.newEntry}
                  </Link>
                ) : null
              }
            />
          )}
        </Section>
      ),
    },
    {
      id: "objects",
      label: (
        <ProfileTabLabel
          label={copy.objectsTab}
          count={profile.summary.publicObjectCount}
        />
      ),
      content: (
        <Section
          id="profile-objects"
          title={copy.objectsTab}
          level={sectionLevel}
          headingClassName="sr-only"
        >
          {profile.objects.items.length > 0 ? (
            <>
              <ul
                className="grid list-none gap-4 sm:grid-cols-2"
                data-profile-objects="true"
              >
                {profile.objects.items.map((object, index) => (
                  <li key={object.objectId} className="min-w-0">
                    <ProfileObjectCard
                      object={object}
                      locale={locale}
                      headingLevel={cardHeadingLevel}
                      priority={index === objectPhotograph}
                    />
                  </li>
                ))}
              </ul>
              {preview ? null : (
                <ProfileListPagination
                  label={copy.objectsPages}
                  list={profile.objects}
                  previousLabel={copy.previousObjects}
                  nextLabel={copy.nextObjects}
                  status={copy.pageStatus}
                  hrefFor={(page) =>
                    publicProfileListHref(basePath, "objects", page)
                  }
                />
              )}
            </>
          ) : profile.objects.page > 1 ? (
            <ProfilePageMissing
              message={copy.pageMissing}
              firstPageLabel={copy.firstPage}
              href={publicProfileListHref(basePath, "objects", 1)}
            />
          ) : (
            <EmptyState
              illustration={
                ownerEmptyState ? resolveIllustration("empty-garden") : null
              }
              variant={ownerEmptyState ? "first-run" : "no-results"}
              title={ownerEmptyState ? copy.noOwnerObjects : copy.noObjects}
              action={
                ownerEmptyState ? (
                  <Link
                    // The workspace has one address in every language;
                    // `/bg/garden/...` is a 404 (`LOCALE_ROUTE_SEGMENTS`).
                    href="/garden/objects/new"
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    <Plus aria-hidden="true" />
                    {copy.addObject}
                  </Link>
                ) : null
              }
            />
          )}
        </Section>
      ),
    },
  ];

  return (
    <article
      data-public-profile="v3"
      data-profile-tab={activeTab}
      className="grid gap-6"
    >
      <AuthIntentFocus action={resumeAction} control={resumeControl} />

      <ProfileHeader
        avatarUrl={profile.avatarUrl}
        displayName={profile.displayName}
        handle={profile.mention}
        bio={profile.bio}
        headingLevel={headingLevel}
        meta={
          regionLabel || profile.languages.length > 0 ? (
            <>
              {regionLabel ? (
                <span
                  className="inline-flex items-center gap-1.5"
                  data-profile-region="true"
                >
                  <MapPin className="size-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{copy.region}: </span>
                  {regionLabel}
                </span>
              ) : null}
              {profile.languages.length > 0 ? (
                <span
                  className="inline-flex items-center gap-1.5"
                  data-profile-languages="true"
                >
                  <Translate className="size-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{copy.languages}: </span>
                  {profile.languages
                    .map(
                      (language) =>
                        PUBLIC_PROFILE_LANGUAGE_LABELS[locale][language],
                    )
                    .join(" · ")}
                </span>
              ) : null}
            </>
          ) : null
        }
        counts={counts}
        action={
          actionSlot ?? (
            <ProfileActions
              profile={profile}
              locale={locale}
              viewer={viewer}
              returnTo={basePath}
              resumeAction={resumeAction}
            />
          )
        }
      />

      {actionMessage ? (
        <Callout tone="info" live="polite">
          <p>{actionMessage}</p>
        </Callout>
      ) : null}

      {/* Real `Tabs` with roving tabindex, and the open one is in the URL:
          the server decides which panel is shown from `?tab=`, so a shared
          link opens where its sender was. Every panel is in the HTML however
          the tab stands, which is what keeps the entries indexable. */}
      <PublicProfileTabs
        label={copy.sectionsLabel}
        tabs={tabs}
        selectedId={activeTab}
        pageByTab={{
          entries: profile.entries.page,
          objects: profile.objects.page,
        }}
      />
    </article>
  );
}

/** A tab's name and how many things are behind it, as one accessible name. */
function ProfileTabLabel({ label, count }: { label: string; count: number }) {
  return (
    <>
      <span>{label}</span>
      {count > 0 ? (
        <span className="text-caption text-text-muted tabular-nums">
          {count}
        </span>
      ) : null}
    </>
  );
}

/**
 * The way through a list longer than a page.
 *
 * A list that fits on one page gets no navigation at all: two disabled edges
 * and a status line between them would be three controls saying nothing.
 */
function ProfileListPagination<Item>({
  label,
  list,
  previousLabel,
  nextLabel,
  status,
  hrefFor,
}: {
  label: string;
  list: PublicProfileListPage<Item>;
  previousLabel: string;
  nextLabel: string;
  status: string;
  hrefFor: (page: number) => string;
}) {
  if (list.pageCount <= 1) return null;
  const page = Math.min(list.page, list.pageCount);
  return (
    <Pagination
      label={label}
      previousLabel={previousLabel}
      previousHref={page > 1 ? hrefFor(page - 1) : null}
      nextLabel={nextLabel}
      nextHref={page < list.pageCount ? hrefFor(page + 1) : null}
      status={status
        .replace("{page}", String(page))
        .replace("{count}", String(list.pageCount))}
    />
  );
}

/**
 * A page past the end of a list. The proxy answers such an address with a
 * 404 before anything renders; this is what a reader sees if that lookup
 * could not be made — an honest sentence and the way back, never an empty
 * list dressed as a real one.
 */
function ProfilePageMissing({
  message,
  firstPageLabel,
  href,
}: {
  message: string;
  firstPageLabel: string;
  href: string;
}) {
  return (
    <p className="text-body-sm text-text-muted">
      {`${message} `}
      <TextLink href={href}>{firstPageLabel}</TextLink>
    </p>
  );
}

function publicProfileRegionLabel(
  locale: InterfaceLocale,
  code: string | null,
) {
  const label = getLocalizedCoarseRegionLabel(locale, code);
  if (!label || !code || !COUNTRY_ONLY_PROFILE_REGION_CODES.has(code)) {
    return label;
  }

  return label.split(" — ")[0] ?? null;
}

export function ProfileActions({
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
      <HiddenField name="handle" value={profile.handle} />
      <HiddenField name="locale" value={locale} />
    </>
  );

  if (viewer.kind === "owner") {
    // The gardener's own way to change what this page says. The editor is a
    // private settings page; nothing of it is embedded here.
    return (
      <Link
        href="/garden/profile#public-profile-editor"
        className={buttonVariants({
          variant: "secondary",
          size: "sm",
          className: "w-fit",
        })}
      >
        <NotePencil aria-hidden="true" />
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
        <OwnerScopedProgressiveForm
          action={unfollowProfileAction}
          id="lineage-follow"
        >
          {hiddenFields}
          <button
            type="submit"
            data-auth-intent-control="follow"
            /* DESIGN.md §5.6: the name is the state this will produce, so a
               reader knows what the control does before they press it. */
            aria-label={`${copy.unfollow}, ${profile.displayName}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <UserMinus aria-hidden="true" />
            {copy.unfollow}
          </button>
        </OwnerScopedProgressiveForm>
      ) : (
        <OwnerScopedProgressiveForm
          action={followProfileAction}
          id="lineage-follow"
        >
          {hiddenFields}
          <button
            type="submit"
            data-auth-intent-control="follow"
            aria-label={`${copy.follow}, ${profile.displayName}`}
            className={buttonVariants({ size: "sm" })}
          >
            <UserPlus aria-hidden="true" />
            {copy.follow}
          </button>
        </OwnerScopedProgressiveForm>
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
            iconButtonVariants({ variant: "secondary" }),
            "cursor-pointer list-none",
          )}
          aria-label={copy.moreActions}
          title={copy.moreActions}
        >
          <MoreHorizontal aria-hidden="true" />
        </summary>
        <div className="absolute inset-x-0 top-11 z-popover grid w-auto gap-3 rounded-lg border border-border bg-surface-raised p-3 shadow-lg sm:right-0 sm:left-auto sm:w-64">
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
                className="text-text-danger w-full justify-start"
                formClassName="w-full"
                id="profile-block"
              />
            </>
          ) : (
            <>
              <OwnerScopedProgressiveForm
                action={reportProfileAction}
                className="grid gap-2"
              >
                {hiddenFields}
                <Field label={copy.reportTitle} id="profile-report-reason">
                  <Select name="reason" size="sm" defaultValue="spam">
                    {Object.entries(copy.reportReasons).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>
                <button
                  type="submit"
                  data-auth-intent-control="report"
                  className={buttonVariants({
                    variant: "secondary",
                    size: "sm",
                    className: "justify-start",
                  })}
                >
                  <Flag aria-hidden="true" />
                  {copy.reportSubmit}
                </button>
              </OwnerScopedProgressiveForm>
              <OwnerScopedProgressiveForm
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
                    className: "text-text-danger w-full justify-start",
                  })}
                >
                  <ShieldBan aria-hidden="true" />
                  {copy.block}
                </button>
              </OwnerScopedProgressiveForm>
            </>
          )}
        </div>
      </details>
    </div>
  );
}

/**
 * One living object, as the journal its entries make up.
 *
 * It is a `Card`, not an `EntryCard`: an object is not one observation, it is
 * the history of many, and the card says so — "Журнал: 5 записів" and when
 * the last one was written — so a reader can tell a journal from an entry
 * before opening either (OG-UX-010). A photograph is shown when the journal
 * has one; without one the card is words and a small mark of the kind, not a
 * grey box standing in for a picture.
 */
function ProfileObjectCard({
  object,
  locale,
  headingLevel,
  priority,
}: {
  object: PublicProfileObjectEvidence;
  locale: InterfaceLocale;
  headingLevel: 2 | 3;
  priority: boolean;
}) {
  const copy = getPublicProfileCopy(locale);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titleId = `profile-object-${object.objectId}-title`;
  const kindLabel = object.objectKind === "animal" ? copy.animal : copy.plant;
  const latest = entryCardDates(locale, object.latestEntryDate, null);

  return (
    <Card
      as="article"
      interactive
      data-profile-object={object.objectId}
      aria-labelledby={titleId}
      className="grid h-full content-start gap-3 overflow-hidden p-4"
    >
      {object.coverImageUrl ? (
        <MediaFigure
          aspect="card"
          className="-mx-4 -mt-4"
          src={object.coverImageUrl}
          srcSet={
            buildPublicMediaSourceSet({
              publicUrl: object.coverImageUrl,
              intrinsicWidth: object.coverIntrinsicWidth,
              intrinsicHeight: object.coverIntrinsicHeight,
              variantLongEdges: object.coverVariantLongEdges,
            }).srcSet
          }
          placeholderDataUri={object.coverPlaceholderDataUri}
          alt={object.coverImageAlt}
          sizes="(min-width: 640px) 20rem, 100vw"
          focalX={object.coverFocalX}
          focalY={object.coverFocalY}
          intrinsicWidth={object.coverIntrinsicWidth}
          intrinsicHeight={object.coverIntrinsicHeight}
          priority={priority}
        />
      ) : null}

      <div className="flex min-w-0 items-start gap-3">
        {object.coverImageUrl ? null : (
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-muted"
          >
            <ObjectKindIcon kind={object.objectKind} />
          </span>
        )}
        <div className="grid min-w-0 gap-1">
          <Heading
            id={titleId}
            className="text-h3 break-words text-text-heading"
          >
            <TextLink
              href={object.publicPath}
              variant="quiet"
              className="text-text-heading"
            >
              {object.displayName}
            </TextLink>
          </Heading>
          <p className="text-caption break-words text-text-muted">
            {object.identityLabel ?? kindLabel}
          </p>
        </div>
      </div>

      <p
        data-profile-object-journal="true"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted"
      >
        <BookOpen className="size-4 shrink-0" aria-hidden="true" />
        <span>
          {copy.journal}:{" "}
          {formatPublicCount(locale, "entry", object.publicEntryCount)}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {copy.latestEntry.split("{date}")[0]}
          <time dateTime={latest.dateTime} className="tabular-nums">
            {latest.dateLabel}
          </time>
        </span>
      </p>
    </Card>
  );
}

function ObjectKindIcon({
  kind,
}: {
  kind: PublicProfileObjectEvidence["objectKind"];
}) {
  if (kind === "animal")
    return <PawPrint className="size-5" aria-hidden="true" />;
  return <Sprout className="size-5" aria-hidden="true" />;
}

export function profileActionMessage(
  status: string | null | undefined,
  locale: InterfaceLocale,
) {
  const messages = getPublicProfileCopy(locale).actionMessages;
  if (!status || !(status in messages)) return null;
  return messages[status as keyof typeof messages];
}
