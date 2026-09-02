import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { isStableRegistryReleaseCenterEnabled } from "@/lib/stable-registry/feature-gate";
import {
  getStableRegistryCopy,
  getStableRegistryEditionCopy,
  getStableRegistryExtensionPackCopy,
} from "@/lib/operator-curation-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";
import { readStableRegistryReleaseCenter } from "@/server/stable-registry/release-repository";

import {
  abandonFoundationReleaseAction,
  activateFoundationReleaseAction,
  approveFoundationPreviewAction,
  buildFoundationReleaseAction,
  decideFoundationExceptionGroupAction,
} from "./actions";
import { StableRegistryReleaseCenter } from "./release-center";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getStableRegistryCopy(await getRequestInterfaceLocale());
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

export default async function StableRegistryPage() {
  const [locale, session] = await Promise.all([
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const copy = getStableRegistryCopy(locale);
  const extensionCopy = getStableRegistryExtensionPackCopy(locale);
  const editionCopy = getStableRegistryEditionCopy(locale);
  const userId = session?.user?.id;
  if (!userId) {
    return <AccessPanel localeCopy={copy} state="sign-in-required" />;
  }

  try {
    await assertCatalogCuratorAccess(
      scopedToUser(userId, getSessionId(session)),
    );
  } catch {
    return <AccessPanel localeCopy={copy} state="denied" />;
  }

  const writesEnabled = isStableRegistryReleaseCenterEnabled();
  if (!writesEnabled) {
    return <AccessPanel localeCopy={copy} state="disabled" />;
  }

  const model = await readStableRegistryReleaseCenter({ writesEnabled });
  return (
    <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-5 py-8 sm:px-8 [&>*]:min-w-0">
      <header className="flex flex-col gap-3 border-b border-border pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/garden"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            {copy.returnToCatalog}
          </Link>
          <Link
            href="/garden/catalog/registry/extensions"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            {extensionCopy.title}
          </Link>
          <Link
            href="/garden/catalog/registry/editions"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            {editionCopy.title}
          </Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {copy.description}
        </p>
      </header>
      <StableRegistryReleaseCenter
        locale={locale}
        model={model}
        buildAction={buildFoundationReleaseAction}
        decideAction={decideFoundationExceptionGroupAction}
        approveAction={approveFoundationPreviewAction}
        activateAction={activateFoundationReleaseAction}
        abandonAction={abandonFoundationReleaseAction}
      />
    </main>
  );
}

function AccessPanel({
  localeCopy: copy,
  state,
}: {
  localeCopy: ReturnType<typeof getStableRegistryCopy>;
  state: "sign-in-required" | "denied" | "disabled";
}) {
  const message =
    state === "sign-in-required"
      ? copy.signInRequired
      : state === "denied"
        ? copy.accessDenied
        : copy.releaseCenterDisabled;
  return (
    <main
      data-release-center-state={state}
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
    >
      <header className="flex flex-col gap-3 border-b border-border pb-5">
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {copy.returnToCatalog}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
      </header>
      <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        {message}
      </p>
    </main>
  );
}
