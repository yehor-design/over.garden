import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import type {
  AuthIntentAction,
  AuthIntentTarget,
} from "@/lib/auth/auth-intent-contract";
import { cn } from "@/lib/utils";

interface AuthIntentTriggerProps {
  action: AuthIntentAction;
  returnTo: string;
  target?: AuthIntentTarget;
  control?: string;
  label: string;
  labelClassName?: string;
  icon?: ReactNode;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
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
 */
export function AuthIntentTrigger({
  action,
  returnTo,
  target,
  control,
  label,
  labelClassName,
  icon,
  variant = "default",
  size = "default",
  className,
  formClassName,
  autoFocus = false,
  id,
}: AuthIntentTriggerProps) {
  if (!target) {
    return (
      <Link
        id={id}
        href={`/auth/sign-in?next=${encodeURIComponent(returnTo)}&intent=${encodeURIComponent(action)}`}
        data-auth-intent-control={action}
        className={cn(buttonVariants({ variant, size }), className)}
      >
        {icon}
        <span className={labelClassName}>{label}</span>
      </Link>
    );
  }

  return (
    <form method="post" action="/auth/intent/start" className={formClassName}>
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="targetKind" value={target.kind} />
      <input type="hidden" name="targetRef" value={target.ref} />
      {control ? <input type="hidden" name="control" value={control} /> : null}
      <button
        id={id}
        type="submit"
        autoFocus={autoFocus}
        data-auth-intent-control={action}
        data-auth-intent-control-ref={control}
        className={cn(buttonVariants({ variant, size }), className)}
      >
        {icon}
        <span className={labelClassName}>{label}</span>
      </button>
    </form>
  );
}
