import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { GardenAuthPanel } from "@/app/garden/garden-auth-panel";
import { buttonVariants } from "@/components/ui/button";
import type { OperatorCopy } from "@/lib/operator-copy";
import { formatOperatorTemplate, getOperatorCopy } from "@/lib/operator-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { listCommunityModerationQueue } from "@/server/community-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";

export const dynamic = "force-dynamic";

const FIRST_COMMUNITY_SLUG = "observation-and-care";

export default async function CommunityModerationDirectory() {
  const [locale, session] = await Promise.all([
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const copy = getOperatorCopy(locale);
  if (!session?.user?.id) {
    return (
      <main className="mx-auto grid w-full max-w-5xl gap-5 px-5 py-8">
        <AdminCommunityHeader copy={copy} />
        <GardenAuthPanel locale={locale} postAuthPath="/admin/communities" />
      </main>
    );
  }

  const scope = scopedToUser(session.user.id, getSessionId(session));
  const moderation = await listCommunityModerationQueue(
    scope,
    FIRST_COMMUNITY_SLUG,
  ).catch(() => null);

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 px-5 py-8">
      <AdminCommunityHeader copy={copy} />
      {moderation ? (
        <Link
          href={`/admin/communities/${FIRST_COMMUNITY_SLUG}`}
          className="grid min-h-36 max-w-xl content-between gap-5 rounded-md border border-border p-4 transition-colors hover:border-primary/45 hover:bg-muted/30"
        >
          <span className="grid gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            <span className="text-lg font-semibold">
              {copy.community.observationAndCare}
            </span>
            <span className="text-sm leading-6 text-muted-foreground">
              {copy.community.cardDescription}
            </span>
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatOperatorTemplate(copy.community.openReportsCount, {
              count: moderation.items.length,
            })}
          </span>
        </Link>
      ) : (
        <p
          className="rounded-md border border-border p-4 text-sm text-muted-foreground"
          role="alert"
        >
          {copy.community.unavailable}
        </p>
      )}
    </main>
  );
}

function AdminCommunityHeader({ copy }: { copy: OperatorCopy }) {
  return (
    <header className="grid gap-4 border-b border-border pb-5">
      <Link
        href="/admin"
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "w-fit",
        })}
      >
        {copy.community.backToAdmin}
      </Link>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold">{copy.community.title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.community.description}
        </p>
      </div>
    </header>
  );
}
