import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Leaf, Lock, MailWarning, NotebookPen } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { verifyPilotInviteToken } from "@/lib/garden/pilot-invite";
import { localizedPath } from "@/lib/public-localization";
import {
  getTrustSurfaceCopy,
  type TrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { claimPilotInviteAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getTrustSurfaceCopy(await getRequestInterfaceLocale()).join;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

type JoinSearchParams = Record<string, string | string[] | undefined>;
const EMPTY_JOIN_SEARCH_PARAMS: JoinSearchParams = {};

interface JoinPageProps {
  searchParams?: Promise<JoinSearchParams>;
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const [params, locale] = await Promise.all([
    searchParams ?? Promise.resolve(EMPTY_JOIN_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);
  const copy = getTrustSurfaceCopy(locale).join;
  const token = normalizeFirstParam(params.invite);
  const hasValidInvite =
    token.length > 0 && verifyPilotInviteToken(token) !== null;

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-5 py-10 sm:px-8"
    >
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>

      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <p className="text-sm font-medium text-muted-foreground">
          {copy.eyebrow}
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {copy.title}
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          {copy.intro}
        </p>

        {hasValidInvite ? (
          <div className="flex flex-wrap items-center gap-3">
            <form action={claimPilotInviteAction}>
              <input type="hidden" name="invite" value={token} />
              <button type="submit" className={buttonVariants({ size: "lg" })}>
                <Leaf className="size-4" />
                {copy.openGarden}
                <ArrowRight className="size-4" />
              </button>
            </form>
            <Link
              href={localizedPath(locale, "/privacy")}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {copy.privacy}
            </Link>
          </div>
        ) : (
          <InviteNeededCallout
            copy={copy}
            privacyHref={localizedPath(locale, "/privacy")}
          />
        )}
      </header>

      <section className="grid gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {copy.expectTitle}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
              <NotebookPen className="size-4" />
              {copy.expectations[0].title}
            </dt>
            <dd className="text-sm leading-6 text-muted-foreground">
              {copy.expectations[0].description}
            </dd>
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Lock className="size-4" />
              {copy.expectations[1].title}
            </dt>
            <dd className="text-sm leading-6 text-muted-foreground">
              {copy.expectations[1].description}
            </dd>
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Leaf className="size-4" />
              {copy.expectations[2].title}
            </dt>
            <dd className="text-sm leading-6 text-muted-foreground">
              {copy.expectations[2].description}
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-3 rounded-lg border border-border p-5">
        <h2 className="text-base font-semibold text-foreground">
          {copy.pilotTitle}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.pilotDescription}
        </p>
        {hasValidInvite ? (
          <form action={claimPilotInviteAction}>
            <input type="hidden" name="invite" value={token} />
            <button
              type="submit"
              className="text-left text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {copy.saveFirstNote}
            </button>
          </form>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.waitingDescription}
          </p>
        )}
      </section>
    </main>
  );
}

function InviteNeededCallout({
  copy,
  privacyHref,
}: {
  copy: TrustSurfaceCopy["join"];
  privacyHref: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <MailWarning className="size-4" />
        {copy.invalidTitle}
      </p>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {copy.invalidDescription}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          <Leaf className="size-4" />
          {copy.explorePublic}
          <ArrowRight className="size-4" />
        </Link>
        <Link
          href={privacyHref}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          {copy.privacy}
        </Link>
      </div>
    </div>
  );
}

function normalizeFirstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}
