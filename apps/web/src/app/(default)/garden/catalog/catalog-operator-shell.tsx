import Link from "next/link";
import type { ReactNode } from "react";

import {
  WorkspaceSectionError,
  WorkspaceShell,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  CATALOG_SOURCES_PATH,
  CURATION_QUEUE_PATH,
} from "@/lib/catalog/curation-queue";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOperatorDate,
  formatOperatorTemplate,
  getOperatorCopy,
} from "@/lib/operator-copy";
import { getOperatorCatalogCopy } from "@/lib/operator-catalog-copy";
import { getOperatorMenuCopy } from "@/lib/operator-menu-copy";
import type { WorkspaceFailureDescription } from "@/server/workspace-failure";

export type CatalogOperatorAccessState =
  | "sign-in-required"
  | "denied"
  | "unavailable"
  | "allowed"
  /**
   * The loading frame's: the owner check has not answered yet, so it claims
   * no access and offers no way to the other owner page. It used to say
   * `allowed`, which a proof waiting for the real answer could read first.
   */
  | "checking";

/**
 * The shell both curation surfaces render before anything is read
 * (ADR-0023): the page is on screen, then a section settles inside it.
 *
 * The way to the other queue is offered only to someone who may open it: a
 * member who reached one of these addresses is told whose page it is and
 * shown the way back, not handed a second locked door (`OVE-506`).
 */
export function CatalogOperatorShell({
  locale,
  surface,
  accessState,
  title,
  description,
  state,
  children,
}: {
  locale: InterfaceLocale;
  surface: "catalog-queue" | "catalog-sources";
  /** The published state attribute this surface's proofs read by name. */
  accessState: CatalogOperatorAccessState;
  title: string;
  description: string;
  state?: "loading";
  children: ReactNode;
}) {
  const operatorCopy = getOperatorCopy(locale);
  const menuCopy = getOperatorMenuCopy(locale);
  const other =
    surface === "catalog-queue"
      ? {
          href: CATALOG_SOURCES_PATH,
          label: menuCopy.links["catalog-sources"],
        }
      : { href: CURATION_QUEUE_PATH, label: menuCopy.links["catalog-queue"] };

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
        title={title}
        description={description}
        navigation={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/garden"
              className={buttonVariants({ variant: "secondary" })}
            >
              {operatorCopy.common.backToJournal}
            </Link>
            {accessState === "allowed" ? (
              <Link
                href={other.href}
                data-operator-cross-link={surface}
                className={buttonVariants({ variant: "secondary" })}
              >
                {other.label}
              </Link>
            ) : null}
          </div>
        }
      >
        {children}
      </WorkspaceShell>
    </div>
  );
}

/**
 * A member — signed in, not the owner. The server's role check decided it;
 * nothing of the queue was read, so there is nothing of it to leak.
 */
export function CatalogOperatorDenied({ locale }: { locale: InterfaceLocale }) {
  const copy = getOperatorCatalogCopy(locale).access;
  return (
    <Callout
      tone="warning"
      title={copy.deniedTitle}
      data-catalog-operator-denied="true"
    >
      <p>{copy.deniedBody}</p>
    </Callout>
  );
}

/**
 * The role table could not be read. That is an outage the owner can retry,
 * and it used to say «Доступ заборонено» — a refusal nobody had made.
 */
export function CatalogOperatorUnavailable({
  locale,
  failure,
  retryHref,
}: {
  locale: InterfaceLocale;
  failure: WorkspaceFailureDescription;
  retryHref: string;
}) {
  return (
    <WorkspaceSectionError
      locale={locale}
      failure={failure}
      title={getOperatorCatalogCopy(locale).access.unavailableTitle}
      retryHref={retryHref}
      technicalHint={workspaceSchemaMissingHint(locale, failure)}
    />
  );
}

/** The time zone the owner reads these pages in. */
export const CATALOG_OPERATOR_TIME_ZONE = "Europe/Kyiv";

/** A date and time on these pages, in the owner's zone. */
export function formatCatalogOperatorDate(
  locale: InterfaceLocale,
  value: Date | string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
) {
  return formatOperatorDate(locale, value, {
    ...options,
    timeZone: CATALOG_OPERATOR_TIME_ZONE,
  });
}

/**
 * When a section read what it shows (`OVE-506` AC3). A page left open all
 * afternoon is not "now", and a retried section is fresher than the one
 * beside it; the stamp says which.
 */
export function CatalogReadAt({
  locale,
  readAt,
}: {
  locale: InterfaceLocale;
  readAt: Date;
}) {
  const copy = getOperatorCatalogCopy(locale);
  return (
    <p
      className="text-caption text-text-muted"
      data-catalog-read-at={readAt.toISOString()}
    >
      {formatOperatorTemplate(copy.readAt, {
        time: formatCatalogOperatorDate(locale, readAt, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      })}
    </p>
  );
}
