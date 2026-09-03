import Link from "next/link";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getStableRegistryCopy,
  getStableRegistryEditionCopy,
  getStableRegistryExtensionPackCopy,
} from "@/lib/operator-curation-copy";

/**
 * The three registry surfaces, each as one shell its page and its `loading.tsx`
 * both render (ADR-0023). Keeping the header in one place is what makes the
 * skeleton and the finished page agree; before this they were separate JSX and
 * a child route inherited a sibling's heading.
 */

export const STABLE_REGISTRY_PATH = "/garden/catalog/registry";
export const STABLE_REGISTRY_EXTENSIONS_PATH =
  "/garden/catalog/registry/extensions";
export const STABLE_REGISTRY_EDITIONS_PATH =
  "/garden/catalog/registry/editions";

export function StableRegistryNavigation({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getStableRegistryCopy(locale);
  const extensionCopy = getStableRegistryExtensionPackCopy(locale);
  const editionCopy = getStableRegistryEditionCopy(locale);

  return (
    <>
      <Link href="/garden" className={buttonVariants({ variant: "outline" })}>
        {copy.returnToCatalog}
      </Link>
      <Link
        href={STABLE_REGISTRY_EXTENSIONS_PATH}
        className={buttonVariants({ variant: "outline" })}
      >
        {extensionCopy.title}
      </Link>
      <Link
        href={STABLE_REGISTRY_EDITIONS_PATH}
        className={buttonVariants({ variant: "outline" })}
      >
        {editionCopy.title}
      </Link>
    </>
  );
}

export function StableRegistryReturnLink({
  locale,
  label,
}: {
  locale: InterfaceLocale;
  label: string;
}) {
  void locale;
  return (
    <Link
      href={STABLE_REGISTRY_PATH}
      className={buttonVariants({ variant: "outline" })}
    >
      {label}
    </Link>
  );
}

export function StableRegistryShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getStableRegistryCopy(locale);
  return (
    <WorkspaceShell
      surface="stable-registry"
      locale={locale}
      state={state}
      width="wide"
      title={copy.title}
      description={copy.description}
      navigation={<StableRegistryNavigation locale={locale} />}
    >
      {children}
    </WorkspaceShell>
  );
}

export function StableRegistryExtensionsShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getStableRegistryExtensionPackCopy(locale);
  return (
    <WorkspaceShell
      surface="stable-registry-extensions"
      locale={locale}
      state={state}
      width="wide"
      title={copy.title}
      description={copy.description}
      navigation={
        <StableRegistryReturnLink
          locale={locale}
          label={copy.returnToActiveCatalog}
        />
      }
    >
      {children}
    </WorkspaceShell>
  );
}

export function StableRegistryEditionsShell({
  locale,
  state,
  children,
}: {
  locale: InterfaceLocale;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getStableRegistryEditionCopy(locale);
  return (
    <WorkspaceShell
      surface="stable-registry-editions"
      locale={locale}
      state={state}
      width="wide"
      title={copy.title}
      description={copy.description}
      navigation={
        <StableRegistryReturnLink
          locale={locale}
          label={copy.keepCurrentRelease}
        />
      }
    >
      {children}
    </WorkspaceShell>
  );
}
