import Link from "next/link";
import {
  CalendarDays,
  MessageCircle,
  PawPrint,
  Search,
  Sprout,
  UsersRound,
} from "lucide-react";

import {
  blockCommunityContributionAuthorAction,
  contributeJournalToCommunityAction,
  reportCommunityContributionAction,
  setCommunityMembershipAction,
} from "@/app/[locale]/communities/[slug]/actions";
import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
import {
  SubjectAwareHtmlImage,
  SubjectAwareMediaImage,
} from "@/components/media/subject-aware-media-image";
import { SiteShellContextRailRegistration } from "@/components/site-shell/site-shell-context-rail";
import { buttonVariants } from "@/components/ui/button";
import {
  buildAuthIntentAnchor,
  type AuthIntentAction,
} from "@/lib/auth/auth-intent-contract";
import {
  getCommunityContentCopy,
  getCommunityCopy,
} from "@/lib/community-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { cn } from "@/lib/utils";
import type {
  PublicCommunityDirectoryItem,
  PublicCommunityPageModel,
} from "@/server/community-repository";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";

export type PublicCommunityState = "ready" | "loading" | "error";

export function PublicCommunityDirectory({
  locale,
  communities,
  state = "ready",
  jsonLd,
}: {
  locale: PublicLocale;
  communities: PublicCommunityDirectoryItem[];
  state?: PublicCommunityState;
  jsonLd?: Record<string, unknown> | null;
}) {
  const copy = getCommunityCopy(locale);
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);

  return (
    <main
      lang={locale}
      data-public-community-directory={state}
      className="mx-auto flex w-full max-w-5xl flex-col px-4 py-5 sm:px-6"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <header className="grid gap-2 border-b border-border pb-4">
        <h1 className="text-3xl font-semibold text-foreground">
          {copy.directoryTitle}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.directoryDescription}
        </p>
      </header>

      {state === "loading" ? (
        <p className="py-10 text-sm text-muted-foreground">{copy.loading}</p>
      ) : state === "error" ? (
        <p className="py-10 text-sm text-muted-foreground" role="alert">
          {copy.error}
        </p>
      ) : communities.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">
          {copy.directoryEmpty}
        </p>
      ) : (
        <ul className="grid gap-3 py-4 sm:grid-cols-2">
          {communities.map((community) => (
            <li key={community.id}>
              <Link
                href={localizedPath(locale, `/communities/${community.slug}`)}
                className="grid min-h-48 content-between gap-6 rounded-md border border-border p-4 transition-colors hover:border-primary/45 hover:bg-muted/30"
              >
                <span
                  className={cn(
                    "grid gap-4",
                    community.coverUrl && "sm:flex sm:items-start",
                  )}
                >
                  <span className="grid min-w-0 gap-2 sm:flex-1">
                    <span className="text-xs font-semibold text-primary uppercase">
                      {copy.eyebrow}
                    </span>
                    <span className="text-xl leading-7 font-semibold break-words text-foreground">
                      {
                        getCommunityContentCopy(locale, community.contentKey)
                          .name
                      }
                    </span>
                    <span className="text-sm leading-6 text-muted-foreground">
                      {
                        getCommunityContentCopy(locale, community.contentKey)
                          .description
                      }
                    </span>
                  </span>
                  {community.coverUrl ? (
                    <span className="relative aspect-4/3 overflow-hidden rounded-md bg-muted sm:w-32 sm:shrink-0">
                      <CommunityMedia
                        src={community.coverUrl}
                        sizes="128px"
                        focalX={community.coverFocalX}
                        focalY={community.coverFocalY}
                        intrinsicWidth={community.coverIntrinsicWidth}
                        intrinsicHeight={community.coverIntrinsicHeight}
                      />
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground tabular-nums">
                  <span>
                    {community.activeContributionCount} {copy.journals}
                  </span>
                  <span>
                    {community.activeObjectCount} {copy.objects}
                  </span>
                  <span>
                    {community.activeMemberCount} {copy.members}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function PublicCommunityView({
  locale,
  community,
  viewer,
  query = "",
  kind = "all",
  cursor = "",
  actionStatus,
  state = "ready",
  resumeAction = null,
  resumeControl = null,
  jsonLd,
}: {
  locale: PublicLocale;
  community: PublicCommunityPageModel;
  viewer: "guest" | "member";
  query?: string;
  kind?: "all" | "plant" | "animal";
  cursor?: string;
  actionStatus?: string | null;
  state?: PublicCommunityState;
  resumeAction?: AuthIntentAction | null;
  resumeControl?: string | null;
  jsonLd?: Record<string, unknown> | null;
}) {
  const copy = getCommunityCopy(locale);
  const contentCopy = getCommunityContentCopy(locale, community.contentKey);
  const communityPath = localizedPath(locale, `/communities/${community.slug}`);
  const communityReturnPath = communityViewPath(communityPath, {
    query,
    kind,
    cursor,
  });
  const knowledgePath = localizedPath(locale, `/topics/${community.topicSlug}`);
  const actionMessage = actionStatus ? copy.actionMessages[actionStatus] : null;
  const searchState = community.search ?? {
    mode: "browse" as const,
    degradedReason: null,
    shortQuery: false,
  };
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);
  const contextModules = [
    {
      key: "community-rules",
      title: copy.rules,
      items: community.rules.map((rule) => ({
        href: `${communityReturnPath}#rule-${rule.id}`,
        label: copy.ruleLabels[rule.key] ?? rule.key,
      })),
      emptyLabel: copy.rulesDescription,
    },
    {
      key: "community-knowledge",
      title: copy.relatedKnowledge,
      items: [{ href: knowledgePath, label: copy.openKnowledge }],
      emptyLabel: copy.openKnowledge,
    },
  ];

  return (
    <main
      lang={locale}
      data-public-community={community.slug}
      data-public-community-state={state}
      className="mx-auto flex w-full max-w-5xl flex-col px-4 py-4 sm:px-6 sm:py-5"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <AuthIntentFocus action={resumeAction} control={resumeControl} />
      <SiteShellContextRailRegistration modules={contextModules} />

      <header className="grid gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-xs font-semibold text-primary uppercase">
            {copy.eyebrow}
          </p>
          {state === "ready" ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <CommunityMembershipAction
                locale={locale}
                community={community}
                viewer={viewer}
                communityPath={communityReturnPath}
                resumeAction={resumeAction}
                resumeControl={resumeControl}
              />
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "grid gap-4",
            community.coverUrl && "sm:flex sm:items-start",
          )}
        >
          <div className="grid max-w-2xl min-w-0 gap-2 sm:flex-1">
            <h1 className="text-3xl leading-9 font-semibold break-words text-foreground">
              {contentCopy.name}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {contentCopy.description}
            </p>
          </div>
          {community.coverUrl ? (
            <div className="relative aspect-4/3 overflow-hidden rounded-md bg-muted sm:w-56 sm:shrink-0">
              <CommunityMedia
                src={community.coverUrl}
                priority
                sizes="(max-width: 640px) 100vw, 224px"
                focalX={community.coverFocalX}
                focalY={community.coverFocalY}
                intrinsicWidth={community.coverIntrinsicWidth}
                intrinsicHeight={community.coverIntrinsicHeight}
              />
            </div>
          ) : null}
        </div>

        {actionMessage ? (
          <p
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            role="status"
          >
            {actionMessage}
          </p>
        ) : null}
        {community.lifecycleState === "archived" ? (
          <p className="text-sm text-muted-foreground">{copy.archived}</p>
        ) : community.participationState === "closed" ? (
          <p className="text-sm text-muted-foreground">
            {copy.participationClosed}
          </p>
        ) : null}

        <dl className="grid grid-cols-3 divide-x divide-border border-y border-border py-3">
          <CommunityStat
            label={copy.journals}
            value={community.activeContributionCount}
          />
          <CommunityStat
            label={copy.objects}
            value={community.activeObjectCount}
          />
          <CommunityStat
            label={copy.members}
            value={community.activeMemberCount}
          />
        </dl>
      </header>

      {state === "ready" &&
      viewer === "member" &&
      community.viewer.membershipState === "active" &&
      community.lifecycleState === "active" &&
      community.participationState === "open" ? (
        <CommunityContributionForm locale={locale} community={community} />
      ) : null}

      <form
        method="get"
        action={communityPath}
        aria-label={copy.searchLabel}
        className="grid gap-3 border-b border-border py-4 sm:flex sm:items-end"
      >
        <label className="grid min-w-0 gap-1.5 text-sm font-medium sm:flex-1">
          <span>{copy.searchLabel}</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={100}
            placeholder={copy.searchPlaceholder}
            className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium sm:w-48 sm:shrink-0">
          <span>{copy.kindLabel}</span>
          <select
            name="kind"
            defaultValue={kind === "all" ? "" : kind}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{copy.allKinds}</option>
            {Object.entries(copy.kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonVariants()}>
          <Search aria-hidden="true" />
          {copy.search}
        </button>
      </form>

      {searchState.shortQuery ? (
        <p className="py-3 text-sm text-muted-foreground" role="status">
          {copy.shortSearch}
        </p>
      ) : searchState.degradedReason ? (
        <p
          className="my-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          role="status"
        >
          {copy.degradedSearch}
        </p>
      ) : null}

      <section aria-labelledby="community-journals" className="grid">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-3">
          <h2 id="community-journals" className="text-lg font-semibold">
            {copy.journals}
          </h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {community.activeContributionCount}
          </span>
        </div>
        {state === "loading" ? (
          <p className="py-10 text-sm text-muted-foreground">{copy.loading}</p>
        ) : state === "error" ? (
          <p className="py-10 text-sm text-muted-foreground" role="alert">
            {copy.error}
          </p>
        ) : community.contributions.items.length === 0 ? (
          <div className="grid justify-items-start gap-3 py-10">
            <p className="text-sm text-muted-foreground">
              {query || kind !== "all" ? copy.noResults : copy.noContributions}
            </p>
            {query || kind !== "all" ? (
              <Link
                href={communityPath}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {copy.resetFilters}
              </Link>
            ) : null}
          </div>
        ) : (
          <ul>
            {community.contributions.items.map((item) => (
              <CommunityContributionRow
                key={item.id}
                locale={locale}
                item={item}
                viewer={viewer}
                community={community}
                communityPath={communityReturnPath}
                resumeAction={resumeAction}
                resumeControl={resumeControl}
              />
            ))}
          </ul>
        )}
        {state === "ready" && community.contributions.nextCursor ? (
          <Link
            href={`${communityPath}?${communityQuery({
              query,
              kind,
              cursor: community.contributions.nextCursor,
            })}`}
            className={cn(buttonVariants({ variant: "outline" }), "my-4 w-fit")}
          >
            {copy.showMore}
          </Link>
        ) : null}
      </section>

      <section
        className="grid gap-3 border-t border-border py-5 xl:hidden"
        aria-labelledby="community-rules"
      >
        <h2 id="community-rules" className="text-lg font-semibold">
          {copy.rules}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.rulesDescription}
        </p>
        <ol className="grid gap-2">
          {community.rules.map((rule) => (
            <li
              id={`rule-${rule.id}`}
              key={rule.id}
              className="flex gap-3 text-sm leading-6"
            >
              <span className="font-semibold tabular-nums">{rule.order}.</span>
              <span>{copy.ruleLabels[rule.key] ?? rule.key}</span>
            </li>
          ))}
        </ol>
        <Link
          href={knowledgePath}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "w-fit",
          })}
        >
          {copy.openKnowledge}
        </Link>
      </section>
    </main>
  );
}

function CommunityMembershipAction({
  locale,
  community,
  viewer,
  communityPath,
  resumeAction,
  resumeControl,
}: {
  locale: PublicLocale;
  community: PublicCommunityPageModel;
  viewer: "guest" | "member";
  communityPath: string;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
}) {
  const copy = getCommunityCopy(locale);
  const control = "community-membership";
  const active = community.viewer.membershipState === "active";
  if (community.lifecycleState !== "active" && !active) return null;
  if (community.participationState === "closed" && !active) {
    return null;
  }

  if (viewer === "guest") {
    return (
      <AuthIntentTrigger
        action="follow"
        returnTo={communityPath}
        target={{ kind: "collection", ref: community.slug }}
        control={control}
        label={copy.follow}
        icon={<UsersRound aria-hidden="true" />}
      />
    );
  }

  if (community.viewer.membershipState === "banned") {
    return (
      <p className="max-w-xs text-sm text-muted-foreground">{copy.banned}</p>
    );
  }
  return (
    <DocumentMutationActionForm action={setCommunityMembershipAction}>
      <CommunityActionFields locale={locale} slug={community.slug} />
      <input
        type="hidden"
        name="membershipState"
        value={active ? "left" : "active"}
      />
      <button
        id={
          resumeAction === "follow" && resumeControl === control
            ? buildAuthIntentAnchor("follow", control)
            : undefined
        }
        data-auth-intent-control="follow"
        data-auth-intent-control-ref={control}
        className={buttonVariants({
          variant: active ? "outline" : "default",
        })}
      >
        <UsersRound aria-hidden="true" />
        {active ? copy.leave : copy.follow}
      </button>
    </DocumentMutationActionForm>
  );
}

function CommunityContributionForm({
  locale,
  community,
}: {
  locale: PublicLocale;
  community: PublicCommunityPageModel;
}) {
  const copy = getCommunityCopy(locale);
  return (
    <section
      className="grid gap-3 border-b border-border py-4"
      aria-labelledby="community-contribute"
    >
      <div className="grid gap-1">
        <h2 id="community-contribute" className="text-base font-semibold">
          {copy.contributeTitle}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.contributeDescription}
        </p>
      </div>
      {community.viewer.eligibleJournals.length > 0 ? (
        <DocumentMutationActionForm
          action={contributeJournalToCommunityAction}
          className="grid gap-3 sm:flex sm:items-end"
        >
          <CommunityActionFields locale={locale} slug={community.slug} />
          <label className="grid min-w-0 gap-1.5 text-sm font-medium sm:flex-1">
            <span>{copy.chooseJournal}</span>
            <select
              name="journalEntryId"
              required
              className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            >
              {community.viewer.eligibleJournals.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} · {entry.objectDisplayName}
                </option>
              ))}
            </select>
          </label>
          <button className={buttonVariants()}>{copy.contribute}</button>
        </DocumentMutationActionForm>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {copy.noEligibleJournals}
          </p>
          <Link
            href="/garden#first-entry-composer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {copy.createJournal}
          </Link>
        </div>
      )}
    </section>
  );
}

function CommunityContributionRow({
  locale,
  item,
  viewer,
  community,
  communityPath,
  resumeAction,
  resumeControl,
}: {
  locale: PublicLocale;
  item: PublicCommunityPageModel["contributions"]["items"][number];
  viewer: "guest" | "member";
  community: PublicCommunityPageModel;
  communityPath: string;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
}) {
  const copy = getCommunityCopy(locale);
  const KindIcon =
    item.object.kind === "plant"
      ? Sprout
      : item.object.kind === "animal"
        ? PawPrint
        : PawPrint;

  return (
    <li className="grid gap-4 border-b border-border py-5 sm:flex">
      <article className="grid min-w-0 gap-3 sm:flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Link
            href={item.object.href}
            className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary"
          >
            <KindIcon className="size-4" aria-hidden="true" />
            {item.object.displayName}
          </Link>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden="true" />
            {formatCommunityDate(item.entryDate, locale)}
          </span>
          {item.author ? (
            <Link href={item.author.href} className="hover:text-foreground">
              {item.author.label}
            </Link>
          ) : null}
        </div>
        <div className="grid gap-2">
          <h3 className="text-xl leading-7 font-semibold">
            <Link href={item.href} className="hover:text-primary">
              {item.title}
            </Link>
          </h3>
          <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">
            {item.excerpt}
          </p>
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <Link
            href={item.href}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {copy.readJournal}
          </Link>
          {item.discussionState === "open" ? (
            <Link
              href={localizedPath(
                locale,
                `/communities/${community.slug}/discussions/${item.id}`,
              )}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <MessageCircle aria-hidden="true" />
              {copy.comments}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">
              {copy.discussionClosed}
            </span>
          )}
          <CommunitySafetyActions
            locale={locale}
            item={item}
            viewer={viewer}
            community={community}
            communityPath={communityPath}
            resumeAction={resumeAction}
            resumeControl={resumeControl}
          />
        </div>
      </article>
      {item.coverUrl ? (
        <Link
          href={item.href}
          aria-label={`${copy.readJournal}: ${item.title}`}
          className="relative order-first aspect-4/3 overflow-hidden rounded-md bg-muted sm:order-none sm:w-48 sm:shrink-0"
        >
          <CommunityMedia
            src={item.coverUrl}
            sizes="(max-width: 640px) 100vw, 192px"
            focalX={item.coverFocalX}
            focalY={item.coverFocalY}
            intrinsicWidth={item.coverIntrinsicWidth}
            intrinsicHeight={item.coverIntrinsicHeight}
          />
        </Link>
      ) : null}
    </li>
  );
}

function CommunitySafetyActions({
  locale,
  item,
  viewer,
  community,
  communityPath,
  resumeAction,
  resumeControl,
}: {
  locale: PublicLocale;
  item: PublicCommunityPageModel["contributions"]["items"][number];
  viewer: "guest" | "member";
  community: PublicCommunityPageModel;
  communityPath: string;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
}) {
  const copy = getCommunityCopy(locale);
  if (!item.author) return null;
  const target = { kind: "collection" as const, ref: community.slug };
  const reportControl = `contribution-${item.id}`;
  const blockControl = `contribution-${item.id}`;

  if (viewer === "guest") {
    return (
      <>
        <AuthIntentTrigger
          action="report"
          returnTo={communityPath}
          target={target}
          control={reportControl}
          label={copy.report}
          variant="ghost"
          size="sm"
        />
        <AuthIntentTrigger
          action="block"
          returnTo={communityPath}
          target={target}
          control={blockControl}
          label={copy.block}
          variant="ghost"
          size="sm"
        />
      </>
    );
  }

  return (
    <>
      {item.viewerReportState ? (
        <span className="text-xs text-muted-foreground">
          {copy.reportPending}
        </span>
      ) : (
        <details
          id={
            resumeAction === "report" && resumeControl === reportControl
              ? buildAuthIntentAnchor("report", reportControl)
              : undefined
          }
          open={resumeAction === "report" && resumeControl === reportControl}
          className="sm:relative"
        >
          <summary
            data-auth-intent-control="report"
            data-auth-intent-control-ref={reportControl}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "cursor-pointer list-none",
            )}
          >
            {copy.report}
          </summary>
          <DocumentMutationActionForm
            action={reportCommunityContributionAction}
            className="absolute left-0 z-20 mt-1 grid w-72 gap-3 rounded-md border border-border bg-popover p-3 shadow-md"
          >
            <CommunityActionFields locale={locale} slug={community.slug} />
            <input type="hidden" name="contributionId" value={item.id} />
            <label className="grid gap-1.5 text-sm font-medium">
              <span>{copy.reportReason}</span>
              <select
                name="reason"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {Object.entries(copy.reportReasons).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className={buttonVariants({ size: "sm" })}>
              {copy.sendReport}
            </button>
          </DocumentMutationActionForm>
        </details>
      )}
      <DocumentMutationActionForm
        action={blockCommunityContributionAuthorAction}
      >
        <CommunityActionFields locale={locale} slug={community.slug} />
        <input type="hidden" name="contributionId" value={item.id} />
        <button
          id={
            resumeAction === "block" && resumeControl === blockControl
              ? buildAuthIntentAnchor("block", blockControl)
              : undefined
          }
          data-auth-intent-control="block"
          data-auth-intent-control-ref={blockControl}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          {copy.block}
        </button>
      </DocumentMutationActionForm>
    </>
  );
}

function CommunityActionFields({
  locale,
  slug,
}: {
  locale: PublicLocale;
  slug: string;
}) {
  return (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="slug" value={slug} />
    </>
  );
}

function CommunityStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid justify-items-center gap-0.5 px-2">
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      <dt className="text-center text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

function formatCommunityDate(value: Date | string, locale: PublicLocale) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function communityQuery(input: {
  query: string;
  kind: string;
  cursor: string;
}) {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.kind !== "all") params.set("kind", input.kind);
  params.set("cursor", input.cursor);
  return params.toString();
}

function communityViewPath(
  path: string,
  input: {
    query: string;
    kind: string;
    cursor: string;
  },
) {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.kind !== "all") params.set("kind", input.kind);
  if (input.cursor) params.set("cursor", input.cursor);
  return params.size > 0 ? `${path}?${params.toString()}` : path;
}

function CommunityMedia({
  src,
  sizes,
  priority = false,
  focalX = null,
  focalY = null,
  intrinsicWidth = null,
  intrinsicHeight = null,
}: {
  src: string;
  sizes: string;
  priority?: boolean;
  focalX?: number | null;
  focalY?: number | null;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
}) {
  if (isLoopbackMediaUrl(src)) {
    return (
      <SubjectAwareHtmlImage
        src={src}
        alt=""
        presentationMode="cover"
        focalX={focalX}
        focalY={focalY}
        intrinsicWidth={intrinsicWidth}
        intrinsicHeight={intrinsicHeight}
        className="absolute inset-0 h-full w-full"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
      />
    );
  }

  return (
    <SubjectAwareMediaImage
      src={src}
      alt=""
      fill
      priority={priority}
      sizes={sizes}
      presentationMode="cover"
      focalX={focalX}
      focalY={focalY}
      intrinsicWidth={intrinsicWidth}
      intrinsicHeight={intrinsicHeight}
    />
  );
}

function isLoopbackMediaUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}
