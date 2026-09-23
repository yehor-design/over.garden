import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { MySocialLayout } from "@/components/social/my-social-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Fieldset } from "@/components/ui/fieldset";
import { HiddenField } from "@/components/ui/hidden-field";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
} from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import {
  getNotificationPreferences,
  type NotificationPreferences,
} from "@/server/social-return-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

interface NotificationSettingsRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const SETTINGS_PATH = "/notifications/settings";

export async function generateMetadata({
  params,
}: NotificationSettingsRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";
  const copy = getSocialSurfaceCopy(locale);
  return {
    title: `${copy.notifications.settingsPage.title} | OverGarden`,
    alternates: isPublicLocale(localeParam)
      ? {
          canonical: localizedPath(locale, SETTINGS_PATH),
          languages: buildLanguageAlternates(SETTINGS_PATH),
        }
      : undefined,
    robots: { index: false, follow: false },
  };
}

/**
 * What Activity shows (`OVE-501`, criterion 5): the preferences, on their own
 * page under `/notifications` so the Activity destination stays selected.
 *
 * They were a `<details>` at the top of the list, between the filters and the
 * first row, and saving them reloaded the list. The two groups say what each
 * kind is — what other gardeners did, and the optional reminders with the rule
 * that makes one — and saving comes back here with what happened.
 */
export default async function NotificationSettingsRoute({
  params,
  searchParams,
}: NotificationSettingsRouteProps) {
  const [{ locale: localeParam }, query] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  if (!isPublicLocale(localeParam)) notFound();
  const locale = localeParam;
  const copy = getSocialSurfaceCopy(locale);
  const settingsCopy = copy.notifications.settingsPage;
  const settingsHref = localizedPath(locale, SETTINGS_PATH);
  const layout = {
    locale,
    active: "notifications" as const,
    title: settingsCopy.title,
    description: settingsCopy.description,
    actions: (
      <Link
        href={localizedPath(locale, "/notifications")}
        data-notification-settings-back="true"
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        <ArrowLeft aria-hidden="true" />
        {settingsCopy.back}
      </Link>
    ),
  };

  const viewer = await resolveWorkspaceViewer();
  if (viewer.status === "unavailable") {
    return (
      <MySocialLayout {...layout}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          title={settingsCopy.loadErrorTitle}
          retryHref={settingsHref}
          technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
        />
      </MySocialLayout>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <MySocialLayout {...layout}>
        <SignInPrompt
          locale={locale}
          next={settingsHref}
          description={settingsCopy.signIn}
        />
      </MySocialLayout>
    );
  }

  const settled = await settleSection(
    () => getNotificationPreferences(viewer.scope),
    {
      deadlineMs: workspaceSectionDeadlineMs(1),
      surface: "notification-settings",
      section: "preferences",
    },
  );
  if (settled.status === "error") {
    return (
      <MySocialLayout {...layout}>
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          title={settingsCopy.loadErrorTitle}
          retryHref={settingsHref}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </MySocialLayout>
    );
  }

  const saved = firstParam(query.saved);
  const preferences = settled.value;
  const social: Array<Exclude<keyof NotificationPreferences, "system">> = [
    "comments",
    "replies",
    "follows",
    "mentions",
    "claims",
  ];

  return (
    <MySocialLayout {...layout}>
      {saved === "1" || saved === "failed" ? (
        <div id="notification-settings-outcome" className="scroll-mt-24">
          <Callout
            tone={saved === "1" ? "success" : "danger"}
            live={saved === "1" ? "polite" : "assertive"}
            data-notification-settings-outcome={
              saved === "1" ? "saved" : "failed"
            }
          >
            <p>{saved === "1" ? settingsCopy.saved : settingsCopy.failed}</p>
          </Callout>
        </div>
      ) : null}
      <form
        method="post"
        action="/api/notifications/preferences"
        data-notification-settings="true"
        className="grid max-w-2xl gap-8"
      >
        <HiddenField name="locale" value={locale} />
        <Fieldset legend={settingsCopy.social}>
          {social.map((key) => (
            <Checkbox
              key={key}
              name={key}
              defaultChecked={preferences[key]}
              label={settingsCopy.options[key]}
            />
          ))}
        </Fieldset>
        <Fieldset legend={settingsCopy.reminders}>
          <Checkbox
            name="system"
            defaultChecked={preferences.system}
            label={settingsCopy.options.system}
            description={settingsCopy.reminderHint}
          />
        </Fieldset>
        <Button type="submit" className="w-fit">
          {settingsCopy.save}
        </Button>
      </form>
    </MySocialLayout>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
