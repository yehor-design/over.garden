import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { OperatorCopy } from "@/lib/operator-copy";
import { formatOperatorTemplate, getOperatorCopy } from "@/lib/operator-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolveAdminCapabilityAccessBounded } from "@/server/admin-access";
import { listCommunityModerationQueue } from "@/server/community-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";

const FIRST_COMMUNITY_SLUG = "observation-and-care";

export default async function CommunityModerationDirectory() {
  const [locale, session] = await Promise.all([
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const copy = getOperatorCopy(locale);
  if (!session?.user?.id) {
    return (
      <main
        lang={locale}
        className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-8"
      >
        <AdminCommunityHeader copy={copy} />
        <SignInPrompt locale={locale} next={"/account/communities"} />
      </main>
    );
  }

  const scope = scopedToUser(session.user.id, getSessionId(session));
  const access = await resolveAdminCapabilityAccessBounded(
    scope,
    "operator:mutate",
  );
  const moderation =
    access.status === "allowed"
      ? await listCommunityModerationQueue(scope, FIRST_COMMUNITY_SLUG).catch(
          () => null,
        )
      : null;

  return (
    <main
      lang={locale}
      className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-8"
    >
      <AdminCommunityHeader copy={copy} />
      {moderation ? (
        <Card
          as="article"
          interactive
          className="relative grid max-w-xl gap-3 p-4"
        >
          <ShieldCheck className="size-5 text-action" aria-hidden="true" />
          <h2 className="text-h3 text-text-heading">
            <Link
              href={`/account/communities/${FIRST_COMMUNITY_SLUG}`}
              data-private-moderation-queue="true"
              className="rounded-sm outline-none before:absolute before:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {copy.community.observationAndCare}
            </Link>
          </h2>
          <p className="text-body-sm leading-6 text-text-muted">
            {copy.community.cardDescription}
          </p>
          {/* A count of zero is the absence of a fact, not a fact
              (DESIGN.md §5.10): an empty queue says so in words instead. */}
          {moderation.items.length > 0 ? (
            <Badge tone="warning">
              {formatOperatorTemplate(copy.community.openReportsCount, {
                count: moderation.items.length,
              })}
            </Badge>
          ) : (
            <Badge tone="success">{copy.community.noReports}</Badge>
          )}
        </Card>
      ) : (
        <Callout
          tone="warning"
          role="alert"
          data-operator-access-state="unavailable"
        >
          <p>{copy.community.unavailable}</p>
        </Callout>
      )}
    </main>
  );
}

function AdminCommunityHeader({ copy }: { copy: OperatorCopy }) {
  return (
    <PageHeader
      breadcrumb={
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "secondary",
            size: "sm",
            className: "w-fit",
          })}
        >
          {copy.community.backToGarden}
        </Link>
      }
      title={copy.community.title}
      description={copy.community.description}
    />
  );
}
