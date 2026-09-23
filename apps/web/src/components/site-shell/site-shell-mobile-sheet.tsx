"use client";

import { useState } from "react";

import { SignOutControl } from "@/components/auth/sign-out-control";
import { ListIcon as MenuIcon } from "@/components/icons/List";
import { IconButton } from "@/components/ui/icon-button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { SiteShellNavigation } from "@/lib/site-shell-navigation";

import { ShellPathnameRegion } from "./shell-session";
import {
  SiteShellMobileUtilities,
  SiteShellNavigationList,
} from "./site-shell-navigation";

/**
 * The narrow bar's menu, in its own module (`OVE-468`): the sheet's dialog —
 * focus trap, scroll lock, dismissal — is code a reader needs only once they
 * open it, and it used to be in every page's script. The shell draws a button
 * that looks and is named the same, and mounts this, open, on the first press.
 * It owns whether it is open; the chrome does not.
 */
export function SiteShellMobileSheet({
  navigation,
  isAuthenticated,
  defaultOpen,
}: {
  navigation: SiteShellNavigation;
  isAuthenticated: boolean;
  defaultOpen: boolean;
}) {
  const [open, onOpenChange] = useState(defaultOpen);
  const privacy = navigation.footerLinks.find((link) => link.key === "privacy");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <IconButton
            variant="ghost"
            data-cwv-interaction-target="site-menu"
            label={navigation.labels.openMenu}
          />
        }
      >
        <MenuIcon aria-hidden="true" />
      </SheetTrigger>
      <SheetContent
        side="left"
        closeLabel={navigation.labels.closeMenu}
        className="w-4/5 max-w-xs gap-0 p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>{navigation.labels.menuTitle}</SheetTitle>
          <SheetDescription>
            {navigation.labels.menuDescription}
          </SheetDescription>
        </SheetHeader>
        {/* The sheet opens on a press, so by then the address is always
            known; the region is what keeps this component from reading it
            while the closed trigger is being prerendered. */}
        <ShellPathnameRegion
          render={(pathname) => (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
              <SiteShellNavigationList
                items={navigation.publicItems}
                pathname={pathname}
                compact
                ariaLabel={navigation.labels.siteNavigation}
              />
              {navigation.personalItems.length > 0 ? (
                <SiteShellNavigationList
                  items={navigation.personalItems}
                  pathname={pathname}
                  compact
                  ariaLabel={navigation.labels.personalSection}
                />
              ) : null}
            </div>
          )}
        />
        <div className="mt-auto flex flex-col gap-3 border-t border-border p-4">
          <SiteShellMobileUtilities
            privacyHref={privacy?.href ?? "/privacy"}
            privacyLabel={privacy?.label ?? ""}
          >
            {isAuthenticated ? (
              <SignOutControl
                presentation="menu"
                onBeforeRequest={() => onOpenChange(false)}
              />
            ) : null}
          </SiteShellMobileUtilities>
        </div>
      </SheetContent>
    </Sheet>
  );
}
