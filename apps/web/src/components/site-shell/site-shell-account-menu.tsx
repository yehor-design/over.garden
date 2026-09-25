"use client";

import Link from "next/link";

import { SignOutControl } from "@/components/auth/sign-out-control";
import { UserIcon as UserRound } from "@/components/icons/User";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  getOperatorMenuCopy,
  OPERATOR_MENU_LINKS,
} from "@/lib/operator-menu-copy";
import type {
  SiteShellNavigation,
  SiteShellNavigationKey,
} from "@/lib/site-shell-navigation";

/**
 * Account utilities stay separate from the four primary destinations on
 * desktop and mobile alike.
 */
const ACCOUNT_MENU_PERSONAL_KEYS = new Set<SiteShellNavigationKey>([
  "bookmarks",
  "lineage-claims",
]);

/**
 * A signed-in reader's account menu, in its own module (`OVE-468`): `base-ui`'s
 * menu — positioning, list navigation, dismissal — is code a guest never runs,
 * and it used to be in every page's script. The shell draws a button that looks
 * and is named the same, and mounts this, open, on the first press.
 */
export function SiteShellAccountMenu({
  locale,
  navigation,
  hasOperatorAccess,
  privacyHref,
  compact,
  defaultOpen,
}: {
  locale: InterfaceLocale;
  navigation: SiteShellNavigation;
  hasOperatorAccess: boolean;
  privacyHref: string;
  compact: boolean;
  defaultOpen: boolean;
}) {
  const copy = getInterfaceCopy(locale);
  const operatorCopy = getOperatorMenuCopy(locale);

  return (
    <Menu defaultOpen={defaultOpen}>
      <MenuTrigger
        data-site-shell-account-menu-trigger="true"
        render={
          <Button
            variant="ghost"
            aria-label={compact ? navigation.labels.openAccount : undefined}
            className={
              compact ? "min-h-11 min-w-11 px-2" : "w-full justify-start"
            }
          >
            <UserRound aria-hidden="true" />
            {compact ? null : navigation.labels.accountRegion}
          </Button>
        }
      />
      {/* Four groups, in the order a reader looks for them (`OVE-456`): their
          own pages, the settings that govern their account, the owner's tools
          under the sealed role, and the way out. It used to be one link and a
          sign-out, with the personal pages reachable only from the rail — so a
          reader on a phone, where there is no rail, had no way to them at all. */}
      <MenuContent
        data-site-shell-account-menu="true"
        align="start"
        side="top"
        className="min-w-56"
      >
        <MenuGroup data-site-shell-account-pages="true">
          <MenuGroupLabel>{copy.shell.accountPagesSection}</MenuGroupLabel>
          <AccountMenuLink href="/garden/profile">
            {copy.navigation.publicProfile}
          </AccountMenuLink>
          {navigation.utilityItems
            .filter((item) => ACCOUNT_MENU_PERSONAL_KEYS.has(item.key))
            .map((item) => (
              <AccountMenuLink key={item.key} href={item.href}>
                {item.label}
              </AccountMenuLink>
            ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup data-site-shell-account-settings="true">
          <MenuGroupLabel>{copy.shell.accountSettingsSection}</MenuGroupLabel>
          {/* The account's own settings and its sign-in, each a page of its
              own since `OVE-503` — they used to sit under the public profile's
              form, below the handle and the avatar. */}
          <AccountMenuLink href="/account/settings">
            {copy.shell.accountSettings}
          </AccountMenuLink>
          <AccountMenuLink href="/account/security">
            {copy.shell.accountSecurity}
          </AccountMenuLink>
          <AccountMenuLink href={privacyHref}>
            {copy.shell.privacy}
          </AccountMenuLink>
          <AccountMenuLink href="/erasure">
            {copy.shell.erasureRequest}
          </AccountMenuLink>
        </MenuGroup>
        {hasOperatorAccess ? (
          <>
            <MenuSeparator />
            <MenuGroup data-site-shell-operator-menu="true">
              <MenuGroupLabel>{operatorCopy.sectionTitle}</MenuGroupLabel>
              {OPERATOR_MENU_LINKS.map((link) => (
                <AccountMenuLink key={link.href} href={link.href}>
                  {operatorCopy.links[link.key]}
                </AccountMenuLink>
              ))}
            </MenuGroup>
          </>
        ) : null}
        <MenuSeparator />
        <SignOutControl presentation="menu" />
      </MenuContent>
    </Menu>
  );
}

function AccountMenuLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-body-sm text-text outline-none hover:bg-action-subtle hover:text-action-subtle-text focus-visible:bg-action-subtle focus-visible:text-action-subtle-text"
    >
      {children}
    </Link>
  );
}
