import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  buildAuthIntentResumeHref,
  type AuthIntentAction,
  type AuthIntentTarget,
} from "@/lib/auth/auth-intent-contract";
import { cn } from "@/lib/utils";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { HiddenField } from "@/components/ui/hidden-field";

interface AuthIntentTriggerProps {
  action: AuthIntentAction;
  returnTo: string;
  target?: AuthIntentTarget;
  control?: string;
  label: string;
  labelClassName?: string;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  formClassName?: string;
  autoFocus?: boolean;
  id?: string;
}

/**
 * The control a signed-out reader presses to do something that needs an account.
 *
 * Still a POST to `/auth/intent/start` when it carries a target: only a signed
 * token can name the exact comment or object to resume, and a query parameter
 * would let anyone hand somebody else a crafted resume. Without a target there
 * is nothing to sign, so it is a plain link to the one sign-in screen — which
 * also means it works with JavaScript switched off and with no round trip.
 *
 * Either way the reader comes back to the thing they pressed, not to the page
 * that contains it. Both carry `data-auth-intent-guest`: a page drawn with a
 * guest's control as a stand-in for a member's (a community's static shell)
 * must not have the stand-in focused on return, or Enter starts signing in
 * again (`OVE-504`). The return path is the resume href the intent contract
 * builds, so `create_entry` lands on the composer at
 * `/garden?authIntent=create_entry#first-entry-composer` and
 * `useScrollToHashOnMount` puts it in front of them. Sending them to `/garden`
 * bare would make signing in cost one press and then another — the same extra
 * step the header's hard-coded `/garden` used to cost before the form.
 */
export function AuthIntentTrigger({
  action,
  returnTo,
  target,
  control,
  label,
  labelClassName,
  icon,
  variant = "primary",
  size = "md",
  className,
  formClassName,
  autoFocus = false,
  id,
}: AuthIntentTriggerProps) {
  if (!target) {
    return (
      <Link
        id={id}
        href={buildSignInHref({
          returnTo: buildAuthIntentResumeHref({ action, returnTo, control }),
          intent: action,
        })}
        data-auth-intent-control={action}
        data-auth-intent-guest="true"
        className={cn(buttonVariants({ variant, size }), className)}
      >
        {icon}
        <span className={labelClassName}>{label}</span>
      </Link>
    );
  }

  return (
    <form method="post" action="/auth/intent/start" className={formClassName}>
      <HiddenField name="action" value={action} />
      <HiddenField name="returnTo" value={returnTo} />
      <HiddenField name="targetKind" value={target.kind} />
      <HiddenField name="targetRef" value={target.ref} />
      {control ? <HiddenField name="control" value={control} /> : null}
      <button
        id={id}
        type="submit"
        autoFocus={autoFocus}
        data-auth-intent-control={action}
        data-auth-intent-control-ref={control}
        data-auth-intent-guest="true"
        className={cn(buttonVariants({ variant, size }), className)}
      >
        {icon}
        <span className={labelClassName}>{label}</span>
      </button>
    </form>
  );
}
