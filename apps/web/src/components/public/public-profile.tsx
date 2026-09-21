import Link from "next/link";
import { BookOpenIcon as BookOpen } from "@/components/icons/BookOpen";
import { FlagIcon as Flag } from "@/components/icons/Flag";
import { MapPinIcon as MapPin } from "@/components/icons/MapPin";
import { DotsThreeIcon as MoreHorizontal } from "@/components/icons/DotsThree";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { GearIcon as Settings } from "@/components/icons/Gear";
import { ShieldSlashIcon as ShieldBan } from "@/components/icons/ShieldSlash";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import { UserMinusIcon as UserMinus } from "@/components/icons/UserMinus";
import { UserPlusIcon as UserPlus } from "@/components/icons/UserPlus";

import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { PublicProfileTabs } from "@/components/public/public-profile-tabs";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import {
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard } from "@/components/ui/entry-card";
import { Link as TextLink } from "@/components/ui/link";
import { MediaFigure } from "@/components/ui/media-figure";
import { ProfileHeader } from "@/components/ui/profile-header";
import { Section } from "@/components/ui/section";
import type { TabModel } from "@/components/ui/tabs";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { AuthIntentAction } from "@/lib/auth/auth-intent-contract";
import { getCoarseRegionLabel } from "@/lib/garden/regions";
import { publicProfilePath } from "@/lib/garden/public-paths";
import { resolveIllustration } from "@/lib/illustrations";
import {
  publicProfileTabHref,
  type PublicProfileTabId,
} from "@/lib/public-profile-tabs";
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
import { iconButtonVariants } from "@/components/ui/icon-button";
import { HiddenField } from "@/components/ui/hidden-field";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

const OBJECT_PREVIEW_SIZE = 6;
const JOURNAL_PREVIEW_SIZE = 8;
const COUNTRY_ONLY_PROFILE_REGION_CODES = new Set(["UA-30", "UA-40", "BG-22"]);

type PublicProfileViewer = ProfileViewerState | { kind: "guest" };

export function PublicProfileView({
  profile,
  locale,
  viewer,
  actionStatus,
  preview = false,
  headingLevel = "h1",
  activeTab = "objects",
  resumeAction = null,
  resumeControl = null,
}: {
  profile: PublicProfileEvidencePage;
  locale: InterfaceLocale;
  viewer: PublicProfileViewer;
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
  const visibleObjects = profile.objects.slice(0, OBJECT_PREVIEW_SIZE);
  const moreObjects = profile.objects.slice(OBJECT_PREVIEW_SIZE);
  const visibleJournals = profile.journals.slice(0, JOURNAL_PREVIEW_SIZE);
  const moreJournals = profile.journals.slice(JOURNAL_PREVIEW_SIZE);
  const regionLabel = publicProfileRegionLabel(profile.coarseRegionCode);
  const actionMessage = profileActionMessage(actionStatus, locale);
  const ownerEmptyState = viewer.kind === "owner" || preview;
  // Heading levels never skip (DESIGN.md §8). On the profile's own page the
  // gardener's name is the `h1` and a tab panel's section is an `h2`; inside
  // the owner's preview the whole thing is already nested, so both drop a
  // level rather than the section outranking the name it belongs to.
  const sectionLevel = headingLevel === "h1" ? 2 : 3;
  const cardHeadingLevel = 3;

  const tabs: TabModel[] = [
    {
      id: "objects",
      label: copy.objectsTitle,
      content: (
        <Section
          id="profile-objects"
          title={copy.objectsTitle}
          description={copy.objectsDescription}
          level={sectionLevel}
          // The tab above already says the word, so the heading is the
          // region's name for a screen reader and nothing to the eye.
          headingClassName="sr-only"
        >
          {visibleObjects.length > 0 ? (
            <>
              <ul className="grid list-none gap-4 sm:grid-cols-2">
                {visibleObjects.map((object, index) => (
                  <li key={object.objectId} className="min-w-0">
                    <ProfileObjectCard
                      object={object}
                      locale={locale}
                      headingLevel={cardHeadingLevel}
                      priority={index === 0 && headingLevel === "h1"}
                    />
                  </li>
                ))}
              </ul>
              {moreObjects.length > 0 ? (
                <details className="grid gap-3">
                  <summary
                    className={cn(
                      "min-h-11 w-fit cursor-pointer list-none content-center",
                      "text-link text-body-sm font-semibold hover:underline",
                    )}
                  >
                    {copy.showMore(moreObjects.length, profile.hasMoreObjects)}
                  </summary>
                  <ul className="grid list-none gap-4 sm:grid-cols-2">
                    {moreObjects.map((object) => (
                      <li key={object.objectId} className="min-w-0">
                        <ProfileObjectCard
                          object={object}
                          locale={locale}
                          headingLevel={cardHeadingLevel}
                          priority={false}
                        />
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
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
                    // `/bg/garden` is a 404 (`LOCALE_ROUTE_SEGMENTS`).
                    href="/garden"
                    className={buttonVariants({})}
                  >
                    <Sprout aria-hidden="true" />
                    {copy.addFirstObject}
                  </Link>
                ) : null
              }
            />
          )}
        </Section>
      ),
    },
    {
      id: "entries",
      label: copy.journalsTitle,
      content: (
        <Section
          id="profile-journals"
          title={copy.journalsTitle}
          description={copy.journalsDescription}
          level={sectionLevel}
          headingClassName="sr-only"
        >
          {visibleJournals.length > 0 ? (
            <>
              <ul className="grid list-none gap-4">
                {visibleJournals.map((journal, index) => (
                  <li key={journal.entryId} className="min-w-0">
                    <ProfileJournalCard
                      journal={journal}
                      locale={locale}
                      headingLevel={cardHeadingLevel}
                      priority={index === 0 && headingLevel === "h1"}
                    />
                  </li>
                ))}
              </ul>
              {moreJournals.length > 0 ? (
                <details className="grid gap-3">
                  <summary
                    className={cn(
                      "min-h-11 w-fit cursor-pointer list-none content-center",
                      "text-link text-body-sm font-semibold hover:underline",
                    )}
                  >
                    {copy.showMore(
                      moreJournals.length,
                      profile.hasMoreJournals,
                    )}
                  </summary>
                  <ul className="grid list-none gap-4">
                    {moreJournals.map((journal) => (
                      <li key={journal.entryId} className="min-w-0">
                        <ProfileJournalCard
                          journal={journal}
                          locale={locale}
                          headingLevel={cardHeadingLevel}
                          priority={false}
                        />
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : (
            <EmptyState
              illustration={
                ownerEmptyState ? resolveIllustration("empty-journal") : null
              }
              variant={ownerEmptyState ? "first-run" : "no-results"}
              title={ownerEmptyState ? copy.noOwnerJournals : copy.noJournals}
            />
          )}
        </Section>
      ),
    },
    {
      id: "about",
      label: copy.aboutTitle,
      content: (
        <Section
          id="profile-about"
          title={copy.aboutTitle}
          level={sectionLevel}
          headingClassName="sr-only"
        >
          <p className="max-w-prose text-body-sm break-words whitespace-pre-wrap text-text">
            {profile.bio ?? copy.aboutEmpty}
          </p>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {regionLabel ? (
              <AboutFact label={copy.region}>{regionLabel}</AboutFact>
            ) : null}
            {profile.languages.length > 0 ? (
              <AboutFact label={copy.languages}>
                {profile.languages
                  .map(
                    (language) =>
                      PUBLIC_PROFILE_LANGUAGE_LABELS[locale][language],
                  )
                  .join(" · ")}
              </AboutFact>
            ) : null}
            {profile.summary.confirmedLineageEdgeCount > 0 ? (
              <AboutFact label={copy.lineage}>
                {profile.summary.confirmedLineageEdgeCount}
              </AboutFact>
            ) : null}
          </dl>
          {profile.summary.relationships === null ? (
            <p className="text-body-sm text-text-muted">
              {copy.relationshipsHidden}
            </p>
          ) : null}
        </Section>
      ),
    },
  ];

  return (
    <article
      data-public-profile="v2"
      data-profile-tab={activeTab}
      className="grid gap-6"
    >
      <AuthIntentFocus action={resumeAction} control={resumeControl} />
      <SiteShellContextRailRegistration
        modules={buildPublicProfileContextModules(profile, locale)}
      />

      <ProfileHeader
        eyebrow={copy.profileLabel}
        avatarUrl={profile.avatarUrl}
        displayName={profile.displayName}
        handle={profile.mention}
        bio={profile.bio}
        headingLevel={headingLevel}
        meta={
          <>
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
          </>
        }
        counts={[
          {
            label: copy.publicObjects,
            value: profile.summary.publicObjectCount,
          },
          {
            label: copy.publicEntries,
            value: profile.summary.publicEntryCount,
          },
          {
            label: copy.followers,
            value: profile.summary.relationships?.followers ?? null,
          },
          {
            label: copy.following,
            value: profile.summary.relationships?.following ?? null,
          },
        ]}
        action={
          <ProfileActions
            profile={profile}
            locale={locale}
            viewer={viewer}
            returnTo={basePath}
            resumeAction={resumeAction}
          />
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
        label={copy.profileLabel}
        tabs={tabs}
        selectedId={activeTab}
      />
    </article>
  );
}

function AboutFact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-body-sm break-words text-text">{children}</dd>
    </div>
  );
}

function publicProfileRegionLabel(code: string | null) {
  const label = getCoarseRegionLabel(code);
  if (!label || !code || !COUNTRY_ONLY_PROFILE_REGION_CODES.has(code)) {
    return label;
  }

  return label.split(" - ")[0] ?? null;
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
      <HiddenField name="handle" value={profile.handle} />
      <HiddenField name="locale" value={locale} />
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
 * One living object in the gardener's grid.
 *
 * It is a `Card`, not an `EntryCard`: an object is not an authored post, it is
 * the thing the posts are about, and it carries a name, what it was identified
 * as, how many entries exist and when the last one landed. The picture sits in
 * a `MediaFigure` at the 4:3 card ratio, so the box is reserved whether or not
 * a cover exists (DESIGN.md §2.10).
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
  const identityState = {
    confirmed: copy.identityConfirmed,
    provisional: copy.identityProvisional,
    unknown: copy.identityUnknown,
  }[object.identityState];

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
      ) : (
        <div
          aria-hidden="true"
          className="-mx-4 -mt-4 flex aspect-card items-center justify-center bg-surface-sunken text-text-disabled"
        >
          <ObjectKindIcon kind={object.objectKind} />
        </div>
      )}

      <div className="grid min-w-0 gap-1">
        <Heading id={titleId} className="text-h3 break-words text-text-heading">
          <TextLink
            href={object.publicPath}
            variant="quiet"
            className="text-text-heading"
          >
            {object.displayName}
          </TextLink>
        </Heading>
        <p className="text-caption break-words text-text-muted">
          {object.identityLabel ?? identityState}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-text-muted">
        <span>{copy.entryCount(object.publicEntryCount)}</span>
        <time
          dateTime={dateTimeValue(object.latestEntryDate)}
          className="tabular-nums"
        >
          {formatDate(object.latestEntryDate, locale)}
        </time>
      </div>
    </Card>
  );
}

/**
 * One of the gardener's entries, as the system's `EntryCard`.
 *
 * The profile passes no `author` — every card on this page has the same one,
 * and repeating the gardener's name under each entry on their own profile is
 * noise a screen reader has to walk through.
 */
function ProfileJournalCard({
  journal,
  locale,
  headingLevel,
  priority,
}: {
  journal: PublicProfileJournalEvidence;
  locale: InterfaceLocale;
  headingLevel: 2 | 3;
  priority: boolean;
}) {
  const copy = getPublicProfileCopy(locale);
  const kindLabel =
    journal.context.objectKind === "animal" ? copy.animals : copy.plants;

  return (
    <EntryCard
      id={journal.entryId}
      href={journal.publicPath}
      title={journal.title}
      headingLevel={headingLevel}
      dateTime={dateTimeValue(journal.entryDate)}
      dateLabel={formatDate(journal.entryDate, locale)}
      excerpt={journal.bodyPreview}
      subject={{
        label: journal.context.label,
        href: journal.context.publicPath ?? undefined,
        kindLabel:
          journal.context.kind === "object" ? kindLabel : copy.objectsTitle,
        icon:
          journal.context.kind === "object" ? (
            <ObjectKindIcon kind={journal.context.objectKind ?? "plant"} />
          ) : (
            <BookOpen className="size-6" aria-hidden="true" />
          ),
      }}
      cover={
        journal.coverImageUrl
          ? {
              src: journal.coverImageUrl,
              srcSet: buildPublicMediaSourceSet({
                publicUrl: journal.coverImageUrl,
                intrinsicWidth: journal.coverIntrinsicWidth,
                intrinsicHeight: journal.coverIntrinsicHeight,
                variantLongEdges: journal.coverVariantLongEdges,
              }).srcSet,
              alt: journal.coverImageAlt,
              placeholderDataUri: journal.coverPlaceholderDataUri,
              focalX: journal.coverFocalX,
              focalY: journal.coverFocalY,
              intrinsicWidth: journal.coverIntrinsicWidth,
              intrinsicHeight: journal.coverIntrinsicHeight,
              sizes: "(max-width: 767px) 100vw, 704px",
            }
          : null
      }
      priority={priority}
    />
  );
}

function ObjectKindIcon({
  kind,
}: {
  kind: PublicProfileObjectEvidence["objectKind"];
}) {
  if (kind === "animal")
    return <PawPrint className="size-6" aria-hidden="true" />;
  return <Sprout className="size-6" aria-hidden="true" />;
}

export function buildPublicProfileContextModules(
  profile: PublicProfileEvidencePage,
  locale: InterfaceLocale,
): SiteShellContextRailModule[] {
  const copy = getPublicProfileCopy(locale);
  const basePath = publicProfilePath(locale, profile.handle);
  // A rail item points at a panel, and a panel that is not the open one is
  // `hidden` — so every one of these carries the `?tab=` that opens it. A bare
  // `#profile-journals` would scroll a reader to nothing.
  const objectsHref = publicProfileTabHref(
    basePath,
    "objects",
    "#profile-objects",
  );
  const journalsHref = publicProfileTabHref(
    basePath,
    "entries",
    "#profile-journals",
  );
  const aboutHref = publicProfileTabHref(basePath, "about", "#profile-about");
  const relationshipItems = profile.summary.relationships
    ? [
        {
          href: aboutHref,
          label: copy.followers,
          meta: String(profile.summary.relationships.followers),
        },
        {
          href: aboutHref,
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
      href: objectsHref,
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
          href: journalsHref,
          label: copy.publicEntries,
          meta: String(profile.summary.publicEntryCount),
        },
        {
          href: aboutHref,
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
        { href: objectsHref, label: copy.objectsTitle },
        { href: journalsHref, label: copy.journalsTitle },
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
