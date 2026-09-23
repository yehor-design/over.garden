import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import {
  ModerationOutcome,
  readModerationOutcome,
} from "@/components/moderation/moderation-frame";
import { Callout } from "@/components/ui/callout";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { HiddenField } from "@/components/ui/hidden-field";
import { Section } from "@/components/ui/section";
import { SubmitButton } from "@/components/ui/submit-button";
import { getModerationCopy } from "@/lib/moderation-copy";
import {
  communityMutationRefusal,
  listCommunityModerationQueue,
} from "@/server/community-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

import { setCommunityParticipationAction } from "../actions";
import {
  CommunityModerationFrame,
  communityModerationPath,
} from "../moderation-parts";

interface CommunityModerationSettingsProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export async function generateMetadata(): Promise<Metadata> {
  const copy = getModerationCopy(await getRequestInterfaceLocale());
  return {
    title: copy.communities.metadataTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * A community's one setting (`OVE-500`, criteria 5 and 8): whether it takes
 * new members and entries now. It was "Шлюз участі" beside the report queue,
 * one press from closing a community with nothing said about what closing
 * does. Here it has its own page, says what the community does now, and asks
 * before closing — what stays (entries, discussions) and what stops (joining,
 * adding) — because closing turns people away.
 */
export default async function CommunityModerationSettingsPage({
  params,
  searchParams,
}: CommunityModerationSettingsProps) {
  const [{ slug }, query, locale, viewer] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  if (!SLUG_PATTERN.test(slug)) notFound();
  const copy = getModerationCopy(locale);
  const path = `${communityModerationPath(slug)}/settings`;
  const outcome = readModerationOutcome(query);

  if (viewer.status === "unavailable") {
    return (
      <CommunityModerationFrame
        locale={locale}
        slug={slug}
        contentKey={null}
        current="settings"
        accessState="unavailable"
      >
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          title={copy.settings.title}
          retryHref={path}
          technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
        />
      </CommunityModerationFrame>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <CommunityModerationFrame
        locale={locale}
        slug={slug}
        contentKey={null}
        current="settings"
        accessState="sign-in-required"
      >
        <SignInPrompt locale={locale} next={path} />
      </CommunityModerationFrame>
    );
  }

  const settled = await settleSection(
    async () => {
      try {
        // The queue read is the access check and the community read in one:
        // the same rule every mutation asks.
        const queue = await listCommunityModerationQueue(viewer.scope, slug);
        return { kind: "ready" as const, community: queue.community };
      } catch (error) {
        const refusal = communityMutationRefusal(error);
        if (refusal === "moderation_denied") return { kind: "denied" as const };
        if (refusal === "community_unavailable") {
          return { kind: "missing" as const };
        }
        throw error;
      }
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(4),
      surface: "community-moderation-settings",
      section: "participation",
    },
  );

  if (settled.status === "error") {
    return (
      <CommunityModerationFrame
        locale={locale}
        slug={slug}
        contentKey={null}
        current="settings"
        accessState="unavailable"
      >
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          title={copy.settings.title}
          retryHref={path}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </CommunityModerationFrame>
    );
  }
  if (settled.value.kind === "missing") notFound();
  if (settled.value.kind === "denied") {
    return (
      <CommunityModerationFrame
        locale={locale}
        slug={slug}
        contentKey={null}
        current="settings"
        accessState="denied"
      >
        <Callout tone="warning" role="alert">
          <p>{copy.accessDenied}</p>
        </Callout>
      </CommunityModerationFrame>
    );
  }

  const { community } = settled.value;
  const archived = community.lifecycleState !== "active";
  const open = community.participationState === "open";
  const formId = `community-participation-${community.slug}`;

  return (
    <CommunityModerationFrame
      locale={locale}
      slug={slug}
      contentKey={community.contentKey}
      current="settings"
      accessState="allowed"
    >
      {outcome ? (
        <ModerationOutcome
          locale={locale}
          result={outcome.result}
          about={`${community.slug}:${community.participationState}`}
          now={open ? copy.settings.nowOpen : copy.settings.nowClosed}
        />
      ) : null}
      <Section
        id="community-participation"
        title={copy.settings.title}
        description={
          archived
            ? copy.settings.archived
            : open
              ? copy.settings.open
              : copy.settings.closed
        }
      >
        {archived ? null : (
          <OwnerScopedProgressiveForm
            id={formId}
            action={setCommunityParticipationAction}
          >
            <HiddenField name="slug" value={community.slug} />
            <HiddenField name="reason" value="rule_violation" />
            <HiddenField
              name="participationState"
              value={open ? "closed" : "open"}
            />
            {open ? (
              <ConfirmSubmit
                formId={formId}
                variant="secondary"
                data-moderation-action="close-participation"
                label={copy.settings.close}
                pendingLabel={copy.pending}
                title={copy.settings.confirmCloseTitle}
                description={copy.settings.confirmCloseBody}
                confirmLabel={copy.settings.close}
                cancelLabel={copy.cancel}
              />
            ) : (
              <SubmitButton
                data-moderation-action="open-participation"
                pendingLabel={copy.pending}
              >
                {copy.settings.reopen}
              </SubmitButton>
            )}
          </OwnerScopedProgressiveForm>
        )}
      </Section>
    </CommunityModerationFrame>
  );
}
