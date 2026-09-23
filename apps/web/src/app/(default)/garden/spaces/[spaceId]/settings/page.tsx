import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  WorkspaceMissingRecord,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import { Section } from "@/components/ui/section";
import {
  gardenSpaceSettingsPath,
  isSpaceId,
  spaceIsDeletable,
} from "@/lib/garden/space-page";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatSpacePageTemplate as template,
  getSpacePageCopy,
} from "@/lib/space-page-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import type { scopedToUser } from "@/server/request-scope";
import {
  readSpaceDeletionBlockers,
  readSpacePageSummary,
} from "@/server/space-page-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

import { SpaceSettingsShell } from "../space-shell";
import { deleteSpaceAction, updateSpaceSettingsAction } from "./actions";
import { SpaceDeleteControl } from "./space-delete-control";
import { SpaceSettingsForm } from "./space-settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getSpacePageCopy(locale).shell.settingsTitle} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

/**
 * A space's settings (`OVE-490`, IA: the `/settings` child): its name and
 * whether its region shows, then deletion — apart from everything else, and
 * offered only for an empty space. The consequences are the backend's: the
 * foreign keys from objects and entries cascade, so the page never offers a
 * delete that would take them along (criterion 4).
 */
export default async function GardenSpaceSettingsPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const [{ spaceId }, viewer, locale] = await Promise.all([
    params,
    resolveWorkspaceViewer(),
    getRequestInterfaceLocale(),
  ]);
  const known = isSpaceId(spaceId) ? spaceId : null;

  if (viewer.status === "unavailable") {
    return (
      <SpaceSettingsShell locale={locale} spaceId={known}>
        <div>
          <WorkspaceSectionError
            locale={locale}
            failure={viewer.failure}
            retryHref={gardenSpaceSettingsPath(spaceId)}
          />
        </div>
      </SpaceSettingsShell>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <SpaceSettingsShell locale={locale} spaceId={known}>
        <div>
          <SignInPrompt
            locale={locale}
            next={gardenSpaceSettingsPath(spaceId)}
          />
        </div>
      </SpaceSettingsShell>
    );
  }

  return (
    <SpaceSettingsShell locale={locale} spaceId={known}>
      <Suspense
        fallback={
          <div>
            <WorkspaceSectionSkeleton
              locale={locale}
              title={getSpacePageCopy(locale).settings.detailsTitle}
              rows={2}
              media={false}
            />
          </div>
        }
      >
        <SpaceSettingsSections
          locale={locale}
          scope={viewer.scope}
          spaceId={known}
        />
      </Suspense>
    </SpaceSettingsShell>
  );
}

async function SpaceSettingsSections({
  locale,
  scope,
  spaceId,
}: {
  locale: InterfaceLocale;
  scope: ReturnType<typeof scopedToUser>;
  spaceId: string | null;
}) {
  if (!spaceId) {
    return (
      <WorkspaceMissingRecord
        locale={locale}
        backHref="/garden#garden-spaces"
      />
    );
  }
  const copy = getSpacePageCopy(locale).settings;
  const deadlineMs = workspaceSectionDeadlineMs(3);
  const [summary, blockers] = await Promise.all([
    settleSection(() => readSpacePageSummary(scope, spaceId), {
      deadlineMs,
      surface: "space-settings",
      section: "summary",
    }),
    settleSection(() => readSpaceDeletionBlockers(scope, spaceId), {
      deadlineMs,
      surface: "space-settings",
      section: "deletion",
    }),
  ]);
  if (summary.status === "error") {
    return (
      <div>
        <WorkspaceSectionError
          locale={locale}
          failure={summary}
          retryHref={gardenSpaceSettingsPath(spaceId)}
        />
      </div>
    );
  }
  if (!summary.value) {
    return (
      <WorkspaceMissingRecord
        locale={locale}
        backHref="/garden#garden-spaces"
      />
    );
  }
  const space = summary.value;

  return (
    <div className="flex flex-col gap-10">
      <p className="text-body-sm text-text-muted">{copy.description}</p>
      <Section
        id="space-details"
        title={copy.detailsTitle}
        className="scroll-mt-20"
      >
        <SpaceSettingsForm
          locale={locale}
          space={space}
          action={updateSpaceSettingsAction}
        />
      </Section>
      <Section
        id="space-delete"
        title={copy.deleteTitle}
        className="scroll-mt-20 border-t border-border pt-8"
        data-space-delete-section={
          blockers.status === "ready"
            ? spaceIsDeletable(blockers.value)
              ? "empty"
              : "blocked"
            : "unknown"
        }
      >
        {blockers.status === "error" ? (
          <WorkspaceSectionError
            locale={locale}
            failure={blockers}
            retryHref={`${gardenSpaceSettingsPath(spaceId)}#space-delete`}
          />
        ) : spaceIsDeletable(blockers.value) ? (
          <>
            <p className="text-body-sm text-text-muted">{copy.deleteEmpty}</p>
            <SpaceDeleteControl
              locale={locale}
              spaceId={space.id}
              spaceName={space.displayName}
              action={deleteSpaceAction}
            />
          </>
        ) : (
          <p
            className="text-body-sm text-text-muted"
            data-space-delete-blocked="true"
          >
            {template(copy.deleteBlocked, {
              objects: blockers.value.objectCount,
              entries: blockers.value.entryCount,
            })}
          </p>
        )}
      </Section>
    </div>
  );
}
