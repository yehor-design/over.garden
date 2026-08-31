import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getStableRegistryExtensionPackCopy } from "@/lib/operator-curation-copy";
import { isStableRegistryExtensionPacksEnabled } from "@/lib/stable-registry/feature-gate";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";
import { readExtensionPackCenter } from "@/server/stable-registry/extension-pack-repository";

import {
  abandonExtensionPackAction,
  activateExtensionPackAction,
  approveExtensionPackPreviewAction,
  decideExtensionPackGroupAction,
} from "../extension-actions";
import { StableRegistryExtensionPackLane } from "./extension-pack-lane";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getStableRegistryExtensionPackCopy(
    await getRequestInterfaceLocale(),
  );
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

export default async function StableRegistryExtensionsPage() {
  const [locale, session] = await Promise.all([
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const copy = getStableRegistryExtensionPackCopy(locale);
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

  const writesEnabled = isStableRegistryExtensionPacksEnabled();
  if (!writesEnabled) {
    return <AccessPanel localeCopy={copy} state="disabled" />;
  }

  const model = await readExtensionPackCenter({ writesEnabled });
  return (
    <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-5 py-8 sm:px-8 [&>*]:min-w-0">
      <header className="flex flex-col gap-3 border-b border-border pb-5">
        <Link
          href="/garden/catalog/registry"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {copy.returnToActiveCatalog}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {copy.description}
        </p>
      </header>
      <StableRegistryExtensionPackLane
        locale={locale}
        model={model}
        decideAction={decideExtensionPackGroupAction}
        approveAction={approveExtensionPackPreviewAction}
        activateAction={activateExtensionPackAction}
        abandonAction={abandonExtensionPackAction}
      />
    </main>
  );
}

function AccessPanel({
  localeCopy: copy,
  state,
}: {
  localeCopy: ReturnType<typeof getStableRegistryExtensionPackCopy>;
  state: "sign-in-required" | "denied" | "disabled";
}) {
  const message =
    state === "sign-in-required"
      ? copy.signInRequired
      : state === "denied"
        ? copy.accessDenied
        : copy.disabled;
  return (
    <main
      data-extension-pack-state={state}
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
    >
      <header className="flex flex-col gap-3 border-b border-border pb-5">
        <Link
          href="/garden/catalog/registry"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {copy.returnToActiveCatalog}
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
