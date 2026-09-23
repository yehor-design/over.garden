import type { ReactNode } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { cn } from "@/lib/utils";
import type { WorkspaceFailureDescription } from "@/server/workspace-failure";
import {
  WorkspaceLoadingWatchdog,
  WorkspaceSectionRetry,
} from "./workspace-state-controls";

/**
 * The shared vocabulary of a workspace screen (ADR-0023).
 *
 * A page and its `loading.tsx` render the same `WorkspaceShell`, so the
 * fallback and the finished page agree on heading, navigation, and width and
 * nothing moves when the data arrives. Everything below the shell is a section:
 * either a skeleton, a value, or a designed failure — never a thrown error,
 * because a Server Component that throws during a postponed resume leaves its
 * boundary pending forever on a hard load.
 */

/** Which screen this is. It is the join between a page and its skeleton, and
 * the handle a proof or an operator uses to address one surface. */
export type WorkspaceSurface =
  | "garden-home"
  | "object"
  | "entry-edit"
  | "profile"
  | "account-settings"
  | "account-security"
  | "lineage-claims"
  | "lineage-questions"
  | "lineage-invitation-claim"
  | "erasure-requests"
  | "catalog-queue"
  | "catalog-sources"
  | "space-setup"
  | "object-setup"
  | "entry-composer"
  | "space"
  | "space-settings"
  | "object-settings"
  | "object-provenance"
  | "communities-moderation"
  | "community-moderation"
  | "community-moderation-settings"
  | "comment-moderation";

const SHELL_WIDTH = {
  narrow: "max-w-3xl",
  regular: "max-w-4xl",
  wide: "max-w-5xl",
} as const;

export function WorkspaceShell({
  surface,
  locale,
  state,
  eyebrow,
  title,
  description,
  navigation,
  width = "regular",
  bleed = false,
  children,
}: {
  surface: WorkspaceSurface;
  locale: InterfaceLocale;
  /** `loading` marks the skeleton copy of a shell. A page never sets it, so a
   * marker left in finished HTML is a defect the proof can see. */
  state?: "loading";
  eyebrow?: string;
  title: string;
  description?: string;
  navigation?: ReactNode;
  width?: keyof typeof SHELL_WIDTH;
  /** The workspace home runs a full-bleed summary strip inside its own width,
   * so it takes the gutters onto its own blocks instead of onto the shell. */
  bleed?: boolean;
  children?: ReactNode;
}) {
  return (
    <main
      lang={locale}
      data-workspace-surface={surface}
      data-workspace-state={state}
      aria-busy={state === "loading" ? "true" : undefined}
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col",
        bleed ? "" : "gap-6 px-4 py-6 sm:px-6 sm:py-8",
        SHELL_WIDTH[width],
      )}
    >
      <header
        className={cn(
          "flex flex-col gap-3 border-b border-border pb-5",
          bleed && "px-4 pt-6 sm:px-6 sm:pt-8",
        )}
      >
        {navigation ? (
          <div className="flex flex-wrap items-center gap-3">{navigation}</div>
        ) : null}
        {eyebrow ? (
          <p className="text-overline text-text-muted uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="text-h1 text-text-heading">{title}</h1>
        {description ? (
          <p className="max-w-prose text-body-sm text-text-muted">
            {description}
          </p>
        ) : null}
      </header>
      {children}
    </main>
  );
}

/**
 * The fallback for one streamed section. It mirrors the block it precedes —
 * same heading, same row rhythm — so arrival is a substitution rather than a
 * jump, and it carries the watchdog so a wait that never ends still reaches a
 * control.
 */
export function WorkspaceSectionSkeleton({
  locale,
  title,
  rows = 3,
  media = true,
}: {
  locale: InterfaceLocale;
  title?: string;
  rows?: number;
  media?: boolean;
}) {
  const copy = getGardenWorkspaceCopy(locale).workspace;

  return (
    <section
      data-workspace-section="loading"
      data-screen-state="loading"
      aria-busy="true"
      aria-label={title ?? copy.loading.label}
    >
      {title ? (
        <h2 className="text-h2 text-text-heading">{title}</h2>
      ) : (
        <Skeleton className="h-6 w-40" />
      )}
      <div className="mt-4 divide-y divide-border border-y border-border">
        {Array.from({ length: Math.max(1, rows) }, (_, index) => (
          <div key={index} className="flex items-center gap-4 py-4">
            {media ? <Skeleton className="size-16 shrink-0" /> : null}
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <WorkspaceLoadingWatchdog
        stillLoadingLabel={copy.loading.stillLoading}
        reloadLabel={copy.loading.reload}
      />
    </section>
  );
}

/**
 * A failure the server rendered on purpose. The bounded class travels as a data
 * attribute and never as copy, so no locale gains a machine code; the digest is
 * printed because it is the one string that lets the person on the screen and
 * the person in the logs talk about the same event.
 *
 * `technicalHint` is admitted only by owner-only surfaces. The owner is the
 * person who can apply the migration, so naming the relation there is help; on
 * a gardener's screen it would be noise about a system they cannot touch.
 */
export function WorkspaceSectionError({
  locale,
  id,
  title,
  failure,
  retryHref,
  retryLabel,
  technicalHint,
}: {
  locale: InterfaceLocale;
  id?: string;
  title?: string;
  failure: WorkspaceFailureDescription;
  /** Where the plain-link fallback points before hydration. */
  retryHref: string;
  /** Overrides the per-section wording when the whole surface has failed. */
  retryLabel?: string;
  technicalHint?: string | null;
}) {
  const copy = getGardenWorkspaceCopy(locale).workspace.sectionError;

  return (
    <ErrorState
      id={id}
      failureClass={failure.failureClass}
      digest={failure.digest}
      title={title ?? copy.title}
      // One sentence per class (`OVE-457`). Every failure used to read "other
      // sections remain available", which is true of all six and useful about
      // none: a reader whose section timed out and a reader whose account has
      // no access got the same advice, and only one of them could act on it.
      description={copy.reasons[failure.failureClass] ?? copy.description}
      technicalHint={technicalHint}
      reference={formatGardenWorkspaceTemplate(copy.reference, {
        digest: failure.digest,
      })}
      retry={
        <WorkspaceSectionRetry
          href={retryHref}
          label={retryLabel ?? copy.retry}
        />
      }
    />
  );
}

/**
 * A record that is not in this gardener's garden — deleted, never theirs, or a
 * stale bookmark. It is a rendered state rather than `notFound()` on purpose:
 * under Cache Components a `notFound()` raised while a postponed response is
 * resumed reaches the reader as the same stuck skeleton as any other throw
 * (ADR-0023), and a signed-in gardener is better served by a sentence and a way
 * back than by a bare 404. The wording is identical whether the record does not
 * exist or belongs to someone else, so it tells an enumerator nothing.
 */
export function WorkspaceMissingRecord({
  locale,
  backHref = "/garden",
}: {
  locale: InterfaceLocale;
  backHref?: string;
}) {
  const copy = getGardenWorkspaceCopy(locale).workspace.missing;

  return (
    <section
      data-workspace-record="missing"
      className="border-y border-border py-6"
    >
      <h2 className="text-h3 text-text-heading">{copy.title}</h2>
      <p className="mt-1 max-w-prose text-body-sm text-text-muted">
        {copy.description}
      </p>
      <a
        href={backHref}
        className="text-link mt-4 inline-flex min-h-10 items-center text-body-sm font-medium underline-offset-4 hover:underline"
      >
        {copy.back}
      </a>
    </section>
  );
}

/**
 * The hint an owner-only surface may show for a missing relation. It returns
 * `null` for every other class, so a caller cannot accidentally widen it.
 */
export function workspaceSchemaMissingHint(
  locale: InterfaceLocale,
  failure: WorkspaceFailureDescription,
): string | null {
  if (failure.failureClass !== "schema_missing") return null;
  const copy = getGardenWorkspaceCopy(locale).workspace.sectionError;
  return failure.relation
    ? formatGardenWorkspaceTemplate(copy.schemaMissing, {
        relation: failure.relation,
      })
    : copy.schemaMissingUnnamed;
}

/** The decisions a workspace surface may reach before it renders its shell. */
export type WorkspaceAccessState =
  | "sign-in-required"
  | "denied"
  | "disabled"
  | "unavailable";

/**
 * The one access panel for every owner-only surface. It replaced three
 * byte-identical copies whose only difference was the attribute they stamped;
 * that attribute stays a parameter because deployed proofs and the suite read
 * it by name.
 */
export function WorkspaceAccessPanel({
  locale,
  surface,
  stateAttribute,
  state,
  title,
  message,
  navigation,
  width = "wide",
  failure,
  retryHref,
}: {
  locale: InterfaceLocale;
  surface: WorkspaceSurface;
  /** The surface's published state attribute, e.g. `data-edition-state`. */
  stateAttribute: string;
  state: WorkspaceAccessState;
  title: string;
  message: string;
  navigation?: ReactNode;
  width?: keyof typeof SHELL_WIDTH;
  /** Present only for `unavailable`, so the panel can carry the class and the
   * digest an operator needs. */
  failure?: WorkspaceFailureDescription;
  /** Where the pre-hydration retry link points; the surface's own path. */
  retryHref?: string;
}) {
  const stateProps = { [stateAttribute]: state } as Record<string, string>;

  return (
    <main
      lang={locale}
      data-workspace-surface={surface}
      {...stateProps}
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8",
        SHELL_WIDTH[width],
      )}
    >
      <header className="flex flex-col gap-3 border-b border-border pb-5">
        {navigation ? (
          <div className="flex flex-wrap items-center gap-3">{navigation}</div>
        ) : null}
        <h1 className="text-h1 text-text-heading">{title}</h1>
      </header>
      {failure ? (
        <WorkspaceSectionError
          locale={locale}
          failure={failure}
          title={message}
          retryHref={retryHref ?? "/garden"}
          technicalHint={workspaceSchemaMissingHint(locale, failure)}
        />
      ) : (
        <p className="rounded-lg border border-border p-4 text-body-sm text-text-muted">
          {message}
        </p>
      )}
    </main>
  );
}
