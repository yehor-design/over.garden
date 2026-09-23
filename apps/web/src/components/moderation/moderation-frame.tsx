import Link from "next/link";
import type { ReactNode } from "react";

import {
  WorkspaceShell,
  type WorkspaceSurface,
} from "@/components/garden/workspace-state";
import { ActionOutcomeNotice } from "@/components/ui/action-outcome-notice";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getModerationCopy } from "@/lib/moderation-copy";
import { cn } from "@/lib/utils";

/**
 * The owner's moderation, as pages of the workspace (`OVE-500`, criteria 5
 * and 8): the shell every account page uses, a row of links between the two
 * queues, and — inside a community — a row between its reports and its
 * settings. No admin panel: each page is one task with its own address, so a
 * filter, a report and a setting can each be linked to and come back to.
 */
export function ModerationFrame({
  locale,
  surface,
  accessState,
  eyebrow,
  title,
  description,
  navigation,
  tabs,
  state,
  children,
}: {
  locale: InterfaceLocale;
  surface: WorkspaceSurface;
  /** The skeleton copy of the frame, from a route's `loading.tsx`. */
  state?: "loading";
  /** The state the proofs read by name. */
  accessState: "sign-in-required" | "denied" | "unavailable" | "allowed";
  eyebrow?: string;
  title: string;
  description?: string;
  navigation?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  const copy = getModerationCopy(locale);
  return (
    <div
      data-operator-surface={surface}
      data-operator-access-state={accessState}
    >
      <WorkspaceShell
        surface={surface}
        locale={locale}
        state={state}
        width="wide"
        eyebrow={eyebrow}
        title={title}
        description={description}
        navigation={
          navigation ?? (
            <Link
              href="/garden"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              {copy.backToGarden}
            </Link>
          )
        }
      >
        {tabs}
        {children}
      </WorkspaceShell>
    </div>
  );
}

export interface ModerationTab {
  key: string;
  href: string;
  label: string;
}

/** A row of links between pages; the current one says so. */
export function ModerationTabs({
  label,
  tabs,
  current,
}: {
  label: string;
  tabs: readonly ModerationTab[];
  current: string;
}) {
  return (
    <nav aria-label={label} data-moderation-tabs="true">
      <ul className="flex list-none flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href}
              aria-current={tab.key === current ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-11 items-center border-b-2 px-3 text-body-sm font-medium",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
                tab.key === current
                  ? "border-action text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The moderation areas: community reports and comment reports. */
export function ModerationAreas({
  locale,
  current,
}: {
  locale: InterfaceLocale;
  current: "communities" | "comments";
}) {
  const copy = getModerationCopy(locale);
  return (
    <ModerationTabs
      label={copy.sections.label}
      current={current}
      tabs={[
        {
          key: "communities",
          href: "/account/communities",
          label: copy.sections.communities,
        },
        {
          key: "comments",
          href: "/account/moderation/comments",
          label: copy.sections.comments,
        },
      ]}
    />
  );
}

export type ModerationView = "open" | "resolved";

export function readModerationView(
  value: string | string[] | undefined,
): ModerationView {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "resolved" ? "resolved" : "open";
}

/**
 * The queue's filter (`OVE-500`, criterion 8): open reports — the work — or
 * resolved ones, each with how many it holds. Links, so a view is an address
 * the owner can reload, share with a co-moderator or come back to after an
 * action.
 */
export function ModerationViews({
  locale,
  current,
  counts,
  hrefFor,
}: {
  locale: InterfaceLocale;
  current: ModerationView;
  counts: Record<ModerationView, number>;
  hrefFor: (view: ModerationView) => string;
}) {
  const copy = getModerationCopy(locale);
  return (
    <nav aria-label={copy.views.label} data-moderation-views="true">
      <ul className="flex list-none flex-wrap gap-2">
        {(["open", "resolved"] as const).map((view) => (
          <li key={view}>
            <Link
              href={hrefFor(view)}
              aria-current={view === current ? "page" : undefined}
              data-moderation-view={view}
              className={cn(
                buttonVariants({
                  variant: view === current ? "primary" : "secondary",
                  size: "sm",
                }),
                "gap-2",
              )}
            >
              {copy.views[view]}
              <span className="tabular-nums">{counts[view]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export type ModerationResult = "done" | "stale" | "failed" | "denied";

/** `?report=…&result=…` as an action left it, or null. */
export function readModerationOutcome(
  params: Record<string, string | string[] | undefined>,
): { reportId: string | null; result: ModerationResult } | null {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const result = first(params.result);
  if (
    result !== "done" &&
    result !== "stale" &&
    result !== "failed" &&
    result !== "denied"
  ) {
    return null;
  }
  const reportId = first(params.report)?.trim() ?? "";
  return {
    reportId: /^[0-9a-f-]{36}$/iu.test(reportId) ? reportId : null,
    result,
  };
}

/**
 * What the owner's last action did, read back from the record (`OVE-500`,
 * criterion 9): saved with the state it is in now, not changed because
 * somebody got there first, refused, or failed with nothing changed and a
 * safe retry. The words are the page's reading of the record, never the
 * button's intention; the notice takes focus, because the control that was
 * pressed may be gone with the row it acted on.
 */
export function ModerationOutcome({
  locale,
  result,
  about,
  now,
  deniedBody,
}: {
  locale: InterfaceLocale;
  result: ModerationResult;
  /** The record and its state now; a new value is a new outcome. */
  about: string;
  /** The record as it stands, in words, when it could be read back. */
  now?: string | null;
  /** Who may do this here, when it is not a community's moderators. */
  deniedBody?: string;
}) {
  const copy = getModerationCopy(locale).outcome;
  const title =
    result === "done"
      ? copy.savedTitle
      : result === "stale"
        ? copy.staleTitle
        : result === "denied"
          ? copy.deniedTitle
          : copy.failedTitle;
  const body =
    result === "stale"
      ? copy.staleBody
      : result === "denied"
        ? (deniedBody ?? copy.deniedBody)
        : result === "failed"
          ? copy.failedBody
          : null;
  return (
    <ActionOutcomeNotice
      outcome={result}
      about={about}
      tone={result === "done" ? "success" : "warning"}
      title={title}
    >
      {body ? <p>{body}</p> : null}
      {now ? (
        <p data-moderation-now="true">
          {copy.now}: {now}.
        </p>
      ) : null}
    </ActionOutcomeNotice>
  );
}
